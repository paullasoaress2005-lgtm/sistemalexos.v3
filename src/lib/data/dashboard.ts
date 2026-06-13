import { listActivityLogs, getActivityModuleLabel, getActivityRoute, type ActivityLog } from "./activityLogs";
import { listAgendaEvents, listAgendaEventsAsync, type AgendaEvent } from "./agenda";
import { FALLBACK_WORKSPACE_ID, listClients, listClientsAsync, type Client } from "./clients";
import { agentTemplates, flowTemplates, playbookTemplates, promptTemplates } from "./centralOperations";
import { listCentralExecutions, listCentralExecutionsAsync } from "./centralExecutions";
import { listPromptTemplates, listPromptTemplatesAsync } from "./promptTemplates";
import {
  financeMatchesView,
  formatCurrency as formatFinanceCurrency,
  formatDate as formatFinanceDate,
  getDelinquentClients,
  isReceivedThisMonth,
  isUpcomingRecord,
  listFinancialRecords,
  listFinancialRecordsAsync,
  sumFinancialAmount,
  type FinancialRecord,
} from "./finance";
import { listPartnerships, listPartnershipsAsync, type ProcessPartnership } from "./partnerships";
import { listProcesses, listProcessesAsync, type Process } from "./processes";
import { listReports, listReportsAsync, type Report } from "./reports";
import { shouldUseWorkspaceSupabase } from "./source";
import { listTasks, listTasksAsync, resolveEffectiveTaskStatus, type Task } from "./tasks";

export type DashboardTone = "neutral" | "premium" | "positive" | "warning" | "urgent" | "critical";
export type DashboardPriority = "baixa" | "média" | "alta" | "urgente" | "máxima" | "crítica";
export type OperationalStatus = "Estável" | "Atenção" | "Crítica";
export type OperationalDiagnosis = "Operação estável" | "Risco operacional moderado" | "Risco operacional alto" | "Atenção executiva necessária" | "Dados insuficientes para diagnóstico completo";

export type DashboardAction = {
  label: string;
  helper: string;
  route: string;
};

export type DashboardRelatedItem = {
  id: string;
  title: string;
  description: string;
  meta?: string;
  route: string;
  actionLabel?: string;
};

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: DashboardTone;
  route: string;
  actionLabel: string;
  items: DashboardRelatedItem[];
};

export type OperationalHealth = {
  status: OperationalStatus;
  tone: DashboardTone;
  summary: string;
  mainRisk: string;
  bottleneck: string;
  recommendedPriority: string;
  busiestModule: string;
  signals: string[];
};

export type OfficeItem = {
  id: string;
  title: string;
  type: string;
  time: string;
  priority: DashboardPriority;
  linked: string;
  owner: string;
  nextAction: string;
  route: string;
};

export type SmartAlert = {
  id: string;
  category: string;
  priority: DashboardPriority;
  title: string;
  description: string;
  suggestedAction: string;
  route: string;
  actionLabel: string;
};

export type WeekDayAgenda = {
  id: string;
  date: string;
  dayLabel: string;
  shortDate: string;
  total: number;
  highlight: string;
  route: string;
  items: OfficeItem[];
};

export type FinanceQuickItem = DashboardMetric & {
  amount?: number;
};

export type CentralUsage = {
  executions: number;
  promptsUsed: number;
  quickDossiers: number;
  simulatedAgents: number;
  executedFlows: number;
  usedPlaybooks: number;
  activePrompts: number;
  strategicPrompts: number;
  draftPrompts: number;
  archivedPrompts: number;
  items: DashboardRelatedItem[];
};

export type PartnershipAttention = {
  awaitingDocuments: ProcessPartnership[];
  awaitingTransfers: ProcessPartnership[];
  negotiating: ProcessPartnership[];
  partialTransfers: ProcessPartnership[];
  items: DashboardRelatedItem[];
};

export type DashboardActivity = {
  id: string;
  type: string;
  description: string;
  date: string;
  module: string;
  route: string;
  actionLabel: string;
};

export type DashboardSummary = {
  generatedAt: string;
  metrics: DashboardMetric[];
  health: OperationalHealth;
  priorityToday: SmartAlert[];
  todayItems: OfficeItem[];
  alerts: SmartAlert[];
  weekAgenda: WeekDayAgenda[];
  financeQuick: FinanceQuickItem[];
  centralUsage: CentralUsage;
  partnerships: PartnershipAttention;
  activities: DashboardActivity[];
  activitiesEmptyText?: string;
  quickActions: DashboardAction[];
  counts: {
    clients: Record<string, number>;
    processes: Record<string, number>;
    partnerships: Record<string, number>;
    tasks: Record<string, number>;
    agenda: Record<string, number>;
    finance: Record<string, number>;
    reports: Record<string, number | string>;
    central: Record<string, number>;
    prompts: Record<string, number>;
  };
};

type DashboardSourceData = {
  clients: Client[];
  processes: Process[];
  tasks: Task[];
  agenda: AgendaEvent[];
  finance: FinancialRecord[];
  partnerships: ProcessPartnership[];
  reports: Report[];
  executions: ReturnType<typeof listCentralExecutions>;
  managedPrompts: ManagedPromptSnapshot[];
  isRealSupabase: boolean;
  activityLogs?: ActivityLog[];
};

type ManagedPromptSnapshot = {
  id: string;
  name: string;
  level?: string;
  status?: string;
  updatedAt?: string;
  category?: string;
};

const PROMPTS_STORAGE_KEY = "lexos-control:central-prompts-manager:v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(value: string) {
  return value.includes("T") ? value.slice(0, 10) : value;
}

