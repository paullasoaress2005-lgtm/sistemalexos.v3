import { FALLBACK_WORKSPACE_ID, listClients, listClientsAsync, type Client } from "./clients";
import { listProcesses, listProcessesAsync, type Process } from "./processes";
import { listPartnerships, listPartnershipsAsync, type ProcessPartnership } from "./partnerships";
import { listTasks, listTasksAsync, resolveEffectiveTaskStatus, type Task } from "./tasks";
import { listAgendaEvents, listAgendaEventsAsync, type AgendaEvent } from "./agenda";
import {
  financeMatchesView,
  formatCurrency,
  formatDate,
  getDelinquentClients,
  isReceivedThisMonth,
  isUpcomingRecord,
  listFinancialRecords,
  listFinancialRecordsAsync,
  sumFinancialAmount,
  type FinancialRecord,
} from "./finance";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logReportActivity } from "@/lib/data/activityLogs";
import { humanizeLabel } from "@/lib/utils";

export type ReportType =
  | "socios_operacional"
  | "operacional_semanal"
  | "financeiro"
  | "cliente"
  | "carteira_processos"
  | "tarefas_prazos"
  | "inadimplencia"
  | "semanal"
  | "mensal"
  | "personalizado";

export type ReportAudience = "socios" | "equipe" | "cliente" | "financeiro" | "interno";
export type ReportStatus = "generated" | "copied" | "archived";
export type ReportSeverity = "info" | "success" | "warning" | "critical";

export type ReportSection = {
  id: string;
  title: string;
  content: string;
  items?: string[];
  severity?: ReportSeverity;
  source?: string;
};

export type ReportMetric = {
  label: string;
  value: string;
  detail?: string;
  severity?: ReportSeverity;
};

export type Report = {
  id: string;
  workspace_id: string;
  title: string;
  type: ReportType;
  audience: ReportAudience;
  period_start: string;
  period_end: string;
  client_id?: string;
  process_id?: string;
  responsible?: string;
  status: ReportStatus;
  summary: string;
  sections: ReportSection[];
  metrics: ReportMetric[];
  numeric_metrics?: Record<string, number>;
  generated_text: string;
  created_at: string;
  updated_at: string;
  copied_at?: string;
  archived_at?: string;
};

export type GenerateReportInput = {
  workspaceId?: string;
  title: string;
  type: ReportType;
  audience: ReportAudience;
  periodStart: string;
  periodEnd: string;
  clientId?: string;
  processId?: string;
  responsible?: string;
};

export type ReportTemplate = {
  type: ReportType;
  title: string;
  audience: ReportAudience;
  eyebrow: string;
  description: string;
};

type ReportContext = {
  workspaceId: string;
  clients: Client[];
  processes: Process[];
  tasks: Task[];
  agenda: AgendaEvent[];
  finance: FinancialRecord[];
  partnerships: ProcessPartnership[];
};

type ReportContent = {
  title: string;
  summary: string;
  metrics: ReportMetric[];
  numericMetrics: Record<string, number>;
  sections: ReportSection[];
};

