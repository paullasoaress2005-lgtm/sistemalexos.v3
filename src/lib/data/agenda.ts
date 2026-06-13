import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { getDataSource, shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logAgendaActivity } from "@/lib/data/activityLogs";
import { FALLBACK_WORKSPACE_ID } from "./clients";
import { listProcesses, listProcessesAsync, type ProcessRisk } from "./processes";
import { listTasks, listTasksAsync, resolveEffectiveTaskStatus } from "./tasks";

export type AgendaEventType = "prazo" | "audiencia" | "reuniao" | "atendimento" | "follow_up" | "interno" | "financeiro" | "outro";
export type AgendaEventStatus = "agendado" | "em_andamento" | "concluido" | "remarcado" | "cancelado" | "arquivado";
export type AgendaPriority = "baixa" | "média" | "alta" | "urgente" | "máxima";
export type AgendaRisk = "baixo" | "médio" | "alto" | "crítico";
export type AgendaDataMode = "demo_local" | "supabase_ready" | "google_calendar_ready";
export type AgendaSource = "agenda" | "task" | "process";

export type AgendaEvent = {
  id: string;
  workspace_id: string;
  client_id?: string;
  client_name?: string;
  process_id?: string;
  process_number?: string;
  process_title?: string;
  task_id?: string;
  task_title?: string;
  title: string;
  description: string;
  type: AgendaEventType;
  status: AgendaEventStatus;
  priority: AgendaPriority;
  risk?: AgendaRisk;
  responsible: string;
  starts_at: string;
  ends_at?: string;
  reminder_at?: string;
  location?: string;
  next_action: string;
  notes: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  canceled_at?: string;
  archived_at?: string;
  source?: AgendaSource;
  source_label?: string;
  source_route?: string;
  editable?: boolean;
};

export type AgendaInput = Omit<AgendaEvent, "id" | "workspace_id" | "created_at" | "updated_at" | "completed_at" | "canceled_at" | "archived_at" | "source" | "source_label" | "source_route" | "editable"> & {
  completed_at?: string;
  canceled_at?: string;
  archived_at?: string;
};

export type AgendaView = "operacional" | "hoje" | "semana" | "prazos" | "audiencias" | "reunioes" | "followups" | "concluidos" | "arquivados";
export type AgendaProvider = "local_demo" | "supabase" | "google_calendar";

export type AgendaFilters = {
  type?: AgendaEventType | "todos";
  status?: AgendaEventStatus | "todos";
  priority?: AgendaPriority | "todas";
  responsible?: string | "todos";
  clientId?: string;
  processId?: string;
  taskId?: string;
  query?: string;
  periodStart?: string;
  periodEnd?: string;
  view?: AgendaView;
  includeDerived?: boolean;
};

const DEMO_AGENDA_STORAGE_PREFIX = "lexos.control.demo.agenda";
export const AGENDA_DATA_MODE: AgendaDataMode = shouldUseWorkspaceSupabase() ? "supabase_ready" : "demo_local";
export const AGENDA_DATA_MODE_LABEL = "Modo demonstração: agenda salva no navegador, sem calendário externo ou sincronização.";
export const AGENDA_REAL_DATA_MODE_LABEL =
  getDataSource() === "supabase"
    ? "Ambiente conectado: agenda e vínculos carregados exclusivamente do escritório. Calendário externo, notificações e automações seguem desconectados."
    : AGENDA_DATA_MODE_LABEL;
export const AGENDA_UPDATED_EVENT = "lexos:agenda-updated";

