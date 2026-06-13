import { listAgendaEvents, listAgendaEventsAsync, type AgendaEvent } from "./agenda";
import { listCentralExecutions, type CentralExecution } from "./centralExecutions";
import { FALLBACK_WORKSPACE_ID, listClients, listClientsAsync, type Client } from "./clients";
import { financeMatchesView, formatCurrency, formatDate, getDelinquentClients, listFinancialRecords, listFinancialRecordsAsync, sumFinancialAmount, type FinancialRecord } from "./finance";
import { listPartnerships, listPartnershipsAsync, type ProcessPartnership } from "./partnerships";
import { listProcesses, listProcessesAsync, type Process } from "./processes";
import { listReports, listReportsAsync, type Report } from "./reports";
import { listTasks, listTasksAsync, resolveEffectiveTaskStatus, type Task } from "./tasks";
import { shouldUseWorkspaceSupabase } from "./source";
import { promptTemplates } from "./centralOperations";

export type PartnersDashboardPeriod = "hoje" | "7d" | "30d" | "mes" | "todos";
export type PartnersDashboardCardId =
  | "clients_attention"
  | "processes_risk"
  | "tasks_overdue"
  | "deadlines_urgent"
  | "finance_overdue"
  | "partnerships_transfer"
  | "reports_generated"
  | "central_usage";

export type PartnersDashboardListItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  route: string;
  actionLabel: string;
};

export type PartnersDashboardCard = {
  id: PartnersDashboardCardId;
  title: string;
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "urgent" | "positive" | "premium";
  listTitle: string;
  emptyText: string;
  items: PartnersDashboardListItem[];
};

export type ExecutiveInsight = {
  title: string;
  description: string;
  impact: string;
  priority: "Baixa" | "Média" | "Alta";
  suggestedAction: string;
  source: string;
  route: string;
  actionLabel: string;
};

export type PartnersDashboardData = {
  generatedAt: string;
  period: PartnersDashboardPeriod;
  responsible: string;
  responsibleOptions: string[];
  cards: PartnersDashboardCard[];
  health: {
    status: "Estável" | "Em atenção" | "Sobrecarregado" | "Crítico";
    score: number;
    mainBottleneck: string;
    mainFinancialRisk: string;
    mainDeadlineRisk: string;
    busiestModule: string;
    weeklyRecommendation: string;
  };
  metrics: {
    clients: Record<string, number>;
    processes: Record<string, number>;
    partnerships: Record<string, number>;
    tasks: Record<string, number>;
    agenda: Record<string, number>;
    finance: Record<string, number | string>;
    reports: Record<string, number | string>;
    central: Record<string, number>;
    prompts: Record<string, number>;
  };
  bottlenecks: ExecutiveInsight[];
  risks: ExecutiveInsight[];
  decisionsToday: ExecutiveInsight[];
  recommendations: ExecutiveInsight[];
  teamCapacity: Array<{ responsible: string; openTasks: number; urgentTasks: number; status: string; guidance: string }>;
  lists: Record<PartnersDashboardCardId, PartnersDashboardListItem[]>;
  latestReport?: Report;
};

type PartnersSourceData = {
  allClients: Client[];
  allProcesses: Process[];
  allPartnerships: ProcessPartnership[];
  allTasks: Task[];
  allAgenda: AgendaEvent[];
  allFinance: FinancialRecord[];
  allReports: Report[];
  allExecutions: CentralExecution[];
  prompts: ManagedPromptSnapshot[];
  isRealSupabase: boolean;
};

type ManagedPromptSnapshot = {
  status?: "ativo" | "rascunho" | "arquivado";
  level?: string;
  name?: string;
  updatedAt?: string;
};

const PROMPTS_STORAGE_KEY = "lexos-control:central-prompts-manager:v1";
const today = () => new Date();