type SupabaseReportRow = {
  id: string;
  workspace_id: string;
  title: string;
  report_type: string;
  audience: string | null;
  period_start: string | null;
  period_end: string | null;
  client_id: string | null;
  process_id: string | null;
  status: string | null;
  summary: string | null;
  generated_text: string;
  metrics: Record<string, unknown> | null;
  sections: unknown;
  filters: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  copied_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const REPORTS_STORAGE_PREFIX = "lexos.control.demo.reports";
export const REPORTS_UPDATED_EVENT = "lexos:reports-updated";
export const REPORT_DATA_MODE_LABEL = "Relatório demonstrativo gerado com dados locais.";
export const REPORT_REAL_DATA_MODE_LABEL = "Relatório gerado com dados do escritório no ambiente conectado.";
const HUMAN_REVIEW_NOTICE = "Relatório gerado com dados do escritório. Revisão humana recomendada antes de uso externo.";

export const reportTemplates: ReportTemplate[] = [
  { type: "socios_operacional", title: "Relatório para Sócios/Gestores", audience: "socios", eyebrow: "Gestão", description: "Carteira, risco, caixa, tarefas e próximos movimentos para tomada de decisão." },
  { type: "operacional_semanal", title: "Relatório Operacional da Semana", audience: "equipe", eyebrow: "Operação", description: "Cadência semanal com tarefas, prazos, reuniões, gargalos e próximos passos." },
  { type: "financeiro", title: "Relatório Financeiro", audience: "financeiro", eyebrow: "Caixa", description: "Recebíveis, vencidos, recebidos no mês, cobranças e riscos de caixa." },
  { type: "cliente", title: "Relatório de Cliente", audience: "cliente", eyebrow: "Cliente", description: "Síntese por cliente com processos, tarefas, agenda, financeiro e pendências vinculadas." },
  { type: "carteira_processos", title: "Relatório de Carteira de Processos", audience: "interno", eyebrow: "Processos", description: "Distribuição por status/fase, riscos, responsáveis e próximos prazos processuais." },
  { type: "tarefas_prazos", title: "Relatório de Tarefas e Prazos", audience: "equipe", eyebrow: "Prazos", description: "Tarefas operacionais, atrasos, revisões, prioridades urgentes e agenda crítica." },
  { type: "inadimplencia", title: "Relatório de Inadimplência/Cobrança", audience: "financeiro", eyebrow: "Cobrança", description: "Clientes inadimplentes, valores vencidos, parcelas próximas e ações consultivas." },
  { type: "personalizado", title: "Relatório Personalizado Demo", audience: "interno", eyebrow: "Demo", description: "Consolidação livre dos dados locais para leitura executiva interna." },
];

function isBrowser() { return typeof window !== "undefined"; }
function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) { return `${REPORTS_STORAGE_PREFIX}.${workspaceId}`; }
function dispatchUpdated(workspaceId = FALLBACK_WORKSPACE_ID) { if (isBrowser()) window.dispatchEvent(new CustomEvent(REPORTS_UPDATED_EVENT, { detail: { workspaceId } })); }
function makeId() { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); return `report-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nowIso() { return new Date().toISOString(); }
function isReport(value: unknown): value is Report { if (!value || typeof value !== "object") return false; const report = value as Partial<Report>; return Boolean(report.id && report.workspace_id && report.title && report.type && report.audience && Array.isArray(report.sections)); }
function safeParseReports(raw: string | null): Report[] { if (!raw) return []; try { const parsed = JSON.parse(raw) as unknown; return Array.isArray(parsed) ? parsed.filter(isReport) : []; } catch { return []; } }
function persistReports(reports: Report[], workspaceId = FALLBACK_WORKSPACE_ID) { if (!isBrowser()) return; window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(reports)); dispatchUpdated(workspaceId); }
function toDateOnly(value: string) { return value.includes("T") ? value.slice(0, 10) : value; }
function dateWithin(value: string | undefined, start: string, end: string) { if (!value) return false; const target = new Date(`${toDateOnly(value)}T12:00:00`).getTime(); return target >= new Date(`${start}T00:00:00`).getTime() && target <= new Date(`${end}T23:59:59`).getTime(); }
function addDays(days: number, from = new Date()) { const date = new Date(from); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10); }

function audienceLabel(audience: ReportAudience) { const labels: Record<ReportAudience, string> = { socios: "Sócios/Gestores", equipe: "Equipe", cliente: "Cliente", financeiro: "Financeiro", interno: "Interno" }; return labels[audience]; }
export function reportTypeLabel(type: ReportType) { return reportTemplates.find((template) => template.type === type)?.title ?? (type === "semanal" ? "Relatório Operacional da Semana" : type === "mensal" ? "Relatório Operacional do Mês" : "Relatório"); }
function normalizeReportType(value: string | null | undefined): ReportType { if (value === "semanal") return "operacional_semanal"; return reportTemplates.some((item) => item.type === value) ? (value as ReportType) : "personalizado"; }
function normalizeStatus(value: string | null | undefined): ReportStatus { return value === "copied" || value === "archived" ? value : "generated"; }
function normalizeAudience(value: string | null | undefined): ReportAudience { return value === "socios" || value === "equipe" || value === "cliente" || value === "financeiro" || value === "interno" ? value : "interno"; }
function metric(label: string, value: string | number, detail?: string, severity?: ReportSeverity): ReportMetric { return { label, value: String(value), detail, severity }; }
function section(id: string, title: string, content: string, items: string[] = [], severity: ReportSeverity = "info", source?: string): ReportSection { return { id, title, content, items: items.length ? items : undefined, severity, source }; }
function names(items: Array<{ name?: string; title?: string; client_name?: string; next_action?: string }>, empty = "Nenhum item vinculado encontrado neste período.") { return items.length ? items.slice(0, 8).map((item) => [item.name ?? item.title ?? item.client_name, item.next_action].filter(Boolean).join(" — ")) : [empty]; }
function dueItems(items: Array<{ title: string; starts_at?: string; due_at?: string; next_action?: string; responsible?: string }>, empty = "Nenhum prazo ou compromisso encontrado no período selecionado.") { return items.length ? items.slice(0, 10).map((item) => `${item.title} • ${formatDate(item.starts_at ?? item.due_at)} • ${item.responsible ?? "sem responsável"}${item.next_action ? ` — ${item.next_action}` : ""}`) : [empty]; }

function applyInputFilters(input: GenerateReportInput, raw: ReportContext): ReportContext {
  const byClient = <T extends { client_id?: string }>(items: T[]) => (input.clientId ? items.filter((item) => item.client_id === input.clientId) : items);
  const byProcess = <T extends { process_id?: string; id?: string }>(items: T[]) => (input.processId ? items.filter((item) => item.process_id === input.processId || item.id === input.processId) : items);
  const byResponsible = <T extends { responsible?: string; owner?: string }>(items: T[]) => (input.responsible ? items.filter((item) => item.responsible === input.responsible || item.owner === input.responsible) : items);
  const byPartnershipResponsible = (items: ProcessPartnership[]) => (input.responsible ? items.filter((item) => item.internal_responsible === input.responsible || item.external_responsible === input.responsible) : items);
  return {
    workspaceId: raw.workspaceId,
    clients: byResponsible(input.clientId ? raw.clients.filter((client) => client.id === input.clientId) : raw.clients),
    processes: byResponsible(byProcess(byClient(raw.processes))),
    tasks: byResponsible(byProcess(byClient(raw.tasks))).filter((task) => dateWithin(task.due_at, input.periodStart, input.periodEnd) || dateWithin(task.completed_at, input.periodStart, input.periodEnd) || task.status !== "concluida"),
    agenda: byResponsible(byProcess(byClient(raw.agenda))).filter((event) => dateWithin(event.starts_at, input.periodStart, input.periodEnd)),
    finance: byResponsible(byProcess(byClient(raw.finance))).filter((record) => dateWithin(record.due_at, input.periodStart, input.periodEnd) || dateWithin(record.paid_at, input.periodStart, input.periodEnd) || ["vencido", "pendente", "aguardando"].includes(record.status)),
    partnerships: byPartnershipResponsible(byProcess(byClient(raw.partnerships))).filter((partnership) => partnership.status !== "arquivada" || dateWithin(partnership.archived_at, input.periodStart, input.periodEnd)),
  };
}

function loadContext(input: GenerateReportInput): ReportContext {
  const workspaceId = input.workspaceId ?? FALLBACK_WORKSPACE_ID;
  return applyInputFilters(input, {
    workspaceId,
    clients: listClients(workspaceId),
    processes: listProcesses(workspaceId, { includeArchived: true }),
    tasks: listTasks(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    agenda: listAgendaEvents(workspaceId, { includeDerived: true }),
    finance: listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }),
    partnerships: listPartnerships(workspaceId, { includeArchived: true }),
  });
}

async function loadContextAsync(input: GenerateReportInput): Promise<ReportContext> {
  const workspaceId = input.workspaceId ?? FALLBACK_WORKSPACE_ID;
  const [clients, processes, tasks, agenda, finance, partnerships] = await Promise.all([
    listClientsAsync(workspaceId, { includeArchived: true }),
    listProcessesAsync(workspaceId, { includeArchived: true }),
    listTasksAsync(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    listAgendaEventsAsync(workspaceId, { includeDerived: true }),
    listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined }),
    listPartnershipsAsync(workspaceId, { includeArchived: true }),
  ]);
  return applyInputFilters(input, { workspaceId, clients, processes, tasks, agenda, finance, partnerships });
}

function buildSharedMetrics(clients: Client[], processes: Process[], tasks: Task[], agenda: AgendaEvent[], finance: FinancialRecord[], partnerships: ProcessPartnership[]) {
  const operationalTasks = tasks.filter((task) => !["concluida", "arquivada"].includes(resolveEffectiveTaskStatus(task)));
  const overdueTasks = operationalTasks.filter((task) => resolveEffectiveTaskStatus(task) === "atrasada");
  const overdueFinance = finance.filter((record) => financeMatchesView(record, "vencidos"));
  const receivable = finance.filter((record) => record.direction === "entrada" && ["previsto", "pendente", "aguardando"].includes(record.status));
  const weekDeadlines = agenda.filter((event) => event.type === "prazo");
  return {
    activeClients: clients.filter((client) => client.status === "ativo"),
    attentionClients: clients.filter((client) => client.status === "atenção"),
    activeProcesses: processes.filter((process) => process.status === "ativo"),
    riskProcesses: processes.filter((process) => ["alto", "crítico"].includes(process.risk)),
    operationalTasks,
    overdueTasks,
    completedTasks: tasks.filter((task) => task.status === "concluida"),
    weekEvents: agenda.filter((event) => ["prazo", "audiencia", "reuniao", "follow_up"].includes(event.type)),
    weekDeadlines,
    receivable,
    overdueFinance,
    paidThisMonth: finance.filter(isReceivedThisMonth),
    delinquentClients: getDelinquentClients(finance),
    activePartnerships: partnerships.filter((partnership) => ["ativa", "em_execucao"].includes(partnership.status)),
    negotiatingPartnerships: partnerships.filter((partnership) => partnership.status === "em_negociacao"),
    pendingTransferPartnerships: partnerships.filter((partnership) => partnership.status === "aguardando_repasse"),
    pendingPartnerships: partnerships.filter((partnership) => ["aguardando_documento", "aguardando_repasse", "em_negociacao"].includes(partnership.status)),
    partnershipExpected: partnerships.reduce((sum, item) => sum + (item.expected_amount ?? 0), 0),
    partnershipPaid: partnerships.reduce((sum, item) => sum + (item.paid_amount ?? 0), 0),
  };
}

function numericMetricsFromContext(ctx: ReportContext) {
  const shared = buildSharedMetrics(ctx.clients, ctx.processes, ctx.tasks, ctx.agenda, ctx.finance, ctx.partnerships);
  return {
    total_clients: ctx.clients.length,
    active_clients: shared.activeClients.length,
    attention_clients: shared.attentionClients.length,
    total_processes: ctx.processes.length,
    active_processes: shared.activeProcesses.length,
    risk_processes: shared.riskProcesses.length,
    pending_tasks: shared.operationalTasks.length,
    overdue_tasks: shared.overdueTasks.length,
    completed_tasks: shared.completedTasks.length,
    week_deadlines: shared.weekDeadlines.length,
    agenda_events: ctx.agenda.length,
    receivables_total: sumFinancialAmount(shared.receivable),
    overdue_financial_total: sumFinancialAmount(shared.overdueFinance),
    paid_month_total: sumFinancialAmount(shared.paidThisMonth),
    delinquent_clients: shared.delinquentClients.length,
    pending_partnerships: shared.pendingPartnerships.length,
  };
}

function buildReportContent(input: GenerateReportInput, context = loadContext(input)): ReportContent {
  const { clients, processes, tasks, agenda, finance, partnerships } = context;
  const shared = buildSharedMetrics(clients, processes, tasks, agenda, finance, partnerships);
  const numericMetrics = numericMetricsFromContext(context);
  const upcomingFinance = finance.filter((record) => isUpcomingRecord(record, 30));
  const client = input.clientId ? clients.find((item) => item.id === input.clientId) : undefined;
  const distribution = Object.entries(processes.reduce<Record<string, number>>((acc, process) => ({ ...acc, [process.status]: (acc[process.status] ?? 0) + 1 }), {})).map(([status, total]) => `${status}: ${total}`);
  const baseMetrics = [
    metric("Clientes em atenção", shared.attentionClients.length, "cadência e retorno", shared.attentionClients.length ? "warning" : "success"),
    metric("Processos de risco", shared.riskProcesses.length, "alto/crítico", shared.riskProcesses.length ? "critical" : "success"),
    metric("Tarefas atrasadas", shared.overdueTasks.length, "exigem priorização", shared.overdueTasks.length ? "critical" : "success"),
    metric("Valores vencidos", formatCurrency(sumFinancialAmount(shared.overdueFinance)), "cobrança ativa", shared.overdueFinance.length ? "critical" : "success"),
  ];

  if (input.type === "cliente") {
    const title = client ? `Relatório de Cliente — ${client.name}` : "Relatório de Cliente — todos os clientes";
    const empty = "Nenhum dado vinculado encontrado para este cliente neste período.";
    return {
      title,
      summary: client ? `Síntese do cliente ${client.name}, reunindo exclusivamente dados vinculados disponíveis no workspace.` : "Relatório de cliente consolidado sem cliente específico; use como visão interna, sem inventar vínculos ausentes.",
      numericMetrics,
      metrics: [metric("Processos vinculados", processes.length), metric("Tarefas vinculadas", tasks.length), metric("Agenda/Prazos", agenda.length), metric("Parcerias vinculadas", partnerships.length), metric("Financeiro vinculado", formatCurrency(sumFinancialAmount(finance.filter((record) => record.direction === "entrada"))))],
      sections: [
        section("cliente-dados", "Dados do cliente", client ? `${client.name} • ${client.document || "documento não informado"} • ${client.status} • responsável ${client.owner || "não informado"}. Pendência principal: ${client.main_pending || "não informada"}.` : "Todos os clientes foram considerados porque nenhum cliente específico foi selecionado.", client ? [client.next_action || "Sem próxima ação cadastrada."] : names(clients, empty)),
        section("cliente-processos", "Processos vinculados", processes.length ? "Processos encontrados por client_id/process_id no workspace." : empty, names(processes.map((process) => ({ title: `${process.number} • ${process.title}`, next_action: process.next_action })), empty), processes.length ? "info" : "warning", "Processos"),
        section("cliente-parcerias", "Parcerias vinculadas", partnerships.length ? "Parcerias encontradas por vínculo de cliente/processo." : empty, partnerships.length ? partnerships.map((partnership) => `${partnership.partner_name} • ${partnership.partner_firm} • ${partnership.status} • ${partnership.next_action}`) : [empty], partnerships.length ? "info" : "warning", "Parcerias"),
        section("cliente-tarefas", "Tarefas vinculadas", tasks.length ? "Tarefas do cliente no período/filtro selecionado." : empty, names(tasks, empty), tasks.length ? "info" : "warning", "Tarefas"),
        section("cliente-agenda", "Agenda e prazos vinculados", agenda.length ? "Compromissos e prazos do cliente no período." : empty, dueItems(agenda, empty), agenda.length ? "info" : "warning", "Agenda/Prazos"),
        section("cliente-financeiro", "Financeiro vinculado", finance.length ? "Registros financeiros reais vinculados ao cliente." : empty, finance.length ? finance.map((record) => `${record.title} • ${formatCurrency(record.amount)} • ${record.status} • venc. ${formatDate(record.due_at)}`) : [empty], finance.some((record) => record.status === "vencido") ? "critical" : "info", "Financeiro"),
        section("cliente-proximos", "Pendências e próximas ações", "Ações extraídas dos registros vinculados existentes.", [...names(tasks, "Sem tarefas pendentes vinculadas."), ...names(processes, "Sem processos vinculados com ação próxima.")].slice(0, 8), "warning"),
      ],
    };
  }

  if (input.type === "financeiro" || input.type === "inadimplencia") {
    const delinquentItems = shared.delinquentClients.map((item) => `${item.client_name} • ${formatCurrency(item.total)} vencidos em ${item.count} registro(s).`);
    const noFinance = "Nenhum lançamento financeiro real encontrado neste período.";
    return {
      title: input.title,
      summary: input.type === "inadimplencia" ? "Visão de inadimplência e cobrança consultiva baseada em lançamentos vencidos, pendentes e próximos." : "Visão financeira operacional com valores a receber, vencidos, pagos no mês e riscos de caixa em BRL.",
      numericMetrics,
      metrics: [metric("Valores a receber", formatCurrency(sumFinancialAmount(shared.receivable)), "pendente/aguardando/previsto", "info"), metric("Valores vencidos", formatCurrency(sumFinancialAmount(shared.overdueFinance)), "não pagos/cancelados/arquivados", shared.overdueFinance.length ? "critical" : "success"), metric("Recebidos no mês", formatCurrency(sumFinancialAmount(shared.paidThisMonth)), "status pago", "success"), metric("Clientes inadimplentes", shared.delinquentClients.length, "com vencidos", shared.delinquentClients.length ? "warning" : "success")],
      sections: [
        section("financeiro-status", "Leitura dos status financeiros", finance.length ? "Pendente exige ação ativa; aguardando depende de retorno/pagamento externo; previsto é vencimento futuro; vencido é passado não pago; pago é recebido/quitado." : noFinance, [], finance.length ? "info" : "warning", "Financeiro"),
        section("financeiro-cobrancas", "Cobranças pendentes e vencidas", shared.overdueFinance.length ? "Registros que precisam de cobrança consultiva." : noFinance, shared.overdueFinance.length ? shared.overdueFinance.map((record) => `${record.client_name ?? "Sem cliente"} • ${record.title} • ${formatCurrency(record.amount)} • ${record.status} • ${record.next_action}`) : [noFinance], shared.overdueFinance.length ? "critical" : "success"),
        section("financeiro-inadimplentes", "Clientes inadimplentes", delinquentItems.length ? "Clientes com valores vencidos no recorte." : "Nenhum cliente inadimplente encontrado neste período.", delinquentItems.length ? delinquentItems : ["Nenhum cliente inadimplente encontrado neste período."], delinquentItems.length ? "warning" : "success"),
        section("financeiro-proximas", "Parcelas próximas e receita prevista", upcomingFinance.length ? "Recebíveis próximos que merecem acompanhamento preventivo." : "Nenhuma parcela próxima no recorte.", upcomingFinance.map((record) => `${record.client_name ?? "Sem cliente"} • ${formatCurrency(record.amount)} • ${record.status} • ${formatDate(record.due_at)}`), "info"),
        section("financeiro-acoes", "Próximas ações de cobrança", "Ações operacionais sugeridas a partir dos próprios registros financeiros.", finance.filter((record) => ["pendente", "aguardando", "vencido"].includes(record.status)).slice(0, 8).map((record) => `${record.responsible || "Sem responsável"}: ${record.next_action || "Registrar próximo contato"} (${record.client_name ?? record.title})`), "warning"),
      ],
    };
  }

  if (input.type === "carteira_processos") {
    return { title: input.title, summary: "Carteira processual consolidada por risco, status, fase, responsáveis, parcerias vinculadas e próximos prazos processuais.", numericMetrics, metrics: [metric("Processos ativos", shared.activeProcesses.length), metric("Em atenção", processes.filter((process) => process.status === "atenção").length, undefined, "warning"), metric("Risco alto/crítico", shared.riskProcesses.length, undefined, shared.riskProcesses.length ? "critical" : "success"), metric("Arquivados", processes.filter((process) => process.status === "arquivado").length)], sections: [section("processos-risco", "Processos em atenção/risco", "Casos com risco alto/crítico ou status em atenção.", shared.riskProcesses.length ? shared.riskProcesses.map((process) => `${process.number} • ${process.client_name} • risco ${process.risk} • ${process.next_action}`) : ["Sem processos de risco alto/crítico no recorte."], shared.riskProcesses.length ? "critical" : "success"), section("processos-prazos", "Prazos processuais próximos", "Prazos derivados da carteira processual.", dueItems(processes.map((process) => ({ title: `${process.number} • ${process.title}`, due_at: process.next_deadline_at, responsible: process.responsible, next_action: process.next_action }))), "warning"), section("processos-distribuicao", "Distribuição por status/fase", "Resumo simples para leitura de carteira.", distribution.length ? [...distribution, ...processes.slice(0, 8).map((process) => `${process.phase} • ${process.responsible}`)] : ["Nenhum processo encontrado no recorte."], "info"), section("processos-parcerias", "Parcerias vinculadas", partnerships.length ? "Parcerias associadas à carteira processual." : "Nenhuma parceria vinculada encontrada.", partnerships.map((partnership) => `${partnership.process_number ?? "Sem processo"} • ${partnership.partner_name} • ${partnership.status} • ${partnership.main_pending}`), partnerships.length ? "info" : "success"), section("processos-acoes", "Próximas ações", "Ações extraídas dos processos cadastrados.", processes.slice(0, 10).map((process) => `${process.responsible || "Sem responsável"}: ${process.next_action || "Sem próxima ação"} (${process.client_name})`), "info")] };
  }

  if (input.type === "tarefas_prazos") {
    const review = tasks.filter((task) => ["em_revisao", "aguardando"].includes(task.status));
    const urgent = tasks.filter((task) => task.priority === "urgente" || task.priority === "máxima");
    return { title: input.title, summary: "Mapa operacional de tarefas, prazos e compromissos para priorização da equipe no período selecionado.", numericMetrics, metrics: [metric("Operacionais", shared.operationalTasks.length), metric("Concluídas", shared.completedTasks.length, undefined, "success"), metric("Atrasadas", shared.overdueTasks.length, undefined, shared.overdueTasks.length ? "critical" : "success"), metric("Urgentes/Máximas", urgent.length, undefined, urgent.length ? "warning" : "success")], sections: [section("tarefas-operacionais", "Tarefas operacionais", "Tarefas não arquivadas nem concluídas no recorte.", names(shared.operationalTasks, "Sem tarefas operacionais no recorte."), "info"), section("tarefas-atrasadas", "Atrasadas e urgentes", shared.overdueTasks.length || urgent.length ? "Itens que pedem despacho imediato." : "Sem atraso ou urgência crítica no recorte.", names([...shared.overdueTasks, ...urgent], "Sem atraso ou urgência crítica no recorte."), shared.overdueTasks.length || urgent.length ? "critical" : "success"), section("tarefas-revisao", "Em revisão/aguardando", review.length ? "Itens que dependem de validação ou retorno." : "Nenhuma tarefa em revisão/aguardando neste recorte.", names(review, "Nenhuma tarefa em revisão/aguardando neste recorte."), review.length ? "warning" : "success"), section("tarefas-agenda", "Compromissos de agenda e prazos da semana", "Compromissos vinculados ao período selecionado.", dueItems(agenda), "warning"), section("tarefas-proximos", "Próximos passos por responsável", "Ações sugeridas a partir dos próprios registros.", tasks.slice(0, 10).map((task) => `${task.responsible || "Sem responsável"}: ${task.next_action || "Sem próxima ação"} (${task.title})`), "info")] };
  }

  if (input.type === "operacional_semanal" || input.type === "semanal") {
    return { title: input.title, summary: "Fechamento operacional da semana com tarefas, prazos, reuniões, clientes em atenção, processos de risco, parcerias pendentes e gargalos.", numericMetrics, metrics: [metric("Concluídas", shared.completedTasks.length, "semana/período", "success"), metric("Pendentes", shared.operationalTasks.length, "operacionais", "warning"), metric("Atrasadas", shared.overdueTasks.length, "exigem ação", shared.overdueTasks.length ? "critical" : "success"), metric("Agenda crítica", shared.weekEvents.length, "prazos/reuniões/audiências"), metric("Parcerias pendentes", shared.pendingPartnerships.length, "documentos/repasses")], sections: [section("semana-tarefas", "Tarefas da semana", "Concluídas, pendentes e atrasadas no recorte.", [...names(shared.completedTasks, "Sem tarefas concluídas no período."), ...names(shared.operationalTasks, "Sem tarefas pendentes no período.")].slice(0, 10), "info"), section("semana-agenda", "Prazos próximos, audiências e reuniões", "Compromissos relevantes do período.", dueItems(shared.weekEvents), "warning"), section("semana-clientes", "Clientes sem retorno/em atenção", "Clientes com status de atenção ou pendência principal cadastrada.", shared.attentionClients.length ? shared.attentionClients.map((client) => `${client.name} • ${client.main_pending} • ${client.next_action}`) : ["Sem clientes em atenção no recorte."], shared.attentionClients.length ? "warning" : "success"), section("semana-processos", "Processos com risco/movimentação", "Processos que pedem leitura tática.", shared.riskProcesses.length ? shared.riskProcesses.map((process) => `${process.client_name} • ${process.phase} • risco ${process.risk} • ${process.next_action}`) : ["Sem processos de risco no recorte."], shared.riskProcesses.length ? "critical" : "success"), section("semana-parcerias", "Pendências de parcerias", shared.pendingPartnerships.length ? "Parcerias com negociação, documentação ou repasse pendente." : "Sem pendências de parcerias no recorte.", shared.pendingPartnerships.map((partnership) => `${partnership.partner_name} • ${partnership.status} • ${partnership.main_pending}`), shared.pendingPartnerships.length ? "warning" : "success"), section("semana-gargalos", "Gargalos e próximos passos", "Síntese operacional determinística com base em atrasos, aguardando e vencidos.", [shared.overdueTasks.length ? `Regularizar ${shared.overdueTasks.length} tarefa(s) atrasada(s) antes de abrir novas frentes.` : "Manter checkpoint leve para preservar a cadência.", shared.overdueFinance.length ? `Alinhar cobrança de ${formatCurrency(sumFinancialAmount(shared.overdueFinance))} vencidos.` : "Sem pressão financeira vencida relevante no recorte.", shared.riskProcesses.length ? "Priorizar revisão dos processos de risco alto/crítico." : "Carteira sem risco alto/crítico relevante no recorte."], "warning")] };
  }

  return { title: input.title, summary: input.type === "socios_operacional" ? "Visão executiva para sócios/gestores com carteira, operação, prazos, caixa e decisões sugeridas." : "Relatório personalizado consolidando dados disponíveis dos módulos internos.", numericMetrics, metrics: [metric("Clientes ativos", shared.activeClients.length), metric("Processos ativos", shared.activeProcesses.length), metric("Parcerias ativas", shared.activePartnerships.length), metric("Parcerias em negociação", shared.negotiatingPartnerships.length), metric("Aguardando repasse", shared.pendingTransferPartnerships.length), ...baseMetrics], sections: [section("socios-carteira", "Carteira e clientes", "Clientes ativos, clientes em atenção e sinais de relacionamento.", [...shared.activeClients.slice(0, 5).map((client) => `${client.name} • ativo • ${client.next_action}`), ...shared.attentionClients.map((client) => `${client.name} • atenção • ${client.main_pending}`)], shared.attentionClients.length ? "warning" : "success"), section("socios-processos", "Processos e riscos", "Processos ativos, de risco e próximos movimentos estratégicos.", shared.riskProcesses.length ? shared.riskProcesses.map((process) => `${process.number} • ${process.client_name} • risco ${process.risk} • ${process.next_action}`) : ["Sem processos de risco alto/crítico no recorte."], shared.riskProcesses.length ? "critical" : "success"), section("socios-operacao", "Tarefas, prazos e compromissos", "Carga operacional relevante para a semana/período.", [...names(shared.operationalTasks, "Sem tarefas operacionais pendentes."), ...dueItems(shared.weekEvents, "Sem prazos/compromissos críticos no período.")].slice(0, 12), shared.overdueTasks.length ? "critical" : "info"), section("socios-financeiro", "Financeiro e inadimplência", "Recebíveis, vencidos, clientes inadimplentes e valores de parcerias da base real/local.", [`A receber: ${formatCurrency(sumFinancialAmount(shared.receivable))}`, `Vencidos: ${formatCurrency(sumFinancialAmount(shared.overdueFinance))}`, `Clientes inadimplentes: ${shared.delinquentClients.length}`, `Parcerias previstas: ${formatCurrency(shared.partnershipExpected)}`, `Parcerias repassadas: ${formatCurrency(shared.partnershipPaid)}`], shared.overdueFinance.length || shared.pendingTransferPartnerships.length ? "critical" : "success"), section("socios-parcerias", "Parcerias jurídicas", "Leitura executiva de parcerias ativas, em negociação e aguardando repasse.", partnerships.length ? partnerships.slice(0, 10).map((partnership) => `${partnership.partner_name} • ${partnership.partner_firm} • ${partnership.status} • ${partnership.main_pending}`) : ["Nenhuma parceria cadastrada no recorte."], shared.pendingPartnerships.length ? "warning" : "success"), section("socios-acoes", "Pontos de atenção e próximas ações sugeridas", "Ações operacionais extraídas dos dados existentes, sem IA real.", [shared.overdueTasks.length ? "Despachar tarefas atrasadas com responsável e prazo de regularização." : "Manter rotina de acompanhamento das tarefas operacionais.", shared.riskProcesses.length ? "Realizar checkpoint jurídico dos processos de risco alto/crítico." : "Preservar monitoramento da carteira ativa.", shared.overdueFinance.length ? "Executar cobrança consultiva dos valores vencidos e registrar retorno." : "Acompanhar recebíveis previstos sem acionar cobrança agressiva."], "warning")] };
}

function buildMarkdown(report: Omit<Report, "generated_text">, realMode = false) {
  const modeLabel = realMode ? REPORT_REAL_DATA_MODE_LABEL : REPORT_DATA_MODE_LABEL;
  const lines = [`# ${report.title}`, "", `**Tipo:** ${reportTypeLabel(report.type)}`, `**Público:** ${audienceLabel(report.audience)}`, `**Período:** ${formatDate(report.period_start)} a ${formatDate(report.period_end)}`, `**Gerado em:** ${formatDate(report.created_at)}`, "", `> ${modeLabel} Sem IA real e sem integrações externas ativadas.`, "", "## Resumo executivo", report.summary, "", "## Indicadores principais", ...report.metrics.map((item) => `- **${item.label}:** ${item.value}${item.detail ? ` — ${item.detail}` : ""}`), ""];
  report.sections.forEach((item) => { lines.push(`## ${item.title}`, item.content); if (item.items?.length) lines.push(...item.items.map((entry) => `- ${entry}`)); lines.push(""); });
  lines.push("## Aviso", HUMAN_REVIEW_NOTICE, "", "---", modeLabel);
  return lines.join("\n");
}