const seedEvents: AgendaEvent[] = [
  { id: "agenda-demo-1", workspace_id: FALLBACK_WORKSPACE_ID, client_name: "Marina Salles", process_number: "1023387-44", title: "Audiência de instrução", description: "Confirmar testemunhas, documentos de apoio e estratégia de perguntas antes da audiência.", type: "audiencia", status: "agendado", priority: "urgente", risk: "crítico", responsible: "Dr. Rafael", starts_at: "2026-05-13T09:00:00.000Z", ends_at: "2026-05-13T11:30:00.000Z", reminder_at: "2026-05-13T08:00:00.000Z", location: "Fórum Trabalhista • sala 3 / link a confirmar", next_action: "Validar presença das testemunhas e levar checklist de documentos.", notes: "Evento demonstrativo próprio da agenda, sem intimação real.", created_at: "2026-05-06T09:00:00.000Z", updated_at: "2026-05-12T10:00:00.000Z", source: "agenda", source_label: "Evento", editable: true },
  { id: "agenda-demo-2", workspace_id: FALLBACK_WORKSPACE_ID, client_name: "Grupo Ápice", process_number: "5009123-18", title: "Reunião executiva Grupo Ápice", description: "Alinhamento sobre réplica, documentos faltantes e riscos da fase atual.", type: "reuniao", status: "agendado", priority: "alta", risk: "alto", responsible: "Dra. Helena", starts_at: "2026-05-13T15:00:00.000Z", ends_at: "2026-05-13T16:00:00.000Z", reminder_at: "2026-05-13T14:30:00.000Z", location: "Sala premium / videoconferência demonstrativa", next_action: "Levar pendências consolidadas e proposta de cronograma.", notes: "Sem integração real com Google Meet.", created_at: "2026-05-07T09:00:00.000Z", updated_at: "2026-05-12T11:00:00.000Z", source: "agenda", source_label: "Evento", editable: true },
  { id: "agenda-demo-3", workspace_id: FALLBACK_WORKSPACE_ID, client_name: "Villa Norte SPE", process_number: "0008821-77", title: "Follow-up de documentos societários", description: "Cobrança consultiva de contrato social atualizado para desbloquear a due diligence.", type: "follow_up", status: "agendado", priority: "alta", risk: "médio", responsible: "Dra. Camila", starts_at: "2026-05-15T10:30:00.000Z", reminder_at: "2026-05-15T09:30:00.000Z", location: "WhatsApp/e-mail demonstrativo", next_action: "Enviar lembrete humano com prazo objetivo.", notes: "Follow-up local; Gmail/WhatsApp não conectados.", created_at: "2026-05-08T09:00:00.000Z", updated_at: "2026-05-12T12:00:00.000Z", source: "agenda", source_label: "Evento", editable: true },
  { id: "agenda-demo-4", workspace_id: FALLBACK_WORKSPACE_ID, title: "Comitê financeiro interno", description: "Revisar cobranças vencidas, recebíveis e próximos contatos estratégicos.", type: "financeiro", status: "concluido", priority: "média", responsible: "Carla Nogueira", starts_at: "2026-05-12T16:00:00.000Z", ends_at: "2026-05-12T17:00:00.000Z", next_action: "Atualizar lista de valores vencidos.", notes: "Histórico demonstrativo concluído.", created_at: "2026-05-05T09:00:00.000Z", updated_at: "2026-05-12T17:10:00.000Z", completed_at: "2026-05-12T17:10:00.000Z", source: "agenda", source_label: "Evento", editable: true },
];