function isBrowser() {
  return typeof window !== "undefined";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDate(value?: string) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value}T12:00:00`);
}

function getPeriodRange(period: PartnersDashboardPeriod) {
  const now = today();
  if (period === "todos") return null;
  if (period === "hoje") return { start: startOfDay(now), end: endOfDay(now) };
  if (period === "7d") return { start: startOfDay(now), end: endOfDay(addDays(now, 7)) };
  if (period === "30d") return { start: startOfDay(now), end: endOfDay(addDays(now, 30)) };
  return { start: startOfMonth(now), end: endOfDay(now) };
}

function withinPeriod(value: string | undefined, period: PartnersDashboardPeriod) {
  const range = getPeriodRange(period);
  if (!range) return true;
  const date = parseDate(value);
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

function dueWithin(days: number, value?: string) {
  const date = parseDate(value);
  if (!date) return false;
  const now = startOfDay(today());
  return date >= now && date <= endOfDay(addDays(now, days));
}

function daysSince(value?: string) {
  const date = parseDate(value);
  if (!date) return 0;
  return Math.floor((today().getTime() - date.getTime()) / 86400000);
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchesResponsible(value: string | undefined, responsible: string) {
  return responsible === "todos" || normalizeText(value ?? "").includes(normalizeText(responsible));
}

function item(id: string, title: string, subtitle: string, meta: string, status: string, route: string, actionLabel: string): PartnersDashboardListItem {
  return { id, title, subtitle, meta, status, route, actionLabel };
}

function loadPromptSnapshots(): ManagedPromptSnapshot[] {
  if (!isBrowser()) {
    return promptTemplates.map((template, index) => ({ name: template.title, status: "ativo", level: index % 3 === 0 ? "estratégico" : "intermediário" }));
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROMPTS_STORAGE_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed) && parsed.length) return parsed.filter((entry): entry is ManagedPromptSnapshot => Boolean(entry && typeof entry === "object"));
  } catch {
    // Mantém fallback determinístico da biblioteca demo.
  }
  return promptTemplates.map((template, index) => ({ name: template.title, status: "ativo", level: index % 3 === 0 ? "estratégico" : "intermediário" }));
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {} as Record<T, number>);
}

function applyResponsibleFilter<T>(items: T[], responsible: string, resolve: (item: T) => string | undefined) {
  return items.filter((entry) => matchesResponsible(resolve(entry), responsible));
}

function applyPeriodFilter<T>(items: T[], period: PartnersDashboardPeriod, resolve: (item: T) => string | undefined) {
  return items.filter((entry) => withinPeriod(resolve(entry), period));
}

function buildClientExecutiveNarrative(client: Client) {
  const pending = (client.main_pending || "pendência relevante em aberto").toLowerCase();
  if (pending.includes("aditivo") || pending.includes("minuta")) return "Risco: atraso em fechamento estratégico e ruído na governança da carteira. Ação sugerida: sócio validar minuta final ou delegar revisão com prazo fechado.";
  if (pending.includes("comprovante") || pending.includes("certid") || pending.includes("procura") || pending.includes("document")) return "Risco: atraso de instrução documental e impacto em prazo processual/comercial. Ação sugerida: contato objetivo com checklist e data de retorno.";
  if (pending.includes("escopo") || pending.includes("proposta") || pending.includes("diagn")) return "Risco: desalinhamento de expectativa entre frente jurídica e comercial. Ação sugerida: sócio confirmar escopo e registrar providência no recorte.";
  if (pending.includes("contrato") || pending.includes("social") || pending.includes("due diligence")) return "Risco: bloqueio de due diligence, repasse ou avanço de cobrança consultiva. Ação sugerida: alinhar responsável e prazo de envio documental.";
  return "Risco: perda de previsibilidade no relacionamento e atraso de providências críticas. Ação sugerida: contato do sócio para definir responsável e próximo passo.";
}


function buildPartnersDashboardDataFromSource(options: { period?: PartnersDashboardPeriod; responsible?: string }, source: PartnersSourceData): PartnersDashboardData {
  const period = options.period ?? "todos";
  const responsible = options.responsible ?? "todos";
  const { allClients, allProcesses, allPartnerships, allTasks, allAgenda, allFinance, allReports, allExecutions, prompts, isRealSupabase } = source;

  const clients = applyPeriodFilter(applyResponsibleFilter(allClients, responsible, (client) => client.owner), period, (client) => client.updated_at);
  const processes = applyPeriodFilter(applyResponsibleFilter(allProcesses, responsible, (process) => process.responsible), period, (process) => process.next_deadline_at ?? process.updated_at);
  const partnerships = applyPeriodFilter(applyResponsibleFilter(allPartnerships, responsible, (partnership) => partnership.internal_responsible), period, (partnership) => partnership.expected_end_date ?? partnership.updated_at);
  const tasks = applyPeriodFilter(applyResponsibleFilter(allTasks, responsible, (task) => task.responsible), period, (task) => task.due_at ?? task.updated_at);
  const agenda = applyPeriodFilter(applyResponsibleFilter(allAgenda, responsible, (event) => event.responsible), period, (event) => event.starts_at);
  const finance = applyPeriodFilter(applyResponsibleFilter(allFinance, responsible, (record) => record.responsible), period, (record) => record.due_at ?? record.updated_at);
  const reports = applyPeriodFilter(applyResponsibleFilter(allReports, responsible, (report) => report.responsible), period, (report) => report.created_at);
  const executions = applyPeriodFilter(allExecutions, period, (execution) => execution.created_at);

  const effectiveTasks = tasks.map((task) => ({ task, status: resolveEffectiveTaskStatus(task) }));
  const activeClients = clients.filter((client) => client.status === "ativo");
  const attentionClients = clients.filter((client) => client.status === "atenção" || daysSince(client.last_contact_at) >= 7);
  const noReturnClients = clients.filter((client) => daysSince(client.last_contact_at) >= 7 && client.status !== "inativo");
  const activeProcesses = processes.filter((process) => !["arquivado", "encerrado"].includes(process.status));
  const riskProcesses = processes.filter((process) => ["alto", "crítico"].includes(process.risk) && process.status !== "arquivado");
  const deadlineEvents = agenda.filter((event) => event.status !== "cancelado" && event.status !== "arquivado" && (event.type === "prazo" || event.source === "task" || event.source === "process"));
  const processDeadlineItems = processes.filter((process) => process.status !== "arquivado" && dueWithin(7, process.next_deadline_at));
  const urgentDeadlines = deadlineEvents.filter((event) => ["urgente", "alta"].includes(event.priority) && dueWithin(7, event.starts_at));
  const overdueTasks = effectiveTasks.filter(({ status }) => status === "atrasada").map(({ task }) => task);
  const urgentTasks = effectiveTasks.filter(({ task, status }) => task.priority === "urgente" && !["concluida", "arquivada"].includes(status)).map(({ task }) => task);
  const taskDeadlineItems = urgentTasks.filter((task) => dueWithin(7, task.due_at));
  const urgentDeadlineList = [
    ...urgentDeadlines.map((event) => item(event.id, event.title, event.description, `${event.responsible} • ${formatDate(event.starts_at)}`, event.priority, event.source_route ?? (event.process_id ? `/processos/${event.process_id}` : "/agenda"), event.source === "process" ? "Abrir processo" : event.source === "task" ? "Abrir tarefa" : "Abrir agenda")),
    ...taskDeadlineItems.map((task) => item(task.id, task.title, task.description, `${task.responsible} • vence ${formatDate(task.due_at)}`, task.priority, `/tarefas?taskId=${task.id}`, "Abrir tarefa")),
    ...processDeadlineItems.map((process) => item(process.id, process.title, process.main_issue, `${process.responsible} • prazo ${formatDate(process.next_deadline_at)}`, process.risk, `/processos?processId=${process.id}`, "Abrir processo")),
  ];
  const urgentDeadlineCount = urgentDeadlineList.length;
  const reviewTasks = effectiveTasks.filter(({ status }) => ["em_revisao", "aguardando"].includes(status)).map(({ task }) => task);
  const completedThisWeek = tasks.filter((task) => task.completed_at && withinPeriod(task.completed_at, "7d"));
  const overdueFinance = finance.filter((record) => financeMatchesView(record, "vencidos"));
  const receivableFinance = finance.filter((record) => record.direction === "entrada" && ["previsto", "pendente", "aguardando", "vencido"].includes(record.status));
  const pendingCollections = finance.filter((record) => record.direction === "entrada" && ["pendente", "vencido"].includes(record.status));
  const receivedMonth = finance.filter((record) => financeMatchesView(record, "recebidos"));
  const delinquentClients = getDelinquentClients(finance);
  const transferPartnerships = partnerships.filter((partnership) => partnership.status === "aguardando_repasse" || ["repasse_pendente", "repasse_parcial"].includes(partnership.repasse_status));
  const documentPartnerships = partnerships.filter((partnership) => partnership.status === "aguardando_documento");
  const activePartnerships = partnerships.filter((partnership) => ["ativa", "em_execucao"].includes(partnership.status));
  const weekReports = reports.filter((report) => withinPeriod(report.created_at, "7d"));
  const archivedReports = reports.filter((report) => report.status === "archived" || Boolean(report.archived_at));
  const operationalReports = reports.filter((report) => ["socios_operacional", "operacional_semanal", "semanal", "mensal", "carteira_processos", "tarefas_prazos"].includes(report.type));
  const financialReports = reports.filter((report) => ["financeiro", "inadimplencia"].includes(report.type));

  const lists: Record<PartnersDashboardCardId, PartnersDashboardListItem[]> = {
    clients_attention: attentionClients.map((client) => item(client.id, client.name, `Motivo: ${client.main_pending}. ${buildClientExecutiveNarrative(client)}`, `${client.owner} • último contato ${formatDate(client.last_contact_at)}`, client.status, `/clientes/${client.id}`, "Abrir cliente")),
    processes_risk: riskProcesses.map((process) => item(process.id, process.title, process.main_issue, `${process.responsible} • prazo ${formatDate(process.next_deadline_at)}`, process.risk, `/processos/${process.id}`, "Abrir processo")),
    tasks_overdue: overdueTasks.map((task) => item(task.id, task.title, task.description, `${task.responsible} • vence ${formatDate(task.due_at)}`, resolveEffectiveTaskStatus(task), `/tarefas?taskId=${task.id}`, "Abrir tarefa")),
    deadlines_urgent: urgentDeadlineList,
    finance_overdue: overdueFinance.map((record) => item(record.id, record.title, record.client_name ?? "Registro financeiro", `${formatCurrency(record.amount)} • vence ${formatDate(record.due_at)}`, record.status, `/financeiro?view=vencidos&financeId=${record.id}`, "Abrir financeiro")),
    partnerships_transfer: transferPartnerships.map((partnership) => item(partnership.id, partnership.partner_name, partnership.main_pending, `${partnership.partner_firm} • ${formatCurrency((partnership.expected_amount ?? 0) - (partnership.paid_amount ?? 0))} em aberto`, partnership.repasse_status, `/processos/parcerias?partnershipId=${partnership.id}`, "Abrir parceria")),
    reports_generated: reports.map((report) => item(report.id, report.title, report.summary, `${report.type} • ${formatDate(report.created_at)}`, report.status, `/relatorios?reportId=${report.id}`, "Abrir relatório")),
    central_usage: executions.map((execution) => item(execution.id, execution.title, execution.input_summary, `${execution.type} • ${formatDate(execution.created_at)}`, execution.status, "/central-lexos", "Abrir Central LEX.OS")),
  };

  const cards: PartnersDashboardCard[] = [
    { id: "clients_attention", title: "Clientes exigindo atenção", value: String(attentionClients.length), detail: `${noReturnClients.length} sem retorno recente`, tone: attentionClients.length ? "warning" : "positive", listTitle: "Clientes que exigem decisão ou contato do sócio", emptyText: "Nenhum cliente em atenção neste recorte.", items: lists.clients_attention },
    { id: "processes_risk", title: "Processos de risco", value: String(riskProcesses.length), detail: `${activeProcesses.length} processos ativos`, tone: riskProcesses.length ? "urgent" : "positive", listTitle: "Processos com risco alto ou crítico", emptyText: "Nenhum processo de risco alto/crítico no recorte.", items: lists.processes_risk },
    { id: "tasks_overdue", title: "Tarefas vencidas/urgentes", value: String(overdueTasks.length), detail: `${urgentTasks.length} urgentes abertas`, tone: overdueTasks.length ? "urgent" : "positive", listTitle: "Tarefas atrasadas", emptyText: "Nenhuma tarefa atrasada neste recorte.", items: lists.tasks_overdue },
    { id: "deadlines_urgent", title: "Prazos urgentes", value: String(urgentDeadlineCount), detail: `${deadlineEvents.length + processDeadlineItems.length + taskDeadlineItems.length} prazos monitorados`, tone: urgentDeadlineCount ? "warning" : "positive", listTitle: "Prazos urgentes e próximos", emptyText: "Nenhum prazo urgente próximo neste recorte.", items: lists.deadlines_urgent },
    { id: "finance_overdue", title: "Valores vencidos", value: formatCurrency(sumFinancialAmount(overdueFinance)), detail: `${delinquentClients.length} cliente(s) inadimplente(s)`, tone: overdueFinance.length ? "urgent" : "positive", listTitle: "Valores vencidos que exigem ação", emptyText: "Nenhum valor vencido no recorte.", items: lists.finance_overdue },
    { id: "partnerships_transfer", title: "Parcerias pendentes", value: String(transferPartnerships.length), detail: transferPartnerships.length ? `${transferPartnerships.length} exigem definição de repasse` : documentPartnerships.length ? `${documentPartnerships.length} aguardando documentação` : "Sem pendências de parceria", tone: transferPartnerships.length ? "warning" : "positive", listTitle: "Parcerias com repasse pendente/parcial", emptyText: "Nenhuma parceria aguardando repasse no recorte.", items: lists.partnerships_transfer },
    { id: "reports_generated", title: "Relatórios gerados", value: String(reports.length), detail: `${weekReports.length} na semana`, tone: reports.length ? "premium" : "neutral", listTitle: "Relatórios gerados", emptyText: "Nenhum relatório gerado neste recorte.", items: lists.reports_generated },
    { id: "central_usage", title: "Uso da Central LEX.OS", value: String(executions.length), detail: `${prompts.filter((prompt) => prompt.status === "ativo").length} prompts ativos`, tone: executions.length ? "premium" : "neutral", listTitle: "Execuções da Central LEX.OS", emptyText: "Sem execuções registradas no recorte.", items: lists.central_usage },
  ];

  const moduleVolumes = [
    ["Tarefas", overdueTasks.length + urgentTasks.length + reviewTasks.length],
    ["Financeiro", overdueFinance.length + pendingCollections.length],
    ["Processos", riskProcesses.length + urgentDeadlineCount],
    ["Parcerias", transferPartnerships.length + documentPartnerships.length],
    ["Clientes", attentionClients.length + noReturnClients.length],
  ] as const;
  const busiest = [...moduleVolumes].sort((a, b) => b[1] - a[1])[0];
  const score = Math.min(100, riskProcesses.length * 18 + overdueTasks.length * 14 + overdueFinance.length * 16 + urgentDeadlineCount * 12 + transferPartnerships.length * 10 + noReturnClients.length * 6);
  const healthStatus = score >= 80 ? "Crítico" : score >= 60 ? "Sobrecarregado" : score >= 25 ? "Em atenção" : "Estável";

  const bottlenecks: ExecutiveInsight[] = [
    urgentDeadlineCount >= 2 ? { title: "Prazos próximos concentrados", description: `${urgentDeadlineCount} prazos urgentes/altos aparecem no recorte.`, impact: "Exige priorização de agenda e revisão antes de novas demandas.", priority: "Alta", suggestedAction: "Abrir agenda e validar responsáveis dos prazos críticos.", source: "Agenda/Prazos", route: "/agenda?view=prazos", actionLabel: "Abrir Agenda" } : null,
    overdueTasks.length ? { title: "Tarefas atrasadas acumuladas", description: `${overdueTasks.length} tarefa(s) precisam de replanejamento operacional.`, impact: "Pode pressionar prazos, atendimento e revisão de peças.", priority: overdueTasks.length >= 3 ? "Alta" : "Média", suggestedAction: "Repriorizar tarefas atrasadas com orientação de apoio pontual.", source: "Tarefas", route: "/tarefas?status=atrasada", actionLabel: "Abrir Tarefas" } : null,
    noReturnClients.length ? { title: "Clientes sem retorno recente", description: `${noReturnClients.length} cliente(s) sem contato recente ou com pendência aberta.`, impact: "Pode reduzir previsibilidade do relacionamento e dos próximos passos.", priority: "Média", suggestedAction: "Planejar follow-up humano com prazo objetivo.", source: "Clientes", route: "/clientes?status=atenção", actionLabel: "Abrir Clientes" } : null,
    pendingCollections.length ? { title: "Cobranças pendentes", description: `${pendingCollections.length} cobrança(s) pedem ação ativa ou confirmação.`, impact: "Afeta previsibilidade de caixa e fechamento financeiro.", priority: overdueFinance.length ? "Alta" : "Média", suggestedAction: "Acionar cobrança humanizada e registrar próximo contato.", source: "Financeiro", route: "/financeiro?view=pendentes", actionLabel: "Abrir Financeiro" } : null,
    transferPartnerships.length || documentPartnerships.length ? { title: "Parcerias com pendência de documento/repasse", description: `${transferPartnerships.length} aguardando repasse e ${documentPartnerships.length} aguardando documento.`, impact: "Pode criar ruído no fechamento e na governança das atuações conjuntas.", priority: "Média", suggestedAction: "Revisar escopo, documentos e repasses antes do fechamento financeiro.", source: "Parcerias", route: "/processos/parcerias", actionLabel: "Abrir Parcerias" } : null,
    !isRealSupabase && executions.length === 0 ? { title: "Central LEX.OS pouco utilizada", description: "Sem execuções registradas no recorte.", impact: "O escritório pode estar deixando de padronizar dossiês e relatórios internos.", priority: "Baixa", suggestedAction: "Gerar um dossiê rápido para processos com risco alto e prazo próximo.", source: "Central LEX.OS", route: "/central-lexos", actionLabel: "Abrir Central" } : null,
  ].filter(Boolean) as ExecutiveInsight[];

  const risks: ExecutiveInsight[] = [
    overdueFinance.length ? { title: "Risco financeiro de vencidos", description: `${formatCurrency(sumFinancialAmount(overdueFinance))} vencidos no recorte.`, impact: "Priorizar cobrança consultiva preserva receita sem linguagem agressiva.", priority: "Alta", suggestedAction: "Abrir lista de valores vencidos e definir próximo contato.", source: "Financeiro", route: "/financeiro?view=vencidos", actionLabel: "Abrir Financeiro" } : null,
    riskProcesses.length ? { title: "Risco processual concentrado", description: `${riskProcesses.length} processo(s) com risco alto/crítico.`, impact: "Requer revisão executiva de tese, prazo e comunicação com cliente.", priority: "Alta", suggestedAction: "Usar Dossiê Rápido e revisar próxima ação processual.", source: "Processos", route: "/processos?risk=alto", actionLabel: "Abrir Processos" } : null,
    urgentDeadlineCount ? { title: "Risco de prazo", description: `${urgentDeadlineCount} prazo(s) urgentes/altos próximos.`, impact: "Organizar capacidade evita corrida operacional no fechamento da semana.", priority: "Alta", suggestedAction: "Validar agenda, lembretes e responsável de cada prazo.", source: "Agenda/Prazos", route: "/agenda?view=prazos", actionLabel: "Abrir Prazos" } : null,
  ].filter(Boolean) as ExecutiveInsight[];

  const decisionsToday: ExecutiveInsight[] = [
    overdueTasks.length ? { title: "Repriorizar tarefas vencidas", description: `${overdueTasks.length} tarefa(s) atrasada(s) pressionam prazo e capacidade da equipe.`, impact: "Reduz risco de estouro de prazo e retrabalho no atendimento.", priority: overdueTasks.length >= 3 ? "Alta" : "Média", suggestedAction: "Reordenar fila crítica e pausar novas frentes até equalizar vencidos.", source: "Tarefa", route: "/tarefas?status=atrasada", actionLabel: "Abrir Tarefas" } : null,
    overdueFinance.length ? { title: "Acionar cobrança consultiva", description: `${delinquentClients.length} cliente(s) com inadimplência e ${formatCurrency(sumFinancialAmount(overdueFinance))} vencidos.`, impact: "Protege caixa e reduz risco de perda de receita no mês.", priority: "Alta", suggestedAction: "Executar contato humanizado com próximo passo e data de retorno.", source: "Financeiro", route: "/financeiro?view=vencidos", actionLabel: "Abrir Financeiro" } : null,
    riskProcesses.length ? { title: "Revisar processo de risco alto", description: `${riskProcesses.length} processo(s) em risco alto/crítico exigem validação estratégica.`, impact: "Melhora governança da carteira e reduz risco processual.", priority: "Alta", suggestedAction: "Abrir casos sensíveis, revisar prazo e definir providência executiva.", source: "Processo", route: "/processos?risk=alto", actionLabel: "Abrir Processos" } : null,
    weekReports.length === 0 ? { title: "Gerar relatório executivo semanal", description: "Sem relatório consolidado recente para reunião de sócios.", impact: "Acelera decisões e alinhamento entre operação, financeiro e carteira.", priority: "Média", suggestedAction: "Emitir relatório para sócios no recorte atual.", source: "Relatórios", route: "/relatorios?type=socios_operacional", actionLabel: "Gerar relatório" } : null,
    riskProcesses.length && urgentDeadlineCount ? { title: "Usar Dossiê Rápido em caso sensível", description: "Há risco alto combinado com prazo próximo no recorte.", impact: "Dá clareza para decisão antes de manifestação relevante.", priority: "Média", suggestedAction: "Gerar dossiê para orientar reunião e próxima petição.", source: "Central LEX.OS", route: "/central-lexos/dossie-rapido", actionLabel: "Abrir Dossiê" } : null,
  ].filter(Boolean).slice(0,5) as ExecutiveInsight[];

  const recommendations: ExecutiveInsight[] = [
    { title: "Estabilizar fila crítica", description: "Concentrar a equipe na fila crítica de tarefas vencidas e urgentes antes de abrir novas frentes.", impact: "Aumenta previsibilidade e reduz risco acumulado de prazo.", priority: overdueTasks.length || urgentTasks.length ? "Alta" : "Média", suggestedAction: "Horizonte: 48h. Validar responsável por bloco de tarefas e travar novas entradas não urgentes.", source: "Tarefas", route: "/tarefas?status=atrasada", actionLabel: "Abrir Tarefas" },
    { title: "Reduzir inadimplência com abordagem consultiva", description: "Organizar contatos de cobrança por cliente, valor e data de retorno, mantendo linguagem consultiva.", impact: "Melhora caixa e reduz risco de inadimplência recorrente.", priority: overdueFinance.length ? "Alta" : "Média", suggestedAction: "Horizonte: 3 dias. Definir responsável por cobrança e registrar próximo passo com prazo objetivo.", source: "Financeiro", route: "/financeiro?view=vencidos", actionLabel: "Abrir Financeiro" },
    { title: "Revisar clientes sem retorno", description: "Definir próximos contatos para clientes sem retorno recente, com responsável e prazo objetivo de devolutiva.", impact: "Preserva relacionamento, governança da carteira e previsibilidade comercial.", priority: noReturnClients.length ? "Alta" : "Média", suggestedAction: "Horizonte: semana atual. Priorizar clientes estratégicos com pendência sensível.", source: "Clientes", route: "/clientes?status=atenção", actionLabel: "Abrir Clientes" },
    { title: "Fechar pendências de parceria", description: "Revisar repasses, documentos e pontos pendentes para evitar ruído financeiro e operacional no fechamento.", impact: "Fortalece governança de parcerias e reduz risco de divergência de repasse.", priority: transferPartnerships.length || documentPartnerships.length ? "Alta" : "Média", suggestedAction: "Horizonte: semana atual. Confirmar responsável por cada pendência e data de conclusão.", source: "Parcerias", route: "/processos/parcerias", actionLabel: "Abrir Parcerias" },
    { title: "Preparar relatório para reunião de gestão", description: "Consolidar riscos, caixa, tarefas e capacidade da equipe em um relatório executivo para a reunião de sócios.", impact: "Dá clareza de governança e acelera decisões estruturais da semana.", priority: weekReports.length ? "Média" : "Alta", suggestedAction: "Horizonte: fim da semana. Revisar recorte e gerar relatório para deliberação da gestão.", source: "Relatórios", route: "/relatorios?type=socios_operacional", actionLabel: "Gerar relatório" },
  ];

  const tasksByResponsible = new Map<string, { openTasks: number; urgentTasks: number }>();
  effectiveTasks.forEach(({ task, status }) => {
    if (["concluida", "arquivada"].includes(status)) return;
    const current = tasksByResponsible.get(task.responsible) ?? { openTasks: 0, urgentTasks: 0 };
    current.openTasks += 1;
    if (task.priority === "urgente" || status === "atrasada") current.urgentTasks += 1;
    tasksByResponsible.set(task.responsible, current);
  });
  const teamCapacity = Array.from(tasksByResponsible.entries()).map(([person, data]) => ({
    responsible: person,
    ...data,
    status: data.urgentTasks >= 3 || data.openTasks >= 7 ? "Crítico" : data.urgentTasks >= 2 || data.openTasks >= 5 ? "Sobrecarregado" : data.urgentTasks >= 1 ? "Em atenção" : "Estável",
    guidance: data.urgentTasks >= 3 || data.openTasks >= 7 ? "Alta concentração de pendências críticas; priorizar contingência imediata." : data.urgentTasks >= 2 || data.openTasks >= 5 ? "Há pressão operacional; revisar capacidade antes de abrir novas frentes." : data.urgentTasks >= 1 ? "Revisar prioridade antes de assumir novas demandas." : "Capacidade equilibrada para o recorte atual.",
  }));

  const statusCounts = countBy(clients.map((client) => client.status));
  const processStatusCounts = countBy(processes.map((process) => process.status));
  const partnershipStatusCounts = countBy(partnerships.map((partnership) => partnership.status));
  const executionTypeCounts = countBy(executions.map((execution) => execution.type));
  const promptStatusCounts = countBy(prompts.map((prompt) => prompt.status ?? "ativo"));

  return {
    generatedAt: new Date().toISOString(),
    period,
    responsible,
    responsibleOptions: Array.from(new Set([
      ...allClients.map((client) => client.owner),
      ...allProcesses.map((process) => process.responsible),
      ...allPartnerships.map((partnership) => partnership.internal_responsible),
      ...allTasks.map((task) => task.responsible),
      ...allAgenda.map((event) => event.responsible),
      ...allFinance.map((record) => record.responsible),
      ...allReports.map((report) => report.responsible).filter(Boolean) as string[],
    ])).sort((a, b) => a.localeCompare(b)),
    cards,
    health: {
      status: healthStatus,
      score,
      mainBottleneck: bottlenecks[0]?.title ?? "Operação sem gargalo dominante no recorte.",
      mainFinancialRisk: overdueFinance.length ? `${formatCurrency(sumFinancialAmount(overdueFinance))} vencidos` : "Sem vencidos relevantes no recorte.",
      mainDeadlineRisk: urgentDeadlineCount ? `${urgentDeadlineCount} prazo(s) urgentes/altos próximos` : "Sem prazo urgente próximo no recorte.",
      busiestModule: busiest?.[1] ? `${busiest[0]} concentra ${busiest[1]} pendência(s)` : "Pendências distribuídas de forma saudável.",
      weeklyRecommendation: recommendations[0].description,
    },
    metrics: {
      clients: { ativos: activeClients.length, atencao: attentionClients.length, prospects: statusCounts.prospect ?? 0, semRetorno: noReturnClients.length, inativos: statusCounts.inativo ?? 0 },
      processes: { ativos: activeProcesses.length, atencao: processStatusCounts["atenção"] ?? 0, riscoAltoCritico: riskProcesses.length, prazosProximos: urgentDeadlineCount, arquivados: processStatusCounts.arquivado ?? 0 },
      partnerships: { ativas: activePartnerships.length, emNegociacao: partnershipStatusCounts.em_negociacao ?? 0, aguardandoDocumento: documentPartnerships.length, aguardandoRepasse: transferPartnerships.length, repasseParcial: partnerships.filter((partnership) => partnership.repasse_status === "repasse_parcial").length, arquivadas: partnershipStatusCounts.arquivada ?? 0 },
      tasks: { operacionais: effectiveTasks.filter(({ status }) => !["concluida", "arquivada"].includes(status)).length, atrasadas: overdueTasks.length, urgentes: urgentTasks.length, revisaoAguardando: reviewTasks.length, concluidasSemana: completedThisWeek.length },
      agenda: { hoje: agenda.filter((event) => withinPeriod(event.starts_at, "hoje")).length, prazosSemana: urgentDeadlineCount, audiencias: agenda.filter((event) => event.type === "audiencia").length, reunioes: agenda.filter((event) => event.type === "reuniao").length, followUps: agenda.filter((event) => event.type === "follow_up").length, concluidosCancelados: agenda.filter((event) => ["concluido", "cancelado"].includes(event.status)).length },
      finance: { totalReceber: formatCurrency(sumFinancialAmount(receivableFinance)), totalVencido: formatCurrency(sumFinancialAmount(overdueFinance)), recebidosMes: formatCurrency(sumFinancialAmount(receivedMonth)), receitaPrevista: formatCurrency(sumFinancialAmount(finance.filter((record) => record.direction === "entrada" && ["previsto", "pendente", "aguardando"].includes(record.status)))), clientesInadimplentes: delinquentClients.length, cobrancasPendentes: pendingCollections.length },
      reports: { gerados: reports.length, semana: weekReports.length, arquivados: archivedReports.length, financeiros: financialReports.length, operacionais: operationalReports.length },
      central: { execucoes: executions.length, dossiesRapidos: executionTypeCounts.dossie_rapido ?? 0, promptsUsados: executionTypeCounts.prompt ?? 0, agentesSimulados: executionTypeCounts.agente ?? 0, fluxosExecutados: executionTypeCounts.fluxo ?? 0, playbooksUsados: executionTypeCounts.playbook ?? 0 },
      prompts: { ativos: promptStatusCounts.ativo ?? 0, rascunhos: promptStatusCounts.rascunho ?? 0, arquivados: promptStatusCounts.arquivado ?? 0, estrategicos: prompts.filter((prompt) => prompt.level === "estratégico").length, maisUsados: Math.max(executionTypeCounts.prompt ?? 0, 0) },
    },
    bottlenecks,
    risks,
    decisionsToday,
    recommendations,
    teamCapacity,
    lists,
    latestReport: reports[0],
  };
}

export function buildPartnersDashboardData(options: { period?: PartnersDashboardPeriod; responsible?: string; workspaceId?: string } = {}): PartnersDashboardData {
  const workspaceId = options.workspaceId ?? FALLBACK_WORKSPACE_ID;
  const isRealSupabase = shouldUseWorkspaceSupabase();
  return buildPartnersDashboardDataFromSource(options, {
    allClients: listClients(workspaceId),
    allProcesses: listProcesses(workspaceId, { includeArchived: true }),
    allPartnerships: listPartnerships(workspaceId, { includeArchived: true }),
    allTasks: listTasks(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    allAgenda: listAgendaEvents(workspaceId, { includeDerived: true }),
    allFinance: listFinancialRecords(workspaceId, { includeArchived: true }),
    allReports: isRealSupabase ? [] : listReports(workspaceId, { includeArchived: true }),
    allExecutions: isRealSupabase ? [] : listCentralExecutions(workspaceId, { includeArchived: true }),
    prompts: isRealSupabase ? [] : loadPromptSnapshots(),
    isRealSupabase,
  });
}

export async function buildPartnersDashboardDataAsync(options: { period?: PartnersDashboardPeriod; responsible?: string; workspaceId?: string } = {}): Promise<PartnersDashboardData> {
  const workspaceId = options.workspaceId ?? FALLBACK_WORKSPACE_ID;
  if (!shouldUseWorkspaceSupabase()) return buildPartnersDashboardData(options);
  const [allClients, allProcesses, allPartnerships, allTasks, allAgenda, allFinance, allReports] = await Promise.all([
    listClientsAsync(workspaceId),
    listProcessesAsync(workspaceId, { includeArchived: true }),
    listPartnershipsAsync(workspaceId, { includeArchived: true }),
    listTasksAsync(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    listAgendaEventsAsync(workspaceId, { includeDerived: false }),
    listFinancialRecordsAsync(workspaceId, { includeArchived: true }),
    listReportsAsync(workspaceId, { includeArchived: true }),
  ]);

  return buildPartnersDashboardDataFromSource(options, {
    allClients,
    allProcesses,
    allPartnerships,
    allTasks,
    allAgenda,
    allFinance,
    allReports,
    allExecutions: [],
    prompts: [],
    isRealSupabase: true,
  });
}