function buildReportFromContent(input: GenerateReportInput, content: ReportContent, realMode = false): Report {
  const workspaceId = input.workspaceId ?? FALLBACK_WORKSPACE_ID;
  const timestamp = nowIso();
  const reportWithoutText: Omit<Report, "generated_text"> = { id: makeId(), workspace_id: workspaceId, title: input.title.trim() || content.title || reportTypeLabel(input.type), type: input.type === "semanal" ? "operacional_semanal" : input.type, audience: input.audience, period_start: input.periodStart, period_end: input.periodEnd, client_id: input.clientId || undefined, process_id: input.processId || undefined, responsible: input.responsible || undefined, status: "generated", summary: content.summary, sections: content.sections, metrics: content.metrics, numeric_metrics: content.numericMetrics, created_at: timestamp, updated_at: timestamp };
  return { ...reportWithoutText, generated_text: buildMarkdown(reportWithoutText, realMode) };
}

export function getDefaultReportPeriod(type: ReportType) { if (type === "mensal" || type === "financeiro") return { periodStart: monthStartIso(), periodEnd: addDays(30) }; return { periodStart: todayIso(), periodEnd: addDays(7) }; }
export function generateReport(input: GenerateReportInput): Report { const report = buildReportFromContent(input, buildReportContent(input)); saveReport(report, input.workspaceId ?? FALLBACK_WORKSPACE_ID); return report; }