function isBrowser() { return typeof window !== "undefined"; }
function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) { return `${DEMO_AGENDA_STORAGE_PREFIX}.${workspaceId}`; }
function nowIso() { return new Date().toISOString(); }
function makeId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `agenda-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function persistEvents(events: AgendaEvent[], workspaceId = FALLBACK_WORKSPACE_ID) { if (!isBrowser()) return; window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(events)); window.dispatchEvent(new CustomEvent(AGENDA_UPDATED_EVENT, { detail: { workspaceId } })); }
function safeParse(raw: string | null): AgendaEvent[] | null { try { const parsed = raw ? JSON.parse(raw) as unknown : null; return Array.isArray(parsed) ? parsed.filter(isAgendaEvent) : null; } catch { return null; } }
function isAgendaEvent(value: unknown): value is AgendaEvent { if (!value || typeof value !== "object") return false; const event = value as Partial<AgendaEvent>; return Boolean(event.id && event.workspace_id && event.title && event.type && event.status && event.starts_at); }
function toDateOnly(value: string) { return value.length <= 10 ? value : value.slice(0, 10); }
function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function endOfDay(date: Date) { const next = new Date(date); next.setHours(23, 59, 59, 999); return next; }
function isOperational(event: AgendaEvent) { return ["agendado", "em_andamento", "remarcado"].includes(event.status) && !event.archived_at && !event.canceled_at; }

export function getInitialAgendaEvents(workspaceId = FALLBACK_WORKSPACE_ID): AgendaEvent[] {
  return seedEvents.map((event) => ({ ...event, workspace_id: workspaceId, editable: event.editable ?? true, source: "agenda", source_label: "Evento" }));
}

function getOwnAgendaSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParse(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getInitialAgendaEvents(workspaceId);
}

export function listOwnAgendaEvents(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) return [];
  return getOwnAgendaSource(workspaceId).map((event) => ({ ...event, source: event.source ?? "agenda", source_label: event.source_label ?? "Evento", editable: event.editable ?? true }));
}

function deriveTaskEvent(task: Awaited<ReturnType<typeof listTasksAsync>>[number] | ReturnType<typeof listTasks>[number]): AgendaEvent {
  const status = resolveEffectiveTaskStatus(task);
  return {
    id: `task-agenda-${task.id}`,
    workspace_id: task.workspace_id,
    client_id: task.client_id,
    client_name: task.client_name,
    process_id: task.process_id,
    process_number: task.process_number,
    task_id: task.id,
    task_title: task.title,
    title: task.title,
    description: task.description,
    type: "prazo",
    status: status === "concluida" ? "concluido" : status === "arquivada" ? "arquivado" : status === "em_andamento" || status === "em_revisao" ? "em_andamento" : "agendado",
    priority: task.priority,
    responsible: task.responsible,
    starts_at: `${toDateOnly(task.due_at)}T18:00:00.000Z`,
    reminder_at: task.reminder_at,
    next_action: task.next_action,
    notes: task.notes,
    created_at: task.created_at,
    updated_at: task.updated_at,
    completed_at: task.completed_at,
    archived_at: task.archived_at,
    source: "task",
    source_label: "Tarefa",
    source_route: `/tarefas?taskId=${task.id}`,
    editable: false,
  };
}

function deriveTaskEvents(workspaceId = FALLBACK_WORKSPACE_ID): AgendaEvent[] {
  return listTasks(workspaceId, { status: "todas", includeArchived: false }).filter((task) => task.due_at).map(deriveTaskEvent);
}

function deriveProcessEvent(process: Awaited<ReturnType<typeof listProcessesAsync>>[number] | ReturnType<typeof listProcesses>[number]): AgendaEvent {
  return {
    id: `process-agenda-${process.id}`,
    workspace_id: process.workspace_id,
    client_id: process.client_id,
    client_name: process.client_name,
    process_id: process.id,
    process_number: process.number,
    process_title: process.title,
    title: `Prazo processual • ${process.title}`,
    description: process.main_issue,
    type: "prazo",
    status: "agendado",
    priority: process.priority,
    risk: process.risk as ProcessRisk,
    responsible: process.responsible,
    starts_at: `${toDateOnly(process.next_deadline_at || "")}T18:00:00.000Z`,
    next_action: process.next_action,
    notes: process.notes,
    created_at: process.created_at,
    updated_at: process.updated_at,
    source: "process",
    source_label: "Prazo processual",
    source_route: `/processos/${process.id}`,
    editable: false,
  };
}

function deriveProcessEvents(workspaceId = FALLBACK_WORKSPACE_ID): AgendaEvent[] {
  return listProcesses(workspaceId, { includeArchived: false }).filter((process) => process.next_deadline_at).map(deriveProcessEvent);
}

export function listAgendaEvents(workspaceId = FALLBACK_WORKSPACE_ID, filters: AgendaFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  const source = [...listOwnAgendaEvents(workspaceId), ...(filters.includeDerived === false ? [] : [...deriveTaskEvents(workspaceId), ...deriveProcessEvents(workspaceId)])];
  return filterAgendaRows(source, filters);
}

function filterPeriod(event: AgendaEvent, start?: string, end?: string) {
  if (!start && !end) return true;
  const starts = new Date(event.starts_at).getTime();
  const startTime = start ? new Date(start).getTime() : Number.NEGATIVE_INFINITY;
  const endTime = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
  return starts >= startTime && starts <= endTime;
}

export function eventMatchesView(event: AgendaEvent, view: AgendaView) {
  const start = new Date(event.starts_at);
  const today = startOfToday();
  const weekEnd = endOfDay(new Date(today));
  weekEnd.setDate(today.getDate() + 7);
  if (view === "operacional") return isOperational(event);
  if (view === "hoje") return isOperational(event) && start >= today && start <= endOfDay(today);
  if (view === "semana") return isOperational(event) && start >= today && start <= weekEnd;
  if (view === "prazos") return isOperational(event) && event.type === "prazo";
  if (view === "audiencias") return isOperational(event) && event.type === "audiencia";
  if (view === "reunioes") return isOperational(event) && event.type === "reuniao";
  if (view === "followups") return isOperational(event) && event.type === "follow_up";
  if (view === "concluidos") return event.status === "concluido";
  if (view === "arquivados") return ["arquivado", "cancelado"].includes(event.status) || Boolean(event.archived_at || event.canceled_at);
  return true;
}

export function getAgendaEventById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listAgendaEvents(workspaceId, { includeDerived: true }).find((event) => event.id === id || event.task_id === id || event.process_id === id) ?? null;
}

export function createAgendaEvent(input: AgendaInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Compromissos reais devem ser criados via Supabase.");
  const timestamp = nowIso();
  const event: AgendaEvent = { ...input, id: makeId(), workspace_id: workspaceId, created_at: timestamp, updated_at: timestamp, source: "agenda", source_label: "Evento", editable: true };
  persistEvents([event, ...getOwnAgendaSource(workspaceId)], workspaceId);
  return event;
}

export function updateAgendaEvent(id: string, input: Partial<AgendaInput>, workspaceId = FALLBACK_WORKSPACE_ID): AgendaEvent | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: AgendaEvent | null = null;
  const timestamp = nowIso();
  const events = getOwnAgendaSource(workspaceId).map((event) => {
    if (event.id !== id) return event;
    updated = { ...event, ...input, updated_at: timestamp, source: "agenda", source_label: "Evento", editable: true };
    return updated;
  });
  persistEvents(events, workspaceId);
  return updated;
}

export function completeAgendaEvent(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEvent(id, { status: "concluido", completed_at: nowIso(), canceled_at: undefined, archived_at: undefined }, workspaceId); }
export function rescheduleAgendaEvent(id: string, dates: Pick<Partial<AgendaInput>, "starts_at" | "ends_at" | "reminder_at">, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEvent(id, { ...dates, status: "remarcado" }, workspaceId); }
export function cancelAgendaEvent(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEvent(id, { status: "cancelado", canceled_at: nowIso(), archived_at: undefined }, workspaceId); }
export function archiveAgendaEvent(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEvent(id, { status: "arquivado", archived_at: nowIso() }, workspaceId); }
export function listAgendaEventsByClientId(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEvents(workspaceId).filter((event) => event.client_id === clientId); }
export function listAgendaEventsByProcessId(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEvents(workspaceId).filter((event) => event.process_id === processId); }
export function listAgendaEventsByTaskId(taskId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEvents(workspaceId).filter((event) => event.task_id === taskId); }
export function getAgendaProviderStatus(provider: AgendaProvider = "local_demo") { return provider === "local_demo" ? AGENDA_DATA_MODE_LABEL : "Conector reservado para evolução futura. Nenhuma integração externa foi executada."; }
export function getLocalAgendaSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEvents(workspaceId, { includeDerived: true }).map((event) => ({ type: "Agenda", title: event.title, description: `${event.source_label ?? "Evento"} • ${event.client_name ?? "Interno"} • ${event.responsible} • ${event.next_action}`, route: `/agenda?eventId=${event.id}`, action: "Abrir agenda" })); }

type AgendaMetadata = {
  ui_type?: AgendaEventType | null;
  ui_status?: AgendaEventStatus | null;
  ui_priority?: AgendaPriority | null;
  ui_risk?: AgendaRisk | null;
  client_name?: string | null;
  process_number?: string | null;
  process_title?: string | null;
  task_title?: string | null;
};

type SupabaseAgendaRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  process_id: string | null;
  task_id: string | null;
  title: string | null;
  description: string | null;
  event_type: string | null;
  status: string | null;
  priority: string | null;
  risk_level: string | null;
  responsible: string | null;
  starts_at: string;
  ends_at: string | null;
  reminder_at: string | null;
  location: string | null;
  next_action: string | null;
  notes: string | null;
  metadata: AgendaMetadata | null;
  completed_at: string | null;
  canceled_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  clients?: { name?: string | null } | Array<{ name?: string | null }> | null;
  processes?: { title?: string | null; process_number?: string | null } | Array<{ title?: string | null; process_number?: string | null }> | null;
  tasks?: { title?: string | null } | Array<{ title?: string | null }> | null;
};

const agendaTypeSet = new Set<AgendaEventType>(["prazo", "audiencia", "reuniao", "atendimento", "follow_up", "interno", "financeiro", "outro"]);
const agendaStatusSet = new Set<AgendaEventStatus>(["agendado", "em_andamento", "concluido", "remarcado", "cancelado", "arquivado"]);
const agendaPrioritySet = new Set<AgendaPriority>(["baixa", "média", "alta", "urgente", "máxima"]);
const agendaRiskSet = new Set<AgendaRisk>(["baixo", "médio", "alto", "crítico"]);

const typeToSupabase: Record<AgendaEventType, string> = { prazo: "deadline", audiencia: "hearing", reuniao: "meeting", atendimento: "service", follow_up: "follow_up", interno: "internal", financeiro: "financial", outro: "other" };
const statusToSupabase: Record<AgendaEventStatus, string> = { agendado: "scheduled", em_andamento: "in_progress", concluido: "completed", remarcado: "rescheduled", cancelado: "canceled", arquivado: "archived" };
const priorityToSupabase: Record<AgendaPriority, string> = { baixa: "low", média: "medium", alta: "high", urgente: "urgent", máxima: "maximum" };
const riskToSupabase: Record<AgendaRisk, string> = { baixo: "low", médio: "medium", alto: "high", crítico: "critical" };

function firstAgendaRelation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function normalizeAgendaType(value: string | null | undefined, metadata?: AgendaMetadata | null): AgendaEventType { if (metadata?.ui_type && agendaTypeSet.has(metadata.ui_type)) return metadata.ui_type; if (value === "deadline") return "prazo"; if (value === "hearing") return "audiencia"; if (value === "meeting") return "reuniao"; if (value === "follow_up") return "follow_up"; if (value === "internal") return "interno"; if (value === "financial") return "financeiro"; if (value === "service") return "atendimento"; return agendaTypeSet.has((value || "") as AgendaEventType) ? (value as AgendaEventType) : "outro"; }
function normalizeAgendaStatus(value: string | null | undefined, metadata?: AgendaMetadata | null): AgendaEventStatus { if (metadata?.ui_status && agendaStatusSet.has(metadata.ui_status)) return metadata.ui_status; if (value === "scheduled") return "agendado"; if (value === "in_progress") return "em_andamento"; if (value === "completed") return "concluido"; if (value === "rescheduled") return "remarcado"; if (value === "canceled") return "cancelado"; if (value === "archived") return "arquivado"; return agendaStatusSet.has((value || "") as AgendaEventStatus) ? (value as AgendaEventStatus) : "agendado"; }
function normalizeAgendaPriority(value: string | null | undefined, metadata?: AgendaMetadata | null): AgendaPriority { if (metadata?.ui_priority && agendaPrioritySet.has(metadata.ui_priority)) return metadata.ui_priority; if (value === "low") return "baixa"; if (value === "medium") return "média"; if (value === "high") return "alta"; if (value === "urgent") return "urgente"; if (value === "maximum") return "máxima"; return agendaPrioritySet.has((value || "") as AgendaPriority) ? (value as AgendaPriority) : "média"; }
function normalizeAgendaRisk(value: string | null | undefined, metadata?: AgendaMetadata | null): AgendaRisk | undefined { if (metadata?.ui_risk && agendaRiskSet.has(metadata.ui_risk)) return metadata.ui_risk; if (value === "low") return "baixo"; if (value === "medium") return "médio"; if (value === "high") return "alto"; if (value === "critical") return "crítico"; return agendaRiskSet.has((value || "") as AgendaRisk) ? (value as AgendaRisk) : undefined; }

function fromSupabaseAgenda(row: SupabaseAgendaRow): AgendaEvent {
  const timestamp = row.updated_at || row.created_at || nowIso();
  const metadata = row.metadata || {};
  const process = firstAgendaRelation(row.processes);
  const task = firstAgendaRelation(row.tasks);
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || undefined,
    client_name: firstAgendaRelation(row.clients)?.name || metadata.client_name || undefined,
    process_id: row.process_id || undefined,
    process_number: process?.process_number || metadata.process_number || undefined,
    process_title: process?.title || metadata.process_title || undefined,
    task_id: row.task_id || undefined,
    task_title: task?.title || metadata.task_title || undefined,
    title: row.title || "Evento sem título",
    description: row.description || "",
    type: normalizeAgendaType(row.event_type, metadata),
    status: normalizeAgendaStatus(row.status, metadata),
    priority: normalizeAgendaPriority(row.priority, metadata),
    risk: normalizeAgendaRisk(row.risk_level, metadata),
    responsible: row.responsible || "",
    starts_at: row.starts_at,
    ends_at: row.ends_at || undefined,
    reminder_at: row.reminder_at || undefined,
    location: row.location || undefined,
    next_action: row.next_action || "",
    notes: row.notes || "",
    completed_at: row.completed_at || undefined,
    canceled_at: row.canceled_at || undefined,
    archived_at: row.archived_at || undefined,
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
    source: "agenda",
    source_label: "Evento",
    editable: true,
  };
}

function toSupabaseAgenda(input: AgendaInput, workspaceId: string) {
  const status = input.archived_at ? "arquivado" : input.canceled_at ? "cancelado" : input.completed_at ? "concluido" : input.status;
  return {
    workspace_id: workspaceId,
    client_id: input.client_id || null,
    process_id: input.process_id || null,
    task_id: input.task_id || null,
    title: input.title,
    description: input.description || null,
    event_type: typeToSupabase[input.type] || "other",
    status: statusToSupabase[status] || "scheduled",
    priority: priorityToSupabase[input.priority] || "medium",
    risk_level: input.risk ? riskToSupabase[input.risk] : null,
    responsible: input.responsible || null,
    starts_at: input.starts_at,
    ends_at: input.ends_at || null,
    reminder_at: input.reminder_at || null,
    location: input.location || null,
    next_action: input.next_action || null,
    notes: input.notes || null,
    completed_at: status === "concluido" ? input.completed_at || nowIso() : null,
    canceled_at: status === "cancelado" ? input.canceled_at || nowIso() : null,
    archived_at: status === "arquivado" ? input.archived_at || nowIso() : null,
    metadata: {
      ui_type: input.type,
      ui_status: status,
      ui_priority: input.priority,
      ui_risk: input.risk || null,
      client_name: input.client_name || null,
      process_number: input.process_number || null,
      process_title: input.process_title || null,
      task_title: input.task_title || null,
    },
  };
}

function filterAgendaRows(source: AgendaEvent[], filters: AgendaFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return source
    .filter((event) => (filters.view ? eventMatchesView(event, filters.view) : true))
    .filter((event) => (filters.type && filters.type !== "todos" ? event.type === filters.type : true))
    .filter((event) => (filters.status && filters.status !== "todos" ? event.status === filters.status : true))
    .filter((event) => (filters.priority && filters.priority !== "todas" ? event.priority === filters.priority : true))
    .filter((event) => (filters.responsible && filters.responsible !== "todos" ? event.responsible === filters.responsible : true))
    .filter((event) => (filters.clientId ? event.client_id === filters.clientId : true))
    .filter((event) => (filters.processId ? event.process_id === filters.processId : true))
    .filter((event) => (filters.taskId ? event.task_id === filters.taskId : true))
    .filter((event) => filterPeriod(event, filters.periodStart, filters.periodEnd))
    .filter((event) => !query || [event.title, event.client_name, event.process_number, event.process_title, event.task_title, event.responsible, event.type, event.description, event.next_action, event.notes].join(" ").toLowerCase().includes(query))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
}

async function deriveTaskEventsAsync(workspaceId = FALLBACK_WORKSPACE_ID): Promise<AgendaEvent[]> {
  const tasks = await listTasksAsync(workspaceId, { status: "todas", includeArchived: false });
  return tasks.filter((task) => task.due_at).map(deriveTaskEvent);
}

async function deriveProcessEventsAsync(workspaceId = FALLBACK_WORKSPACE_ID): Promise<AgendaEvent[]> {
  const processes = await listProcessesAsync(workspaceId, { includeArchived: false });
  return processes.filter((process) => process.next_deadline_at).map(deriveProcessEvent);
}

const AGENDA_SELECT = "id, workspace_id, client_id, process_id, task_id, title, description, event_type, status, priority, risk_level, responsible, starts_at, ends_at, reminder_at, location, next_action, notes, metadata, completed_at, canceled_at, archived_at, created_at, updated_at, clients(name), processes(title, process_number), tasks(title)";

async function recordAgendaActivity(workspaceId: string, action: string, entityId: string, description: string) {
  await logAgendaActivity({
    workspaceId,
    action,
    entityId,
    description,
  });
}

export async function listAgendaEventsAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: AgendaFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listAgendaEvents(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await (supabase as any).from("agenda_events").select(AGENDA_SELECT).eq("workspace_id", workspaceId).order("starts_at", { ascending: true });
    if (error) throw error;
    const ownEvents = ((data || []) as SupabaseAgendaRow[]).map(fromSupabaseAgenda);
    return filterAgendaRows(ownEvents, filters);
  } catch (error) {
    warnSupabaseOperationalError("Agenda", error);
    return [];
  }
}

export async function getAgendaEventByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getAgendaEventById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  if (id.startsWith("task-agenda-") || id.startsWith("process-agenda-")) return (await listAgendaEventsAsync(workspaceId)).find((event) => event.id === id) ?? null;
  try {
    const { data, error } = await (supabase as any).from("agenda_events").select(AGENDA_SELECT).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseAgenda(data as SupabaseAgendaRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Agenda", error);
    return null;
  }
}

export async function createAgendaEventAsync(input: AgendaInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createAgendaEvent(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar evento real de agenda.");
  try {
    const { data, error } = await (supabase as any).from("agenda_events").insert(toSupabaseAgenda(input, workspaceId)).select(AGENDA_SELECT).single();
    if (error) throw error;
    const event = fromSupabaseAgenda(data as SupabaseAgendaRow);
    await recordAgendaActivity(workspaceId, "agenda_event_created", event.id, `Evento de agenda ${event.title} criado.`);
    return event;
  } catch (error) {
    warnSupabaseOperationalError("Agenda", error);
    throw error;
  }
}

export async function updateAgendaEventAsync(id: string, input: Partial<AgendaInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return updateAgendaEvent(id, input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar evento real de agenda.");
  try {
    const current = await getAgendaEventByIdAsync(id, workspaceId);
    if (!current || !current.editable) return null;
    const merged: AgendaInput = {
      client_id: current.client_id || "",
      client_name: current.client_name || "",
      process_id: current.process_id || "",
      process_number: current.process_number || "",
      process_title: current.process_title || "",
      task_id: current.task_id || "",
      task_title: current.task_title || "",
      title: current.title,
      description: current.description,
      type: current.type,
      status: current.status,
      priority: current.priority,
      risk: current.risk,
      responsible: current.responsible,
      starts_at: current.starts_at,
      ends_at: current.ends_at || "",
      reminder_at: current.reminder_at || "",
      location: current.location || "",
      next_action: current.next_action,
      notes: current.notes,
      completed_at: current.completed_at,
      canceled_at: current.canceled_at,
      archived_at: current.archived_at,
      ...input,
    };
    const { data, error } = await (supabase as any).from("agenda_events").update(toSupabaseAgenda(merged, workspaceId)).eq("workspace_id", workspaceId).eq("id", id).select(AGENDA_SELECT).single();
    if (error) throw error;
    const event = fromSupabaseAgenda(data as SupabaseAgendaRow);
    const action = event.completed_at && !current.completed_at ? "agenda_event_completed" : event.canceled_at && !current.canceled_at ? "agenda_event_canceled" : event.archived_at && !current.archived_at ? "agenda_event_archived" : event.status === "remarcado" ? "agenda_event_rescheduled" : "agenda_event_updated";
    await recordAgendaActivity(workspaceId, action, event.id, `Evento de agenda ${event.title} atualizado.`);
    return event;
  } catch (error) {
    warnSupabaseOperationalError("Agenda", error);
    throw error;
  }
}

export async function completeAgendaEventAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEventAsync(id, { status: "concluido", completed_at: nowIso(), canceled_at: undefined, archived_at: undefined }, workspaceId); }
export async function rescheduleAgendaEventAsync(id: string, dates: Pick<Partial<AgendaInput>, "starts_at" | "ends_at" | "reminder_at">, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEventAsync(id, { ...dates, status: "remarcado" }, workspaceId); }
export async function cancelAgendaEventAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEventAsync(id, { status: "cancelado", canceled_at: nowIso(), archived_at: undefined }, workspaceId); }
export async function archiveAgendaEventAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) { return updateAgendaEventAsync(id, { status: "arquivado", archived_at: nowIso() }, workspaceId); }
export async function listAgendaEventsByClientIdAsync(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEventsAsync(workspaceId, { clientId }); }
export async function listAgendaEventsByProcessIdAsync(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEventsAsync(workspaceId, { processId }); }
export async function listAgendaEventsByTaskIdAsync(taskId: string, workspaceId = FALLBACK_WORKSPACE_ID) { return listAgendaEventsAsync(workspaceId, { taskId }); }
