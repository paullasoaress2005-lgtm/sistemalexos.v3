import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { getDataSource, shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logTaskActivity } from "@/lib/data/activityLogs";
import { FALLBACK_WORKSPACE_ID, getInitialClients } from "./clients";
import { getInitialProcesses } from "./processes";

export type TaskType = "prazo" | "peça" | "audiência" | "atendimento" | "financeiro" | "interno" | "revisão" | "outro";
export type TaskStatus = "a_fazer" | "em_andamento" | "aguardando" | "em_revisao" | "concluida" | "atrasada" | "arquivada";
export type TaskPriority = "baixa" | "média" | "alta" | "urgente" | "máxima";
export type TaskDataMode = "demo_local" | "supabase_ready";

export type Task = {
  id: string;
  workspace_id: string;
  client_id?: string;
  client_name?: string;
  process_id?: string;
  process_number?: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  responsible: string;
  due_at: string;
  reminder_at?: string;
  completed_at?: string;
  archived_at?: string;
  next_action: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type TaskInput = Omit<Task, "id" | "workspace_id" | "created_at" | "updated_at" | "completed_at" | "archived_at"> & {
  completed_at?: string;
  archived_at?: string;
};

export type TaskFilters = {
  status?: TaskStatus | "operacionais" | "todas";
  priority?: TaskPriority | "todas";
  responsible?: string | "todos";
  type?: TaskType | "todos";
  query?: string;
  includeArchived?: boolean;
  includeCompleted?: boolean;
};

const DEMO_TASKS_STORAGE_PREFIX = "lexos.control.demo.tasks";
export const TASK_DATA_MODE: TaskDataMode = shouldUseWorkspaceSupabase() ? "supabase_ready" : "demo_local";
export const TASK_DATA_MODE_LABEL =
  "Modo demonstração: tarefas salvas localmente no navegador, sem sincronização real.";
export const TASKS_UPDATED_EVENT = "lexos:tasks-updated";

const initialTasks: Task[] = buildInitialTasks();

function buildInitialTasks(): Task[] {
  const clients = getInitialClients(FALLBACK_WORKSPACE_ID);
  const processes = getInitialProcesses(FALLBACK_WORKSPACE_ID);
  const findClient = (name: string) => clients.find((client) => client.name === name) ?? clients[0];
  const findProcess = (clientName: string) => processes.find((process) => process.client_name === clientName);
  const seed: Array<Omit<Task, "id" | "workspace_id" | "created_at" | "updated_at" | "client_id" | "process_id" | "process_number"> & { client_name?: string }> = [
    {
      client_name: "Grupo Ápice",
      title: "Revisar rol de testemunhas",
      description: "Conferir anexos enviados pelo cliente e separar lacunas para a próxima rodada de cobrança consultiva.",
      type: "prazo",
      status: "a_fazer",
      priority: "alta",
      responsible: "Dra. Helena",
      due_at: "2026-05-13",
      reminder_at: "2026-05-13T10:00",
      next_action: "Conferir nomes, qualificação e lacunas antes da audiência.",
      notes: "Checklist demonstrativo importado do kanban premium.",
    },
    {
      client_name: "Marina Salles",
      title: "Protocolar réplica trabalhista",
      description: "Organizar tese, validar provas e encaminhar versão para revisão da coordenação.",
      type: "peça",
      status: "em_andamento",
      priority: "urgente",
      responsible: "Dr. Rafael",
      due_at: "2026-05-14",
      reminder_at: "2026-05-14T09:30",
      next_action: "Concluir revisão final e protocolar dentro do prazo.",
      notes: "Peça demonstrativa sem protocolo real ou integração judicial.",
    },
    {
      client_name: "Villa Norte SPE",
      title: "Cobrar contrato social atualizado",
      description: "Solicitar documento societário em versão editável para desbloquear due diligence.",
      type: "atendimento",
      status: "atrasada",
      priority: "urgente",
      responsible: "Dra. Camila",
      due_at: "2026-05-10",
      reminder_at: "2026-05-10T11:00",
      next_action: "Enviar lembrete humanizado ao cliente com prazo de retorno.",
      notes: "Tarefa atrasada demonstrativa para validar regra operacional.",
    },
    {
      title: "Registrar andamento interno",
      description: "Consolidar gargalos da equipe, tarefas críticas e próximos prazos para reunião interna.",
      type: "interno",
      status: "em_revisao",
      priority: "média",
      responsible: "Coordenação",
      due_at: "2026-05-16",
      reminder_at: "2026-05-15T16:00",
      next_action: "Validar leitura com sócia responsável.",
      notes: "Tarefa interna sem vínculo obrigatório com cliente ou processo.",
    },
    {
      client_name: "Clínica Aurum",
      title: "Validar minuta de acordo",
      description: "Compartilhar resumo executivo e pendências pactuadas com o cliente.",
      type: "revisão",
      status: "concluida",
      priority: "baixa",
      responsible: "Lívia Ramos",
      due_at: "2026-05-12",
      completed_at: "2026-05-12T18:20:00.000Z",
      next_action: "Aguardar validação do cliente.",
      notes: "Registro concluído demonstrativo para filtro específico.",
    },
  ];

  return seed.map((item, index) => {
    const client = item.client_name ? findClient(item.client_name) : undefined;
    const process = item.client_name ? findProcess(item.client_name) : undefined;
    return {
      ...item,
      id: `task-demo-${index + 1}`,
      workspace_id: FALLBACK_WORKSPACE_ID,
      client_id: client?.id,
      client_name: client?.name ?? item.client_name,
      process_id: process?.id,
      process_number: process?.number,
      created_at: `2026-05-${String(5 + index).padStart(2, "0")}T08:30:00.000Z`,
      updated_at: `2026-05-${String(9 + index).padStart(2, "0")}T14:00:00.000Z`,
    };
  });
}

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${DEMO_TASKS_STORAGE_PREFIX}.${workspaceId}`;
}

function safeParseTasks(raw: string | null): Task[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isTask);
  } catch {
    return null;
  }
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return Boolean(task.id && task.workspace_id && task.title && task.status && task.priority && task.type);
}

function persistTasks(tasks: Task[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent(TASKS_UPDATED_EVENT, { detail: { workspaceId } }));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getInitialTasks(workspaceId = FALLBACK_WORKSPACE_ID): Task[] {
  return initialTasks.map((task) => ({ ...task, workspace_id: workspaceId }));
}

export function resolveEffectiveTaskStatus(task: Task, today = new Date()): TaskStatus {
  if (["concluida", "arquivada"].includes(task.status)) return task.status;
  if (!task.due_at) return task.status;
  const due = new Date(`${task.due_at}T23:59:59`);
  return due.getTime() < today.getTime() ? "atrasada" : task.status;
}

function getTaskSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParseTasks(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getInitialTasks(workspaceId);
}

export function listTasks(workspaceId = FALLBACK_WORKSPACE_ID, filters: TaskFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  const source = getTaskSource(workspaceId);
  const query = filters.query?.trim().toLowerCase();

  return source
    .filter((task) => {
      const effectiveStatus = resolveEffectiveTaskStatus(task);
      if (filters.status && filters.status !== "operacionais" && filters.status !== "todas") {
        return effectiveStatus === filters.status;
      }
      if (filters.status === "todas") return filters.includeArchived ? true : effectiveStatus !== "arquivada";
      return ["a_fazer", "em_andamento", "aguardando", "em_revisao", "atrasada"].includes(effectiveStatus);
    })
    .filter((task) => (filters.priority && filters.priority !== "todas" ? task.priority === filters.priority : true))
    .filter((task) => (filters.responsible && filters.responsible !== "todos" ? task.responsible === filters.responsible : true))
    .filter((task) => (filters.type && filters.type !== "todos" ? task.type === filters.type : true))
    .filter((task) => {
      if (!query) return true;
      return [task.title, task.client_name, task.process_number, task.responsible, task.type, task.description, task.next_action, task.notes]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const statusA = resolveEffectiveTaskStatus(a) === "atrasada" ? 0 : 1;
      const statusB = resolveEffectiveTaskStatus(b) === "atrasada" ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      return a.due_at.localeCompare(b.due_at) || b.updated_at.localeCompare(a.updated_at);
    });
}

export function getTaskById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listTasks(workspaceId, { status: "todas", includeArchived: true }).find((task) => task.id === id) ?? null;
}

export function createTask(input: TaskInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Tarefas reais ainda não possuem tabela ativa neste estágio.");
  const timestamp = nowIso();
  const task: Task = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: input.status === "concluida" ? input.completed_at ?? timestamp : input.completed_at,
    archived_at: input.status === "arquivada" ? input.archived_at ?? timestamp : input.archived_at,
  };
  persistTasks([task, ...listTasks(workspaceId, { status: "todas", includeArchived: true })], workspaceId);
  return task;
}

export function updateTask(id: string, input: Partial<TaskInput>, workspaceId = FALLBACK_WORKSPACE_ID): Task | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: Task | null = null;
  const timestamp = nowIso();
  const nextTasks = listTasks(workspaceId, { status: "todas", includeArchived: true }).map((task) => {
    if (task.id !== id) return task;
    const nextStatus = input.status ?? task.status;
    updated = {
      ...task,
      ...input,
      updated_at: timestamp,
      completed_at: nextStatus === "concluida" ? input.completed_at ?? task.completed_at ?? timestamp : input.completed_at,
      archived_at: nextStatus === "arquivada" ? input.archived_at ?? task.archived_at ?? timestamp : undefined,
    };
    return updated;
  });
  persistTasks(nextTasks, workspaceId);
  return updated;
}

export function completeTask(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Task | null {
  return updateTask(id, { status: "concluida", completed_at: nowIso(), archived_at: undefined }, workspaceId);
}

export function reopenTask(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Task | null {
  return updateTask(id, { status: "a_fazer", completed_at: undefined, archived_at: undefined }, workspaceId);
}

export function archiveTask(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Task | null {
  return updateTask(id, { status: "arquivada", archived_at: nowIso() }, workspaceId);
}

export function listTasksByClientId(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listTasks(workspaceId, { status: "todas", includeArchived: false }).filter((task) => task.client_id === clientId);
}

export function listTasksByProcessId(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listTasks(workspaceId, { status: "todas", includeArchived: false }).filter((task) => task.process_id === processId);
}

export function getTaskStats(workspaceId = FALLBACK_WORKSPACE_ID) {
  const tasks = listTasks(workspaceId, { status: "todas", includeArchived: true });
  const operational = tasks.filter((task) => !["concluida", "arquivada"].includes(resolveEffectiveTaskStatus(task)));
  const urgent = operational.filter((task) => task.priority === "urgente").length;
  const overdue = operational.filter((task) => resolveEffectiveTaskStatus(task) === "atrasada").length;
  const review = operational.filter((task) => task.status === "em_revisao").length;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const completedWeek = tasks.filter((task) => task.completed_at && new Date(task.completed_at) >= weekStart).length;

  return [
    { label: "Pendentes", value: String(operational.length), detail: "tarefas operacionais", tone: "warning" },
    { label: "Urgentes", value: String(urgent), detail: "prioridade máxima", tone: "urgent" },
    { label: "Atrasadas", value: String(overdue), detail: "prazo vencido", tone: "urgent" },
    { label: "Em revisão", value: String(review), detail: "aguardam validação", tone: "premium" },
    { label: "Concluídas", value: String(completedWeek), detail: "últimos 7 dias", tone: "positive" },
  ];
}

export function getLocalTaskSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listTasks(workspaceId, { status: "todas" }).map((task) => ({
    type: "Tarefas",
    title: task.title,
    description: `${task.client_name ?? "Tarefa interna"} • ${task.responsible} • ${task.priority} • ${task.next_action}`,
    route: `/tarefas?taskId=${task.id}`,
    action: "Abrir tarefa",
  }));
}

export const TASK_REAL_DATA_MODE_LABEL =
  getDataSource() === "supabase"
    ? "Ambiente conectado: tarefas e vínculos carregados exclusivamente do escritório."
    : TASK_DATA_MODE_LABEL;


type TaskMetadata = {
  reminder_at?: string | null;
  client_name?: string | null;
  process_number?: string | null;
  process_title?: string | null;
  ui_status?: TaskStatus | null;
  ui_priority?: TaskPriority | null;
};

type SupabaseTaskRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  process_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  task_type: string | null;
  responsible: string | null;
  due_date: string | null;
  due_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  next_action: string | null;
  notes: string | null;
  metadata: TaskMetadata | null;
  created_at: string | null;
  updated_at: string | null;
  clients?: { name?: string | null } | Array<{ name?: string | null }> | null;
  processes?: { title?: string | null; process_number?: string | null } | Array<{ title?: string | null; process_number?: string | null }> | null;
};

const taskTypeSet = new Set<TaskType>(["prazo", "peça", "audiência", "atendimento", "financeiro", "interno", "revisão", "outro"]);
const taskStatusSet = new Set<TaskStatus>(["a_fazer", "em_andamento", "aguardando", "em_revisao", "concluida", "atrasada", "arquivada"]);
const taskPrioritySet = new Set<TaskPriority>(["baixa", "média", "alta", "urgente", "máxima"]);

const statusToSupabase: Record<TaskStatus, string> = {
  a_fazer: "pending",
  em_andamento: "in_progress",
  aguardando: "waiting_validation",
  em_revisao: "waiting_validation",
  concluida: "completed",
  atrasada: "overdue",
  arquivada: "archived",
};

const priorityToSupabase: Record<TaskPriority, string> = {
  baixa: "low",
  média: "medium",
  alta: "high",
  urgente: "urgent",
  máxima: "maximum",
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeTaskType(value: string | null | undefined): TaskType {
  return taskTypeSet.has((value || "") as TaskType) ? (value as TaskType) : "outro";
}

function normalizeTaskStatus(value: string | null | undefined, metadata?: TaskMetadata | null): TaskStatus {
  if (metadata?.ui_status && taskStatusSet.has(metadata.ui_status)) return metadata.ui_status;
  if (value === "pending") return "a_fazer";
  if (value === "in_progress") return "em_andamento";
  if (value === "waiting_validation") return "aguardando";
  if (value === "completed") return "concluida";
  if (value === "archived") return "arquivada";
  if (value === "canceled") return "arquivada";
  if (value === "overdue") return "atrasada";
  return taskStatusSet.has((value || "") as TaskStatus) ? (value as TaskStatus) : "a_fazer";
}

function normalizeTaskPriority(value: string | null | undefined, metadata?: TaskMetadata | null): TaskPriority {
  if (metadata?.ui_priority && taskPrioritySet.has(metadata.ui_priority)) return metadata.ui_priority;
  if (value === "low") return "baixa";
  if (value === "medium") return "média";
  if (value === "high") return "alta";
  if (value === "urgent") return "urgente";
  if (value === "maximum") return "máxima";
  return taskPrioritySet.has((value || "") as TaskPriority) ? (value as TaskPriority) : "média";
}

function fromSupabaseTask(row: SupabaseTaskRow): Task {
  const timestamp = row.updated_at || row.created_at || nowIso();
  const metadata = row.metadata || {};
  const process = firstRelation(row.processes);
  const processLabel = process?.process_number || process?.title || metadata.process_number || metadata.process_title || undefined;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || undefined,
    client_name: firstRelation(row.clients)?.name || metadata.client_name || undefined,
    process_id: row.process_id || undefined,
    process_number: processLabel,
    title: row.title || "Tarefa sem título",
    description: row.description || "",
    type: normalizeTaskType(row.task_type),
    status: normalizeTaskStatus(row.status, metadata),
    priority: normalizeTaskPriority(row.priority, metadata),
    responsible: row.responsible || "",
    due_at: row.due_date || (row.due_at ? row.due_at.slice(0, 10) : ""),
    reminder_at: metadata.reminder_at || undefined,
    completed_at: row.completed_at || undefined,
    archived_at: row.archived_at || undefined,
    next_action: row.next_action || "",
    notes: row.notes || "",
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
  };
}

function toSupabaseTask(input: TaskInput, workspaceId: string) {
  const status = input.archived_at ? "arquivada" : input.completed_at ? "concluida" : input.status;
  const completedAt = status === "concluida" ? input.completed_at || nowIso() : null;
  const archivedAt = status === "arquivada" ? input.archived_at || nowIso() : null;
  return {
    workspace_id: workspaceId,
    client_id: input.client_id || null,
    process_id: input.process_id || null,
    title: input.title,
    description: input.description || null,
    status: statusToSupabase[status] || "pending",
    priority: priorityToSupabase[input.priority] || "medium",
    task_type: input.type || null,
    responsible: input.responsible || null,
    due_date: input.due_at || null,
    due_at: input.due_at ? `${input.due_at}T12:00:00.000Z` : null,
    completed_at: completedAt,
    archived_at: archivedAt,
    next_action: input.next_action || null,
    notes: input.notes || null,
    metadata: {
      reminder_at: input.reminder_at || null,
      client_name: input.client_name || null,
      process_number: input.process_number || null,
      ui_status: status,
      ui_priority: input.priority,
    },
  };
}

function filterTaskRows(rows: Task[], filters: TaskFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return rows
    .filter((task) => {
      const effectiveStatus = resolveEffectiveTaskStatus(task);
      if (filters.status && filters.status !== "operacionais" && filters.status !== "todas") return effectiveStatus === filters.status;
      if (filters.status === "todas") return filters.includeArchived ? true : effectiveStatus !== "arquivada";
      return ["a_fazer", "em_andamento", "aguardando", "em_revisao", "atrasada"].includes(effectiveStatus);
    })
    .filter((task) => (filters.priority && filters.priority !== "todas" ? task.priority === filters.priority : true))
    .filter((task) => (filters.responsible && filters.responsible !== "todos" ? task.responsible === filters.responsible : true))
    .filter((task) => (filters.type && filters.type !== "todos" ? task.type === filters.type : true))
    .filter((task) => {
      if (!query) return true;
      return [task.title, task.client_name, task.process_number, task.responsible, task.type, task.description, task.next_action, task.notes].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const statusA = resolveEffectiveTaskStatus(a) === "atrasada" ? 0 : 1;
      const statusB = resolveEffectiveTaskStatus(b) === "atrasada" ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      return a.due_at.localeCompare(b.due_at) || b.updated_at.localeCompare(a.updated_at);
    });
}

const TASK_SELECT = "id, workspace_id, client_id, process_id, title, description, status, priority, task_type, responsible, due_date, due_at, completed_at, archived_at, next_action, notes, metadata, created_at, updated_at, clients(name), processes(title, process_number)";

async function recordTaskActivity(workspaceId: string, action: string, entityId: string, description: string) {
  await logTaskActivity({
    workspaceId,
    action,
    entityId,
    description,
  });
}

export async function listTasksAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: TaskFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listTasks(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("tasks")
      .select(TASK_SELECT)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return filterTaskRows(((data || []) as SupabaseTaskRow[]).map(fromSupabaseTask), filters);
  } catch (error) {
    warnSupabaseOperationalError("Tarefas", error);
    return [];
  }
}

export async function getTaskByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getTaskById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("tasks")
      .select(TASK_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseTask(data as SupabaseTaskRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Tarefas", error);
    return null;
  }
}

export async function createTaskAsync(input: TaskInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createTask(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar tarefa real.");

  try {
    const { data, error } = await (supabase as any)
      .from("tasks")
      .insert(toSupabaseTask(input, workspaceId))
      .select(TASK_SELECT)
      .single();
    if (error) throw error;
    const task = fromSupabaseTask(data as SupabaseTaskRow);
    await recordTaskActivity(workspaceId, "task_created", task.id, `Tarefa ${task.title} criada.`);
    return task;
  } catch (error) {
    warnSupabaseOperationalError("Tarefas", error);
    throw error;
  }
}

export async function updateTaskAsync(id: string, input: Partial<TaskInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return updateTask(id, input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar tarefa real.");

  try {
    const current = await getTaskByIdAsync(id, workspaceId);
    if (!current) return null;
    const merged: TaskInput = {
      client_id: current.client_id || "",
      client_name: current.client_name || "",
      process_id: current.process_id || "",
      process_number: current.process_number || "",
      title: current.title,
      description: current.description,
      type: current.type,
      status: current.status,
      priority: current.priority,
      responsible: current.responsible,
      due_at: current.due_at,
      reminder_at: current.reminder_at || "",
      completed_at: current.completed_at,
      archived_at: current.archived_at,
      next_action: current.next_action,
      notes: current.notes,
      ...input,
    };
    const { data, error } = await (supabase as any)
      .from("tasks")
      .update(toSupabaseTask(merged, workspaceId))
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(TASK_SELECT)
      .single();
    if (error) throw error;
    const task = fromSupabaseTask(data as SupabaseTaskRow);
    const action = task.archived_at ? "task_archived" : task.completed_at && !current.completed_at ? "task_completed" : current.completed_at && !task.completed_at ? "task_reopened" : "task_updated";
    await recordTaskActivity(workspaceId, action, task.id, `Tarefa ${task.title} atualizada.`);
    return task;
  } catch (error) {
    warnSupabaseOperationalError("Tarefas", error);
    throw error;
  }
}

export async function completeTaskAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateTaskAsync(id, { status: "concluida", completed_at: nowIso(), archived_at: undefined }, workspaceId);
}

export async function reopenTaskAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateTaskAsync(id, { status: "a_fazer", completed_at: undefined, archived_at: undefined }, workspaceId);
}

export async function archiveTaskAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateTaskAsync(id, { status: "arquivada", archived_at: nowIso() }, workspaceId);
}

export async function listTasksByClientIdAsync(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const tasks = await listTasksAsync(workspaceId, { status: "todas", includeArchived: false });
  return tasks.filter((task) => task.client_id === clientId);
}

export async function listTasksByProcessIdAsync(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const tasks = await listTasksAsync(workspaceId, { status: "todas", includeArchived: false });
  return tasks.filter((task) => task.process_id === processId);
}