const REPORT_SELECT = "id, workspace_id, title, report_type, audience, period_start, period_end, client_id, process_id, status, summary, generated_text, metrics, sections, filters, metadata, copied_at, archived_at, created_at, updated_at";
function displayMetricsFromMetadata(metadata: Record<string, unknown> | null | undefined, metrics: Record<string, unknown> | null | undefined): ReportMetric[] { const display = metadata?.display_metrics; if (Array.isArray(display)) return display.filter((item): item is ReportMetric => Boolean(item && typeof item === "object" && "label" in item)); return Object.entries(metrics || {}).map(([key, value]) => metric(humanizeLabel(key), typeof value === "number" ? String(value) : String(value ?? "0"))); }
function sectionsFromRow(value: unknown): ReportSection[] { return Array.isArray(value) ? value.filter((item): item is ReportSection => Boolean(item && typeof item === "object" && "id" in item && "title" in item)) : []; }
function fromSupabaseReport(row: SupabaseReportRow): Report { const metadata = row.metadata || {}; const filters = row.filters || {}; const timestamp = row.updated_at || row.created_at || nowIso(); return { id: row.id, workspace_id: row.workspace_id, title: row.title, type: normalizeReportType(row.report_type), audience: normalizeAudience(row.audience), period_start: row.period_start || String(filters.periodStart || ""), period_end: row.period_end || String(filters.periodEnd || ""), client_id: row.client_id || undefined, process_id: row.process_id || undefined, responsible: typeof filters.responsible === "string" ? filters.responsible : undefined, status: normalizeStatus(row.status), summary: row.summary || "", sections: sectionsFromRow(row.sections), metrics: displayMetricsFromMetadata(metadata, row.metrics), numeric_metrics: Object.fromEntries(Object.entries(row.metrics || {}).filter(([, value]) => typeof value === "number")) as Record<string, number>, generated_text: row.generated_text, created_at: row.created_at || timestamp, updated_at: timestamp, copied_at: row.copied_at || undefined, archived_at: row.archived_at || undefined } }
function toSupabaseReport(report: Report, createdBy: string | null) { return { workspace_id: report.workspace_id, created_by: createdBy, title: report.title, report_type: report.type, audience: report.audience, period_start: report.period_start || null, period_end: report.period_end || null, client_id: report.client_id || null, process_id: report.process_id || null, status: report.status, summary: report.summary, generated_text: report.generated_text, metrics: report.numeric_metrics || {}, sections: report.sections, filters: { periodStart: report.period_start, periodEnd: report.period_end, clientId: report.client_id || null, processId: report.process_id || null, responsible: report.responsible || null }, metadata: { display_metrics: report.metrics, source: "lexos_control_deterministic", no_ai: true } }; }