function daysBetween(from: Date, value: string) {
  const target = startOfDay(new Date(`${toDateOnly(value)}T12:00:00`));
  return Math.round((target.getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

function isSameDay(value: string | undefined, date: Date) {
  if (!value) return false;
  return toDateOnly(value) === date.toISOString().slice(0, 10);
}

function isWithinNextDays(value: string | undefined, days: number, today: Date) {
  if (!value) return false;
  const distance = daysBetween(today, value);
  return distance >= 0 && distance <= days;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00`));
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value?: string) {
  if (!value) return "Dia todo";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function labelFromStatus(value: string) {
  return value.replaceAll("_", " ");
}

function containsQaOrDemoMarker(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("qa ") ||
    normalized.includes("qa cliente automatizado") ||
    normalized.includes("teste automatizado") ||
    normalized.includes("e2e") ||
    normalized.includes("qa_generated") ||
    normalized.includes("demo_seed") ||
    normalized.includes("is_demo") ||
    (normalized.includes("demo") && (normalized.includes("qa") || normalized.includes("teste") || normalized.includes("automat")))
  );
}

function hasQaOrDemoMarker(entry: Record<string, unknown>) {
  const values = Object.values(entry).filter((value): value is string => typeof value === "string");
  return values.some(containsQaOrDemoMarker);
}

function latest<T extends { updated_at?: string; created_at?: string; createdAt?: string; updatedAt?: string }>(items: T[], limit = 3) {
  return [...items]
    .sort((a, b) => (b.updated_at ?? b.updatedAt ?? b.created_at ?? b.createdAt ?? "").localeCompare(a.updated_at ?? a.updatedAt ?? a.created_at ?? a.createdAt ?? ""))
    .slice(0, limit);
}

function related(id: string, title: string, description: string, route: string, meta?: string, actionLabel = "Abrir módulo"): DashboardRelatedItem {
  return { id, title, description, route, meta, actionLabel };
}

function taskRelated(task: Task): DashboardRelatedItem {
  return related(task.id, task.title, `${task.client_name ?? "Interno"} • ${task.responsible} • ${task.next_action}`, `/tarefas?taskId=${task.id}`, `Prazo ${formatDate(task.due_at)} • ${task.priority}`, "Abrir tarefa");
}

function agendaToOfficeItem(event: AgendaEvent): OfficeItem {
  return {
    id: event.id,
    title: event.title,
    type: event.source_label ?? labelFromStatus(event.type),
    time: formatTime(event.starts_at),
    priority: event.priority === "urgente" || event.risk === "crítico" ? "urgente" : event.priority,
    linked: [event.client_name, event.process_number].filter(Boolean).join(" • ") || "Agenda interna",
    owner: event.responsible,
    nextAction: event.next_action,
    route: event.source_route ?? `/agenda?eventId=${event.id}`,
  };
}

function loadManagedPrompts(): ManagedPromptSnapshot[] {
  const seedPrompts = promptTemplates.map((template, index) => ({
    id: `seed-${template.id}`,
    name: template.title,
    level: index % 3 === 0 ? "estratégico" : index % 2 === 0 ? "intermediário" : "básico",
    status: "ativo",
    updatedAt: new Date().toISOString(),
    category: template.sourceModule,
  }));

  if (typeof window === "undefined") return seedPrompts;
  const raw = window.localStorage.getItem(PROMPTS_STORAGE_KEY);
  if (!raw) return seedPrompts;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return seedPrompts;
    const prompts = parsed.filter((item): item is ManagedPromptSnapshot => Boolean(item && typeof item === "object" && "id" in item && "name" in item));
    return prompts.length ? prompts : seedPrompts;
  } catch {
    return seedPrompts;
  }
}

function isPromptActive(prompt: ManagedPromptSnapshot) {
  return prompt.status === "ativo" || prompt.status === "active";
}

function isPromptDraft(prompt: ManagedPromptSnapshot) {
  return prompt.status === "rascunho" || prompt.status === "draft";
}

function isPromptArchived(prompt: ManagedPromptSnapshot) {
  return prompt.status === "arquivado" || prompt.status === "archived";
}

function isPromptStrategic(prompt: ManagedPromptSnapshot) {
  return prompt.level === "estratégico" || prompt.category === "gestao" || prompt.category === "relatorio" || prompt.category === "auditoria";
}

function metric(
  id: string,
  label: string,
  value: string,
  detail: string,
  tone: DashboardTone,
  route: string,
  actionLabel: string,
  items: DashboardRelatedItem[],
): DashboardMetric {
  return { id, label, value, detail, tone, route, actionLabel, items };
}

function buildHealth(input: {
  overdueFinance: FinancialRecord[];
  overdueTasks: Task[];
  riskProcesses: Process[];
  attentionClients: Client[];
  pendingTransferPartnerships: ProcessPartnership[];
  urgentDeadlines: AgendaEvent[];
}): OperationalHealth {
  const volumes = [
    ["Financeiro", input.overdueFinance.length],
    ["Tarefas", input.overdueTasks.length],
    ["Processos", input.riskProcesses.length],
    ["Clientes", input.attentionClients.length],
    ["Parcerias", input.pendingTransferPartnerships.length],
    ["Agenda", input.urgentDeadlines.length],
  ] as const;
  const busiest = [...volumes].sort((a, b) => b[1] - a[1])[0];
  const criticalScore = Number(input.overdueFinance.length > 0) + Number(input.overdueTasks.length > 0) + Number(input.riskProcesses.length > 0);
  const attentionScore = Number(input.attentionClients.length > 0) + Number(input.pendingTransferPartnerships.length > 0) + Number(input.urgentDeadlines.length > 0);
  const status: OperationalStatus = criticalScore >= 3 ? "Crítica" : criticalScore >= 1 || input.attentionClients.length > 0 ? "Atenção" : "Estável";
  const monitoredRecords =
    input.overdueFinance.length + input.overdueTasks.length + input.riskProcesses.length + input.attentionClients.length + input.pendingTransferPartnerships.length + input.urgentDeadlines.length;
  const diagnosis: OperationalDiagnosis =
    monitoredRecords < 3
      ? "Dados insuficientes para diagnóstico completo"
      : criticalScore >= 3 || input.riskProcesses.some((process) => process.risk === "crítico")
        ? "Risco operacional alto"
        : criticalScore >= 1
          ? "Atenção executiva necessária"
          : attentionScore >= 2
            ? "Risco operacional moderado"
            : "Operação estável";

  return {
    status,
    tone: status === "Crítica" ? "critical" : status === "Atenção" ? "warning" : "positive",
    summary:
      diagnosis === "Dados insuficientes para diagnóstico completo"
        ? "Base atual com poucos sinais para conclusão ampla. Recomenda-se aumentar a cadência de registros e revisões."
        : diagnosis === "Operação estável"
          ? "Operação equilibrada no recorte atual, sem acúmulo relevante de pendências críticas."
          : diagnosis === "Risco operacional alto"
            ? "Há combinação de vencidos, atrasos e riscos processuais. A semana exige triagem executiva diária."
            : diagnosis === "Atenção executiva necessária"
              ? "Riscos críticos já aparecem no painel e pedem resposta executiva imediata entre financeiro, prazos e processos."
              : "Operação funcional, mas com pontos que pedem cadência de cobrança, prazos e follow-up.",
    mainRisk: input.riskProcesses[0]
      ? `${input.riskProcesses[0].title} com risco ${input.riskProcesses[0].risk} e próximo passo: ${input.riskProcesses[0].next_action}`
      : input.overdueFinance[0]
        ? `${input.overdueFinance[0].client_name ?? "Cliente"} possui valor vencido de ${formatFinanceCurrency(input.overdueFinance[0].amount)}.`
        : "Nenhum risco crítico consolidado nos dados atuais.",
    bottleneck: busiest[1] > 0 ? `${busiest[0]} concentra ${busiest[1]} pendência(s) relevantes.` : "Sem gargalo relevante nos dados atuais.",
    recommendedPriority: input.overdueTasks.length
      ? "Recuperar tarefas atrasadas antes de abrir novas frentes."
      : input.overdueFinance.length
        ? "Executar cobrança consultiva dos vencidos e registrar próximos contatos."
        : input.urgentDeadlines.length
          ? "Blindar agenda para prazos urgentes da semana."
          : "Manter cadência semanal e registrar novos retornos.",
    busiestModule: busiest[0],
    signals: volumes.map(([name, count]) => `${name}: ${count}`),
  };
}

function buildActivities(input: {
  clients: Client[];
  processes: Process[];
  tasks: Task[];
  agenda: AgendaEvent[];
  finance: FinancialRecord[];
  reports: Report[];
  executions: ReturnType<typeof listCentralExecutions>;
  partnerships: ProcessPartnership[];
}): DashboardActivity[] {
  const activities: DashboardActivity[] = [
    ...latest(input.clients, 2).map((client) => ({ id: `client-${client.id}`, type: "Cliente", description: `${client.name} atualizado • ${client.next_action}`, date: client.updated_at, module: "Clientes", route: `/clientes?clientId=${client.id}`, actionLabel: "Abrir cliente" })),
    ...latest(input.processes, 2).map((process) => ({ id: `process-${process.id}`, type: "Processo", description: `${process.number} • ${process.client_name} • ${process.next_action}`, date: process.updated_at, module: "Processos", route: `/processos?processId=${process.id}`, actionLabel: "Abrir processo" })),
    ...latest(input.tasks.filter((task) => task.status === "concluida"), 2).map((task) => ({ id: `task-${task.id}`, type: "Tarefa concluída", description: `${task.title} • ${task.responsible}`, date: task.completed_at ?? task.updated_at, module: "Tarefas", route: `/tarefas?taskId=${task.id}`, actionLabel: "Abrir tarefa" })),
    ...latest(input.agenda, 2).map((event) => ({ id: `agenda-${event.id}`, type: "Compromisso", description: `${event.title} • ${event.client_name ?? "Interno"} • ${event.next_action}`, date: event.updated_at, module: "Agenda", route: `/agenda?eventId=${event.id}`, actionLabel: "Abrir agenda" })),
    ...latest(input.finance, 2).map((record) => ({ id: `finance-${record.id}`, type: "Financeiro", description: `${record.title} • ${record.client_name ?? "Sem cliente"} • ${formatFinanceCurrency(record.amount)}`, date: record.updated_at, module: "Financeiro", route: `/financeiro?financeId=${record.id}`, actionLabel: "Abrir lançamento" })),
    ...latest(input.reports, 2).map((report) => ({ id: `report-${report.id}`, type: "Relatório", description: `${report.title} • ${report.summary}`, date: report.updated_at, module: "Relatórios", route: `/relatorios?reportId=${report.id}`, actionLabel: "Abrir relatório" })),
    ...latest(input.executions, 2).map((execution) => ({ id: `central-${execution.id}`, type: "Central LEX.OS", description: `${execution.title} • ${labelFromStatus(execution.type)}`, date: execution.updated_at, module: "Central LEX.OS", route: `/central-lexos?executionId=${execution.id}`, actionLabel: "Abrir execução" })),
    ...latest(input.partnerships, 2).map((partnership) => ({ id: `partnership-${partnership.id}`, type: "Parceria", description: `${partnership.partner_name} • ${partnership.client_name ?? "Sem cliente"} • ${partnership.next_action}`, date: partnership.updated_at, module: "Parcerias", route: `/processos/parcerias?partnershipId=${partnership.id}`, actionLabel: "Abrir parceria" })),
  ];

  return activities.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

function buildDashboardSummaryFromData(source: DashboardSourceData, today = new Date()): DashboardSummary {
  const now = startOfDay(today);
  const {
    clients,
    processes,
    tasks,
    agenda,
    finance,
    partnerships,
    reports,
    executions,
    managedPrompts,
    isRealSupabase,
  } = source;
  const filteredClients = clients.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredProcesses = processes.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredTasks = tasks.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredAgenda = agenda.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredFinance = finance.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredPartnerships = partnerships.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredReports = reports.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredExecutions = executions.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));
  const filteredPrompts = managedPrompts.filter((item) => !hasQaOrDemoMarker(item as unknown as Record<string, unknown>));

  const activityLogItems = source.activityLogs?.filter((log) => !hasQaOrDemoMarker(log as unknown as Record<string, unknown>)).map((log) => ({
    id: `activity-${log.id}`,
    type: log.title || log.action,
    description: log.description || log.action,
    date: log.created_at,
    module: getActivityModuleLabel(log.entity_type),
    route: getActivityRoute(log),
    actionLabel: "Abrir registro",
  }));

  const activeClients = filteredClients.filter((client) => client.status === "ativo");
  const attentionClients = filteredClients.filter((client) => client.status === "atenção");
  const prospects = filteredClients.filter((client) => client.status === "prospect");
  const inactiveClients = filteredClients.filter((client) => client.status === "inativo");
  const noReturnClients = filteredClients.filter((client) => daysBetween(now, client.last_contact_at) <= -7 || client.status === "atenção");

  const activeProcesses = filteredProcesses.filter((process) => ["ativo", "atenção", "suspenso"].includes(process.status));
  const attentionProcesses = filteredProcesses.filter((process) => process.status === "atenção");
  const riskProcesses = filteredProcesses.filter((process) => ["alto", "crítico"].includes(process.risk));
  const processesWithUpcomingDeadline = filteredProcesses.filter((process) => process.status !== "arquivado" && isWithinNextDays(process.next_deadline_at, 7, now));
  const archivedProcesses = filteredProcesses.filter((process) => process.status === "arquivado");

  const operationalTasks = filteredTasks.filter((task) => !["concluida", "arquivada"].includes(resolveEffectiveTaskStatus(task, now)));
  const urgentTasks = operationalTasks.filter((task) => task.priority === "urgente");
  const overdueTasks = operationalTasks.filter((task) => resolveEffectiveTaskStatus(task, now) === "atrasada");
  const waitingTasks = operationalTasks.filter((task) => ["em_revisao", "aguardando"].includes(task.status));
  const completedThisWeek = filteredTasks.filter((task) => task.completed_at && daysBetween(now, task.completed_at) >= -7 && daysBetween(now, task.completed_at) <= 0);
  const archivedTasks = filteredTasks.filter((task) => task.status === "arquivada");

  const todayAgenda = filteredAgenda.filter((event) => isSameDay(event.starts_at, now) && !["cancelado", "arquivado"].includes(event.status));
  const weekAgendaEvents = filteredAgenda.filter((event) => isWithinNextDays(event.starts_at, 7, now) && !["cancelado", "arquivado"].includes(event.status));
  const urgentDeadlines = filteredAgenda.filter((event) => event.type === "prazo" && isWithinNextDays(event.starts_at, 7, now) && !["concluido", "cancelado", "arquivado"].includes(event.status));
  const urgentTaskDeadlines = operationalTasks.filter((task) => isWithinNextDays(task.due_at, 7, now) && ["urgente", "máxima"].includes(task.priority));
  const urgentProcessDeadlines = processesWithUpcomingDeadline.filter((process) => ["alto", "crítico"].includes(process.risk) || process.status === "atenção");
  const urgentDeadlineItems = [
    ...urgentDeadlines.map((event) => related(event.id, event.title, `${event.client_name ?? "Interno"} • ${event.next_action}`, `/agenda?eventId=${event.id}`, formatDateTime(event.starts_at), "Abrir prazo")),
    ...urgentTaskDeadlines.map(taskRelated),
    ...urgentProcessDeadlines.map((process) => related(process.id, process.number, `${process.client_name} • ${process.next_action}`, `/processos?processId=${process.id}`, `Prazo ${formatDate(process.next_deadline_at)} • risco ${process.risk}`, "Abrir processo")),
  ];
  const hearings = filteredAgenda.filter((event) => event.type === "audiencia" && isWithinNextDays(event.starts_at, 7, now));
  const meetings = filteredAgenda.filter((event) => event.type === "reuniao" && isWithinNextDays(event.starts_at, 7, now));
  const followUps = filteredAgenda.filter((event) => event.type === "follow_up" && isWithinNextDays(event.starts_at, 7, now));

  const receivable = filteredFinance.filter((record) => financeMatchesView(record, "receber"));
  const overdueFinance = filteredFinance.filter((record) => financeMatchesView(record, "vencidos"));
  const delinquentClients = getDelinquentClients(filteredFinance);
  const predictedRevenue = filteredFinance.filter((record) => financeMatchesView(record, "prevista"));
  const upcomingInstallments = filteredFinance.filter((record) => isUpcomingRecord(record, 15));
  const pendingCollections = filteredFinance.filter((record) => financeMatchesView(record, "pendentes") || financeMatchesView(record, "vencidos"));
  const receivedThisMonth = filteredFinance.filter(isReceivedThisMonth);

  const weekStart = addDays(now, -7);
  const reportsThisWeek = filteredReports.filter((report) => new Date(report.created_at) >= weekStart);
  const lastReport = filteredReports[0];

  const activePartnerships = filteredPartnerships.filter((partnership) => ["ativa", "em_execucao"].includes(partnership.status));
  const negotiatingPartnerships = filteredPartnerships.filter((partnership) => partnership.status === "em_negociacao");
  const awaitingDocumentPartnerships = filteredPartnerships.filter((partnership) => partnership.status === "aguardando_documento");
  const awaitingTransferPartnerships = filteredPartnerships.filter((partnership) => partnership.status === "aguardando_repasse" || partnership.repasse_status === "repasse_pendente");
  const partialTransferPartnerships = filteredPartnerships.filter((partnership) => partnership.repasse_status === "repasse_parcial");
  const archivedPartnerships = filteredPartnerships.filter((partnership) => partnership.status === "arquivada");

  const centralUsage: CentralUsage = {
    executions: filteredExecutions.filter((execution) => execution.status !== "archived").length,
    promptsUsed: filteredExecutions.filter((execution) => execution.type === "prompt").length,
    quickDossiers: filteredExecutions.filter((execution) => execution.type === "dossie_rapido").length,
    simulatedAgents: filteredExecutions.filter((execution) => execution.type === "agente").length,
    executedFlows: filteredExecutions.filter((execution) => execution.type === "fluxo").length,
    usedPlaybooks: filteredExecutions.filter((execution) => execution.type === "playbook").length,
    activePrompts: filteredPrompts.filter(isPromptActive).length,
    strategicPrompts: filteredPrompts.filter(isPromptStrategic).length,
    draftPrompts: filteredPrompts.filter(isPromptDraft).length,
    archivedPrompts: filteredPrompts.filter(isPromptArchived).length,
    items: filteredExecutions.slice(0, 4).map((execution) => related(execution.id, execution.title, `${labelFromStatus(execution.type)} • ${execution.input_summary}`, `/central-lexos?executionId=${execution.id}`, formatDateTime(execution.created_at), "Abrir execução")),
  };

  const todayItems: OfficeItem[] = [
    ...todayAgenda.map(agendaToOfficeItem),
    ...urgentTasks.slice(0, 4).map((task) => ({ id: task.id, title: task.title, type: "Tarefa urgente", time: task.due_at ? formatDate(task.due_at) : "Hoje", priority: "urgente" as const, linked: task.client_name ?? task.process_number ?? "Tarefa interna", owner: task.responsible, nextAction: task.next_action, route: `/tarefas?taskId=${task.id}` })),
    ...overdueFinance.slice(0, 3).map((record) => ({ id: record.id, title: record.title, type: "Cobrança relevante", time: formatFinanceDate(record.due_at), priority: "alta" as const, linked: record.client_name ?? "Cliente não vinculado", owner: record.responsible, nextAction: record.next_action, route: `/financeiro?financeId=${record.id}` })),
    ...urgentProcessDeadlines.slice(0, 3).map((process) => ({ id: process.id, title: process.title, type: "Prazo processual", time: formatDate(process.next_deadline_at), priority: process.risk === "crítico" ? "crítica" as const : "alta" as const, linked: process.client_name, owner: process.responsible, nextAction: process.next_action, route: `/processos?processId=${process.id}` })),
  ].slice(0, 9);

  const weekDays: WeekDayAgenda[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now, index);
    const items = weekAgendaEvents.filter((event) => isSameDay(event.starts_at, date)).map(agendaToOfficeItem);
    const prazoCount = items.filter((item) => item.type.toLowerCase().includes("prazo")).length;
    const audienciaCount = items.filter((item) => item.type.toLowerCase().includes("audiencia") || item.type.toLowerCase().includes("audiência")).length;
    return {
      id: date.toISOString().slice(0, 10),
      date: date.toISOString().slice(0, 10),
      dayLabel: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", ""),
      shortDate: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
      total: items.length,
      highlight: items.length ? `${prazoCount} prazo(s), ${audienciaCount} audiência(s)` : "Sem itens críticos",
      route: `/agenda?date=${date.toISOString().slice(0, 10)}`,
      items,
    };
  });

  const financeQuick: FinanceQuickItem[] = [
    { ...metric("finance-receivable", "Total a receber", formatFinanceCurrency(sumFinancialAmount(receivable)), `${receivable.length} lançamento(s)`, "premium", "/financeiro?view=receber", "Abrir recebíveis", receivable.slice(0, 4).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • vence ${formatFinanceDate(record.due_at)}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir lançamento"))), amount: sumFinancialAmount(receivable) },
    { ...metric("finance-overdue", "Total vencido", formatFinanceCurrency(sumFinancialAmount(overdueFinance)), `${overdueFinance.length} cobrança(s)`, "urgent", "/financeiro?view=vencidos", "Abrir vencidos", overdueFinance.slice(0, 4).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • venc. ${formatFinanceDate(record.due_at)}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir cobrança"))), amount: sumFinancialAmount(overdueFinance) },
    { ...metric("finance-predicted", "Receita prevista", formatFinanceCurrency(sumFinancialAmount(predictedRevenue)), "previsão consolidada", "positive", "/financeiro?view=prevista", "Ver previsão", predictedRevenue.slice(0, 4).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • ${record.status}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir previsão"))), amount: sumFinancialAmount(predictedRevenue) },
    { ...metric("finance-received", "Recebidos no mês", formatFinanceCurrency(sumFinancialAmount(receivedThisMonth)), `${receivedThisMonth.length} recebido(s)`, "positive", "/financeiro?view=recebidos", "Ver recebidos", receivedThisMonth.slice(0, 4).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • pago em ${formatFinanceDate(record.paid_at)}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir recebido"))), amount: sumFinancialAmount(receivedThisMonth) },
    { ...metric("finance-pending", "Cobranças pendentes", String(pendingCollections.length), "ação ativa", "warning", "/financeiro?view=pendentes", "Ver cobranças", pendingCollections.slice(0, 4).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • ${record.next_action}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir cobrança"))) },
    { ...metric("finance-delinquent", "Clientes inadimplentes", String(delinquentClients.length), "com vencidos", "warning", "/financeiro?view=inadimplentes", "Ver inadimplência", delinquentClients.slice(0, 4).map((client) => related(client.client_id ?? client.client_name, client.client_name, `${client.count} cobrança(s) vencida(s)`, `/financeiro?view=inadimplentes&client=${encodeURIComponent(client.client_name)}`, formatFinanceCurrency(client.total), "Abrir inadimplente"))) },
  ];

  const partnershipItems = [
    ...awaitingDocumentPartnerships,
    ...awaitingTransferPartnerships,
    ...negotiatingPartnerships,
    ...partialTransferPartnerships,
  ].slice(0, 8).map((partnership) => related(partnership.id, `${partnership.partner_name} • ${partnership.partner_firm}`, `${partnership.client_name ?? "Sem cliente"} • ${labelFromStatus(partnership.status)} • ${partnership.next_action}`, `/processos/parcerias?partnershipId=${partnership.id}`, partnership.expected_amount ? formatFinanceCurrency(partnership.expected_amount) : "Sem repasse definido", "Abrir parceria"));

  const alerts: SmartAlert[] = [
    ...overdueTasks.slice(0, 2).map((task) => ({ id: `task-${task.id}`, category: "Tarefas", priority: task.priority === "urgente" ? "crítica" as const : "alta" as const, title: "Tarefa atrasada exige recuperação", description: `${task.title} está vencida desde ${formatDate(task.due_at)}.`, suggestedAction: task.next_action, route: `/tarefas?taskId=${task.id}`, actionLabel: "Abrir tarefa" })),
    ...overdueFinance.slice(0, 2).map((record) => ({ id: `finance-${record.id}`, category: "Financeiro", priority: "alta" as const, title: "Valor vencido impacta caixa", description: `${record.client_name ?? "Cliente"} possui ${formatFinanceCurrency(record.amount)} vencido.`, suggestedAction: record.next_action, route: `/financeiro?financeId=${record.id}`, actionLabel: "Abrir cobrança" })),
    ...attentionClients.slice(0, 2).map((client) => ({ id: `client-${client.id}`, category: "Clientes", priority: "média" as const, title: "Cliente em atenção", description: `${client.name}: ${client.main_pending}.`, suggestedAction: client.next_action, route: `/clientes?clientId=${client.id}`, actionLabel: "Abrir cliente" })),
    ...riskProcesses.slice(0, 2).map((process) => ({ id: `process-${process.id}`, category: "Processos", priority: process.risk === "crítico" ? "crítica" as const : "alta" as const, title: "Processo de risco alto/crítico", description: `${process.number} • ${process.client_name} • risco ${process.risk}.`, suggestedAction: process.next_action, route: `/processos?processId=${process.id}`, actionLabel: "Abrir processo" })),
    ...awaitingTransferPartnerships.slice(0, 1).map((partnership) => ({ id: `partnership-${partnership.id}`, category: "Parcerias", priority: "alta" as const, title: "Parceria aguardando repasse", description: `${partnership.partner_name} aguarda definição/repasse.`, suggestedAction: partnership.next_action, route: `/processos/parcerias?partnershipId=${partnership.id}`, actionLabel: "Abrir parceria" })),
    ...urgentDeadlines.slice(0, 1).map((event) => ({ id: `agenda-${event.id}`, category: "Agenda/Prazos", priority: "urgente" as const, title: "Prazo próximo no radar", description: `${event.title} em ${formatDateTime(event.starts_at)}.`, suggestedAction: event.next_action, route: `/agenda?eventId=${event.id}`, actionLabel: "Abrir prazo" })),
  ];
  if (!isRealSupabase && centralUsage.executions < 2) alerts.push({ id: "central-low-usage", category: "Central LEX.OS", priority: "média", title: "Uso da Central ainda baixo", description: "Poucas execuções registradas no histórico desta sessão.", suggestedAction: "Gerar dossiê rápido ou executar prompt estratégico antes da reunião crítica.", route: "/central-lexos", actionLabel: "Abrir Central" });
  if (!isRealSupabase && reportsThisWeek.length === 0) alerts.push({ id: "reports-weekly", category: "Relatórios", priority: "média", title: "Relatório semanal ainda não gerado", description: "Não há relatório criado nos últimos 7 dias nesta sessão.", suggestedAction: "Gerar relatório operacional da semana para sócios/equipe.", route: "/relatorios?type=operacional_semanal", actionLabel: "Gerar relatório" });

  const metrics: DashboardMetric[] = [
    metric("overdue-tasks", "Tarefas atrasadas", String(overdueTasks.length), "prazo interno vencido", overdueTasks.length ? "urgent" : "positive", "/tarefas?status=atrasada", "Abrir atrasadas", overdueTasks.slice(0, 5).map(taskRelated)),
    metric("overdue-values", "Valores vencidos", formatFinanceCurrency(sumFinancialAmount(overdueFinance)), `${overdueFinance.length} vencido(s)`, overdueFinance.length ? "urgent" : "positive", "/financeiro?view=vencidos", "Ver cobranças vencidas", overdueFinance.slice(0, 5).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • venc. ${formatFinanceDate(record.due_at)}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir cobrança"))),
    metric("clients-no-return", "Clientes sem retorno", String(noReturnClients.length), "follow-up necessário", noReturnClients.length ? "warning" : "positive", "/clientes?status=atenção", "Abrir follow-ups", noReturnClients.slice(0, 5).map((client) => related(client.id, client.name, `${client.main_pending} • último contato ${formatDate(client.last_contact_at)}`, `/clientes?clientId=${client.id}`, client.owner, "Abrir cliente"))),
    metric("active-processes", "Processos de risco", String(riskProcesses.length), `${activeProcesses.length} ativo(s) na carteira`, riskProcesses.length ? "warning" : "positive", "/processos?risk=alto", "Abrir processos críticos", riskProcesses.slice(0, 5).map((process) => related(process.id, process.number, `${process.client_name} • ${process.next_action}`, `/processos?processId=${process.id}`, `Risco ${process.risk}`, "Abrir processo"))),
    metric("receivable", "Valores a receber", formatFinanceCurrency(sumFinancialAmount(receivable)), `${receivable.length} recebível(is)`, "premium", "/financeiro?view=receber", "Abrir recebíveis", receivable.slice(0, 5).map((record) => related(record.id, record.title, `${record.client_name ?? "Sem cliente"} • ${record.next_action}`, `/financeiro?financeId=${record.id}`, formatFinanceCurrency(record.amount), "Abrir financeiro"))),
    metric("urgent-deadlines", "Prazos urgentes", String(urgentDeadlineItems.length), "agenda + tarefas/processos", urgentDeadlineItems.length ? "urgent" : "positive", "/agenda?view=prazos", "Ver prazos urgentes", urgentDeadlineItems.slice(0, 5)),
    metric("partnership-transfer", "Parcerias aguardando repasse", String(awaitingTransferPartnerships.length), "repasse pendente/parcial", awaitingTransferPartnerships.length ? "warning" : "positive", "/processos/parcerias?status=aguardando_repasse", "Abrir parcerias", awaitingTransferPartnerships.slice(0, 5).map((partnership) => related(partnership.id, partnership.partner_name, `${partnership.client_name ?? "Sem cliente"} • ${partnership.next_action}`, `/processos/parcerias?partnershipId=${partnership.id}`, partnership.expected_amount ? formatFinanceCurrency(partnership.expected_amount) : "Sem valor", "Abrir parceria"))),
    metric("central-usage", "Central LEX.OS", String(centralUsage.executions), `${centralUsage.activePrompts} prompts ativos`, centralUsage.executions ? "positive" : "warning", "/central-lexos", "Usar Central LEX.OS", centralUsage.items),
  ];

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    health: buildHealth({ overdueFinance, overdueTasks, riskProcesses, attentionClients, pendingTransferPartnerships: awaitingTransferPartnerships, urgentDeadlines }),
    todayItems,
    alerts: alerts.slice(0, 10),
    priorityToday: alerts
      .filter((alert) => ["crítica", "urgente", "alta"].includes(alert.priority))
      .slice(0, 5),
    weekAgenda: weekDays,
    financeQuick,
    centralUsage,
    partnerships: {
      awaitingDocuments: awaitingDocumentPartnerships,
      awaitingTransfers: awaitingTransferPartnerships,
      negotiating: negotiatingPartnerships,
      partialTransfers: partialTransferPartnerships,
      items: partnershipItems,
    },
    activities: isRealSupabase ? (activityLogItems ?? []) : buildActivities({ clients: filteredClients, processes: filteredProcesses, tasks: filteredTasks, agenda: filteredAgenda, finance: filteredFinance, reports: filteredReports, executions: filteredExecutions, partnerships: filteredPartnerships }),
    activitiesEmptyText: isRealSupabase && !activityLogItems?.length ? "Nenhum movimento recente registrado neste escritório." : undefined,
    quickActions: [
      { label: "Cadastrar atendimento", helper: "Iniciar cadastro de cliente e contexto inicial", route: "/clientes?action=novo" },
      { label: "Registrar demanda", helper: "Abrir novo processo com estratégia e risco", route: "/processos?action=novo" },
      { label: "Criar pendência", helper: "Registrar tarefa com responsável e prazo", route: "/tarefas?action=novo" },
      { label: "Controlar vencimento", helper: "Cadastrar prazo e evitar estouro de agenda", route: "/agenda?action=novo" },
      { label: "Lançar recebível", helper: "Adicionar cobrança com valor e próxima ação", route: "/financeiro?action=novo" },
      { label: "Registrar correspondente", helper: "Criar parceria e acompanhar repasses", route: "/processos/parcerias?action=novo" },
      { label: "Exportar visão executiva", helper: "Gerar relatório para sócios e gestão", route: "/relatorios?type=socios_operacional" },
      { label: "Usar inteligência do escritório", helper: "Executar prompts e dossiês da Central LEX.OS", route: "/central-lexos" },
    ],
    counts: {
      clients: { ativos: activeClients.length, atencao: attentionClients.length, prospects: prospects.length, semRetorno: noReturnClients.length, inativos: inactiveClients.length },
      processes: { ativos: activeProcesses.length, atencao: attentionProcesses.length, risco: riskProcesses.length, prazoProximo: processesWithUpcomingDeadline.length, arquivados: archivedProcesses.length },
      partnerships: { ativas: activePartnerships.length, emNegociacao: negotiatingPartnerships.length, aguardandoDocumento: awaitingDocumentPartnerships.length, aguardandoRepasse: awaitingTransferPartnerships.length, repasseParcial: partialTransferPartnerships.length, arquivadas: archivedPartnerships.length },
      tasks: { operacionais: operationalTasks.length, urgentes: urgentTasks.length, atrasadas: overdueTasks.length, revisaoOuAguardando: waitingTasks.length, concluidasSemana: completedThisWeek.length, arquivadas: archivedTasks.length },
      agenda: { hoje: todayAgenda.length, semana: weekAgendaEvents.length, prazosUrgentes: urgentDeadlineItems.length, audiencias: hearings.length, reunioes: meetings.length, followUps: followUps.length },
      finance: { receber: sumFinancialAmount(receivable), vencidos: sumFinancialAmount(overdueFinance), inadimplentes: delinquentClients.length, receitaPrevista: sumFinancialAmount(predictedRevenue), parcelasProximas: upcomingInstallments.length, cobrancasPendentes: pendingCollections.length, recebidosMes: sumFinancialAmount(receivedThisMonth) },
      reports: { gerados: reports.filter((report) => !report.archived_at).length, semana: reportsThisWeek.length, ultimo: lastReport?.title ?? (isRealSupabase ? "Nenhum relatório gerado no escritório" : "Nenhum relatório gerado localmente") },
      central: { execucoes: centralUsage.executions, dossies: centralUsage.quickDossiers, promptsUsados: centralUsage.promptsUsed, agentes: isRealSupabase ? centralUsage.simulatedAgents : centralUsage.simulatedAgents || agentTemplates.length, fluxos: isRealSupabase ? centralUsage.executedFlows : centralUsage.executedFlows || flowTemplates.length, playbooks: isRealSupabase ? centralUsage.usedPlaybooks : centralUsage.usedPlaybooks || playbookTemplates.length },
      prompts: { ativos: centralUsage.activePrompts, estrategicos: centralUsage.strategicPrompts, rascunhos: centralUsage.draftPrompts, arquivados: centralUsage.archivedPrompts },
    },
  };
}

export function buildDashboardSummary(workspaceId = FALLBACK_WORKSPACE_ID, today = new Date()): DashboardSummary {
  const isRealSupabase = shouldUseWorkspaceSupabase();
  return buildDashboardSummaryFromData({
    clients: listClients(workspaceId),
    processes: listProcesses(workspaceId, { includeArchived: true }),
    tasks: listTasks(workspaceId, { status: "todas", includeArchived: true }),
    agenda: listAgendaEvents(workspaceId, { includeDerived: true }),
    finance: listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }),
    partnerships: listPartnerships(workspaceId, { includeArchived: true }),
    reports: isRealSupabase ? [] : listReports(workspaceId, { includeArchived: true }),
    executions: isRealSupabase ? [] : listCentralExecutions(workspaceId, { includeArchived: true }),
    managedPrompts: isRealSupabase ? [] : listPromptTemplates(workspaceId, { includeArchived: true }).map((prompt) => ({ id: prompt.id, name: prompt.title, level: String(prompt.metadata.level ?? ""), status: prompt.status, updatedAt: prompt.updated_at, category: prompt.category })),
    isRealSupabase,
  }, today);
}

export async function buildDashboardSummaryAsync(workspaceId = FALLBACK_WORKSPACE_ID, today = new Date()): Promise<DashboardSummary> {
  if (!shouldUseWorkspaceSupabase()) return buildDashboardSummary(workspaceId, today);
  const [clients, processes, tasks, agenda, finance, partnerships, reports, executions, managedPrompts] = await Promise.all([
    listClientsAsync(workspaceId),
    listProcessesAsync(workspaceId, { includeArchived: true }),
    listTasksAsync(workspaceId, { status: "todas", includeArchived: true }),
    listAgendaEventsAsync(workspaceId, { includeDerived: false }),
    listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined }),
    listPartnershipsAsync(workspaceId, { includeArchived: true }),
    listReportsAsync(workspaceId, { includeArchived: true }),
    listCentralExecutionsAsync(workspaceId, { includeArchived: true }),
    listPromptTemplatesAsync(workspaceId, { includeArchived: true, status: "all" }),
  ]);

  return buildDashboardSummaryFromData({
    clients,
    processes,
    tasks,
    agenda,
    finance,
    partnerships,
    reports,
    executions,
    managedPrompts: managedPrompts.map((prompt) => ({ id: prompt.id, name: prompt.title, level: String(prompt.metadata.level ?? ""), status: prompt.status, updatedAt: prompt.updated_at, category: prompt.category })),
    activityLogs: await listActivityLogs(workspaceId, { limit: 10 }),
    isRealSupabase: true,
  }, today);
}