export function saveReport(report: Report, workspaceId = report.workspace_id) { const reports = listReports(workspaceId, { includeArchived: true }); persistReports([report, ...reports.filter((item) => item.id !== report.id)], workspaceId); return report; }
export async function saveReportAsync(report: Report, workspaceId = report.workspace_id) { if (!shouldUseWorkspaceSupabase()) return saveReport(report, workspaceId); const supabase = createSupabaseClient(); if (!supabase) throw new Error("Supabase não disponível para salvar relatório real."); const { data: authData } = await (supabase as any).auth.getUser(); const { data, error } = await (supabase as any).from("reports").insert(toSupabaseReport({ ...report, workspace_id: workspaceId }, authData?.user?.id ?? null)).select(REPORT_SELECT).single(); if (error) { warnSupabaseOperationalError("Relatórios", error); throw error; } dispatchUpdated(workspaceId); const saved = fromSupabaseReport(data as SupabaseReportRow); await logReportActivity({ workspaceId, action: "report_generated", entityId: saved.id, title: saved.title, description: `Relatório ${saved.title} gerado.` }); return saved; }
export async function generateReportAsync(input: GenerateReportInput): Promise<Report> { if (!shouldUseWorkspaceSupabase()) return generateReport(input); const context = await loadContextAsync(input); const report = buildReportFromContent(input, buildReportContent(input, context), true); return saveReportAsync(report, input.workspaceId ?? FALLBACK_WORKSPACE_ID); }

export function listReports(workspaceId = FALLBACK_WORKSPACE_ID, options: { includeArchived?: boolean; archivedOnly?: boolean; type?: ReportType | "todos"; audience?: ReportAudience | "todos" } = {}) { const reports = safeParseReports(isBrowser() ? window.localStorage.getItem(storageKey(workspaceId)) : null); return reports.filter((report) => (options.archivedOnly ? Boolean(report.archived_at) : options.includeArchived ? true : !report.archived_at)).filter((report) => (options.type && options.type !== "todos" ? report.type === options.type : true)).filter((report) => (options.audience && options.audience !== "todos" ? report.audience === options.audience : true)).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
export async function listReportsAsync(workspaceId = FALLBACK_WORKSPACE_ID, options: { includeArchived?: boolean; archivedOnly?: boolean; type?: ReportType | "todos"; audience?: ReportAudience | "todos" } = {}) { if (!shouldUseWorkspaceSupabase()) return listReports(workspaceId, options); const supabase = createSupabaseClient(); if (!supabase) return []; try { const { data, error } = await (supabase as any).from("reports").select(REPORT_SELECT).eq("workspace_id", workspaceId).order("created_at", { ascending: false }); if (error) throw error; return ((data || []) as SupabaseReportRow[]).map(fromSupabaseReport).filter((report) => (options.archivedOnly ? Boolean(report.archived_at) || report.status === "archived" : options.includeArchived ? true : !report.archived_at && report.status !== "archived")).filter((report) => (options.type && options.type !== "todos" ? report.type === options.type : true)).filter((report) => (options.audience && options.audience !== "todos" ? report.audience === options.audience : true)); } catch (error) { warnSupabaseOperationalError("Relatórios", error); return []; } }
export function getReportById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listReports(workspaceId, { includeArchived: true }).find((report) => report.id === id) ?? null; }
export async function getReportByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { if (!shouldUseWorkspaceSupabase()) return getReportById(id, workspaceId); const supabase = createSupabaseClient(); if (!supabase) return null; try { const { data, error } = await (supabase as any).from("reports").select(REPORT_SELECT).eq("workspace_id", workspaceId).eq("id", id).maybeSingle(); if (error) throw error; return data ? fromSupabaseReport(data as SupabaseReportRow) : null; } catch (error) { warnSupabaseOperationalError("Relatórios", error); return null; } }
export function archiveReport(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { const timestamp = nowIso(); let archived: Report | null = null; const reports = listReports(workspaceId, { includeArchived: true }).map((report) => { if (report.id !== id) return report; archived = { ...report, status: "archived", archived_at: timestamp, updated_at: timestamp }; return archived; }); persistReports(reports, workspaceId); return archived; }
export async function archiveReportAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { if (!shouldUseWorkspaceSupabase()) return archiveReport(id, workspaceId); const supabase = createSupabaseClient(); if (!supabase) throw new Error("Supabase não disponível para arquivar relatório real."); const timestamp = nowIso(); const { data, error } = await (supabase as any).from("reports").update({ status: "archived", archived_at: timestamp }).eq("workspace_id", workspaceId).eq("id", id).select(REPORT_SELECT).single(); if (error) { warnSupabaseOperationalError("Relatórios", error); throw error; } dispatchUpdated(workspaceId); const archived = fromSupabaseReport(data as SupabaseReportRow); await logReportActivity({ workspaceId, action: "report_archived", entityId: archived.id, title: archived.title, description: `Relatório ${archived.title} arquivado.` }); return archived; }
export async function markReportCopiedAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { const timestamp = nowIso(); if (!shouldUseWorkspaceSupabase()) { const reports = listReports(workspaceId, { includeArchived: true }).map((report) => report.id === id ? { ...report, status: "copied" as ReportStatus, copied_at: timestamp, updated_at: timestamp } : report); persistReports(reports, workspaceId); return reports.find((report) => report.id === id) ?? null; } const supabase = createSupabaseClient(); if (!supabase) return null; try { const { data, error } = await (supabase as any).from("reports").update({ status: "copied", copied_at: timestamp }).eq("workspace_id", workspaceId).eq("id", id).select(REPORT_SELECT).single(); if (error) throw error; dispatchUpdated(workspaceId); const copied = fromSupabaseReport(data as SupabaseReportRow); await logReportActivity({ workspaceId, action: "report_copied", entityId: copied.id, title: copied.title, description: `Relatório ${copied.title} copiado.` }); return copied; } catch (error) { warnSupabaseOperationalError("Relatórios", error); return null; } }
export function updateReportTitle(id: string, title: string, workspaceId = FALLBACK_WORKSPACE_ID) { const timestamp = nowIso(); let updated: Report | null = null; const reports = listReports(workspaceId, { includeArchived: true }).map((report) => { if (report.id !== id) return report; const base = { ...report, title: title.trim() || report.title, updated_at: timestamp }; updated = { ...base, generated_text: buildMarkdown(base) }; return updated; }); persistReports(reports, workspaceId); return updated; }
export async function updateReportTitleAsync(id: string, title: string, workspaceId = FALLBACK_WORKSPACE_ID) { if (!shouldUseWorkspaceSupabase()) return updateReportTitle(id, title, workspaceId); const current = await getReportByIdAsync(id, workspaceId); if (!current) return null; const base = { ...current, title: title.trim() || current.title, updated_at: nowIso() }; const generatedText = buildMarkdown(base, true); const supabase = createSupabaseClient(); if (!supabase) throw new Error("Supabase não disponível para atualizar relatório real."); const { data, error } = await (supabase as any).from("reports").update({ title: base.title, generated_text: generatedText }).eq("workspace_id", workspaceId).eq("id", id).select(REPORT_SELECT).single(); if (error) { warnSupabaseOperationalError("Relatórios", error); throw error; } dispatchUpdated(workspaceId); return fromSupabaseReport(data as SupabaseReportRow); }

function buildQuickIndicators(reports: Report[], clients: Client[], tasks: Task[], finance: FinancialRecord[], partnerships: ProcessPartnership[], real = false) { const activeReports = reports.filter((report) => !report.archived_at && report.status !== "archived"); const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); const criticalTasks = tasks.filter((task) => !["concluida", "arquivada"].includes(resolveEffectiveTaskStatus(task)) && (resolveEffectiveTaskStatus(task) === "atrasada" || task.priority === "urgente")); return [metric("Relatórios gerados", activeReports.length, real ? "histórico real" : "histórico local", "info"), metric("Relatórios da semana", activeReports.filter((report) => new Date(report.created_at) >= weekStart).length, "últimos 7 dias", "success"), metric("Financeiro crítico", formatCurrency(sumFinancialAmount(finance.filter((record) => financeMatchesView(record, "vencidos")))), "vencidos", finance.some((record) => financeMatchesView(record, "vencidos")) ? "critical" : "success"), metric("Clientes em atenção", clients.filter((client) => client.status === "atenção").length, "cadência", "warning"), metric("Prazos/tarefas críticas", criticalTasks.length, "atrasadas/urgentes", criticalTasks.length ? "critical" : "success"), metric("Parcerias ativas", partnerships.filter((partnership) => ["ativa", "em_execucao"].includes(partnership.status)).length, "processos", "info")]; }
export function getReportQuickIndicators(workspaceId = FALLBACK_WORKSPACE_ID) { return buildQuickIndicators(listReports(workspaceId, { includeArchived: true }), listClients(workspaceId), listTasks(workspaceId, { status: "todas", includeArchived: true }), listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }), listPartnerships(workspaceId, { includeArchived: true })); }
export async function getReportQuickIndicatorsAsync(workspaceId = FALLBACK_WORKSPACE_ID) { if (!shouldUseWorkspaceSupabase()) return getReportQuickIndicators(workspaceId); const [reports, clients, tasks, finance, partnerships] = await Promise.all([listReportsAsync(workspaceId, { includeArchived: true }), listClientsAsync(workspaceId, { includeArchived: true }), listTasksAsync(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }), listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined }), listPartnershipsAsync(workspaceId, { includeArchived: true })]); return buildQuickIndicators(reports, clients, tasks, finance, partnerships, true); }
export function getLocalReportSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) { return listReports(workspaceId).map((report) => ({ type: "Relatórios", title: report.title, description: `${reportTypeLabel(report.type)} • ${audienceLabel(report.audience)} • ${report.summary}`, route: `/relatorios?reportId=${report.id}`, action: "Abrir relatório" })); }
export async function getReportSearchResultsAsync(workspaceId = FALLBACK_WORKSPACE_ID) { const reports = await listReportsAsync(workspaceId); return reports.map((report) => ({ type: "Relatórios", title: report.title, description: `${reportTypeLabel(report.type)} • ${audienceLabel(report.audience)} • ${report.summary}`, route: `/relatorios?reportId=${report.id}`, action: "Abrir relatório" })); }
