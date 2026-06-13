import { processPortfolio } from "@/data/mock";
import { FALLBACK_WORKSPACE_ID, getInitialClients } from "./clients";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { getDataSource, shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logProcessActivity } from "@/lib/data/activityLogs";

export type ProcessArea =
  | "civel"
  | "trabalhista"
  | "consumidor"
  | "previdenciario"
  | "administrativo"
  | "tributario"
  | "penal"
  | "familia"
  | "outro";
export type ProcessStatus = "ativo" | "atenção" | "suspenso" | "arquivado" | "encerrado";
export type ProcessRisk = "baixo" | "médio" | "alto" | "crítico";
export type ProcessPriority = "baixa" | "média" | "alta" | "urgente";
export type ProcessDataMode = "demo_local" | "supabase_ready";

export type Process = {
  id: string;
  workspace_id: string;
  client_id: string;
  client_name: string;
  number: string;
  title: string;
  court: string;
  jurisdiction: string;
  area: ProcessArea;
  phase: string;
  status: ProcessStatus;
  risk: ProcessRisk;
  priority: ProcessPriority;
  responsible: string;
  opposing_party: string;
  next_deadline_at: string;
  next_action: string;
  main_issue: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
};

export type ProcessInput = Omit<Process, "id" | "workspace_id" | "created_at" | "updated_at" | "archived_at">;

export type ProcessFilters = {
  status?: ProcessStatus | "todos";
  risk?: ProcessRisk | "todos";
  area?: ProcessArea | "todos";
  responsible?: string | "todos";
  query?: string;
  includeArchived?: boolean;
};

const DEMO_PROCESSES_STORAGE_PREFIX = "lexos.control.demo.processes";
export const PROCESS_DATA_MODE: ProcessDataMode = "demo_local";
export const PROCESS_DATA_MODE_LABEL =
  "Modo demonstração: processos salvos localmente no navegador, sem sincronização ou conexão judicial real.";
export const PROCESSES_UPDATED_EVENT = "lexos:processes-updated";

const areaMap: Record<string, ProcessArea> = {
  trabalhista: "trabalhista",
  "cível estratégico": "civel",
  societário: "civel",
  regulatório: "administrativo",
  "família e sucessões": "familia",
};

const initialProcesses: Process[] = processPortfolio.map((item, index) => {
  const clients = getInitialClients(FALLBACK_WORKSPACE_ID);
  const linkedClient = clients.find((client) => client.name === item.client) ?? clients[index % clients.length];
  const timestamp = `2026-05-${String(8 - index).padStart(2, "0")}T13:00:00.000Z`;

  return {
    id: `process-demo-${index + 1}`,
    workspace_id: FALLBACK_WORKSPACE_ID,
    client_id: linkedClient?.id ?? `client-demo-${index + 1}`,
    client_name: item.client,
    number: item.number,
    title: `${item.area} • ${item.client}`,
    court: index === 0 ? "TRT da 2ª Região" : index === 3 ? "TRF da 3ª Região" : "TJSP",
    jurisdiction: index === 0 ? "São Paulo/SP" : index === 3 ? "Federal/SP" : "Foro Central de São Paulo/SP",
    area: areaMap[item.area.toLowerCase()] ?? "outro",
    phase: item.phase,
    status: item.risk === "alto" ? "atenção" : "ativo",
    risk: item.risk as ProcessRisk,
    priority: item.risk === "alto" ? "urgente" : item.risk === "médio" ? "alta" : "média",
    responsible: item.owner,
    opposing_party: ["Ex-empregadora", "Fornecedor estratégico", "Sócios vendedores", "Agência reguladora", "Herdeiros colaterais"][index] ?? "Parte contrária demonstrativa",
    next_deadline_at: toIsoDate(item.finalDeadline),
    next_action: item.nextAction,
    main_issue: `Tese e pendência central: ${item.nextAction.toLowerCase()}.`,
    notes: `Registro demonstrativo importado do mock premium. Prazo interno original: ${item.internalDeadline}.`,
    created_at: `2026-05-${String(1 + index).padStart(2, "0")}T09:30:00.000Z`,
    updated_at: timestamp,
  };
});

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${DEMO_PROCESSES_STORAGE_PREFIX}.${workspaceId}`;
}

function toIsoDate(brDate: string) {
  const [day, month, year] = brDate.split("/");
  return `${year}-${month}-${day}`;
}

function safeParseProcesses(raw: string | null): Process[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isProcess);
  } catch {
    return null;
  }
}

function isProcess(value: unknown): value is Process {
  if (!value || typeof value !== "object") return false;
  const process = value as Partial<Process>;
  return Boolean(process.id && process.workspace_id && process.client_id && process.number && process.status);
}

function persistProcesses(processes: Process[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(processes));
  window.dispatchEvent(new CustomEvent(PROCESSES_UPDATED_EVENT, { detail: { workspaceId } }));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `process-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getInitialProcesses(workspaceId = FALLBACK_WORKSPACE_ID): Process[] {
  return initialProcesses.map((process) => ({ ...process, workspace_id: workspaceId }));
}

function getProcessSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParseProcesses(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getInitialProcesses(workspaceId);
}

export function listProcesses(workspaceId = FALLBACK_WORKSPACE_ID, filters: ProcessFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  const source = getProcessSource(workspaceId);
  const query = filters.query?.trim().toLowerCase();

  return source
    .filter((process) => {
      if (filters.status && filters.status !== "todos") return process.status === filters.status;
      return filters.includeArchived ? true : process.status !== "arquivado";
    })
    .filter((process) => (filters.risk && filters.risk !== "todos" ? process.risk === filters.risk : true))
    .filter((process) => (filters.area && filters.area !== "todos" ? process.area === filters.area : true))
    .filter((process) => (filters.responsible && filters.responsible !== "todos" ? process.responsible === filters.responsible : true))
    .filter((process) => {
      if (!query) return true;
      return [
        process.number,
        process.client_name,
        process.opposing_party,
        process.responsible,
        process.title,
        process.main_issue,
        process.next_action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getProcessById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listProcesses(workspaceId, { includeArchived: true }).find((process) => process.id === id) ?? null;
}

export function createProcess(input: ProcessInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Processos reais ainda não possuem tabela ativa neste estágio.");
  const timestamp = nowIso();
  const process: Process = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: input.status === "arquivado" ? timestamp : undefined,
  };
  persistProcesses([process, ...listProcesses(workspaceId, { includeArchived: true })], workspaceId);
  return process;
}

export function updateProcess(id: string, input: Partial<ProcessInput>, workspaceId = FALLBACK_WORKSPACE_ID): Process | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: Process | null = null;
  const nextProcesses = listProcesses(workspaceId, { includeArchived: true }).map((process) => {
    if (process.id !== id) return process;
    const status = input.status ?? process.status;
    updated = {
      ...process,
      ...input,
      updated_at: nowIso(),
      archived_at: status === "arquivado" ? process.archived_at ?? nowIso() : undefined,
    };
    return updated;
  });
  persistProcesses(nextProcesses, workspaceId);
  return updated;
}

export function archiveProcess(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Process | null {
  return updateProcess(id, { status: "arquivado" }, workspaceId);
}

export function listProcessesByClientId(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listProcesses(workspaceId).filter((process) => process.client_id === clientId);
}

export function getProcessStats(workspaceId = FALLBACK_WORKSPACE_ID) {
  const processes = listProcesses(workspaceId);
  const active = processes.filter((process) => process.status === "ativo").length;
  const attention = processes.filter((process) => process.status === "atenção").length;
  const upcomingDeadlines = processes.filter((process) => isUpcoming(process.next_deadline_at)).length;
  const highRisk = processes.filter((process) => ["alto", "crítico"].includes(process.risk)).length;

  return [
    { label: "Processos ativos", value: String(active), detail: "em acompanhamento", tone: "positive" },
    { label: "Em atenção", value: String(attention), detail: "pedem decisão", tone: "warning" },
    { label: "Prazos próximos", value: String(upcomingDeadlines), detail: "próximos 10 dias", tone: "urgent" },
    { label: "Risco alto/crítico", value: String(highRisk), detail: "priorização jurídica", tone: "premium" },
  ];
}

function isUpcoming(date: string) {
  if (!date) return false;
  const deadline = new Date(`${date}T23:59:59`);
  const today = new Date();
  const tenDays = new Date();
  tenDays.setDate(today.getDate() + 10);
  return deadline >= today && deadline <= tenDays;
}

export async function getProcesses() {
  return getInitialProcesses();
}

export function getLocalProcessSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listProcesses(workspaceId).map((process) => ({
    type: "Processos",
    title: `Proc. ${process.number}`,
    description: `${process.client_name} • ${process.phase} • risco ${process.risk} • ${process.next_action}`,
    route: `/processos/${process.id}`,
    action: "Abrir processo",
  }));
}

export const PROCESS_REAL_DATA_MODE_LABEL =
  getDataSource() === "supabase"
    ? "Ambiente conectado: processos e vínculos carregados exclusivamente do escritório."
    : PROCESS_DATA_MODE_LABEL;

type SupabaseProcessRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  title: string | null;
  process_number: string | null;
  area: string | null;
  status: string | null;
  risk_level: string | null;
  phase: string | null;
  responsible: string | null;
  counterparty: string | null;
  court_or_agency: string | null;
  next_action: string | null;
  due_date: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  clients?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function normalizeArea(value: string | null | undefined): ProcessArea {
  return processAreasSet.has((value || "") as ProcessArea) ? (value as ProcessArea) : "outro";
}

function normalizeProcessStatus(value: string | null | undefined): ProcessStatus {
  if (value === "active") return "ativo";
  if (value === "attention") return "atenção";
  if (value === "suspended") return "suspenso";
  if (value === "archived") return "arquivado";
  if (value === "closed") return "encerrado";
  return processStatusesSet.has((value || "") as ProcessStatus) ? (value as ProcessStatus) : "ativo";
}

function normalizeRisk(value: string | null | undefined): ProcessRisk {
  return processRisksSet.has((value || "") as ProcessRisk) ? (value as ProcessRisk) : "médio";
}

function normalizePriority(value: string | null | undefined): ProcessPriority {
  return processPrioritiesSet.has((value || "") as ProcessPriority) ? (value as ProcessPriority) : "média";
}

const processAreasSet = new Set<ProcessArea>(["civel", "trabalhista", "consumidor", "previdenciario", "administrativo", "tributario", "penal", "familia", "outro"]);
const processStatusesSet = new Set<ProcessStatus>(["ativo", "atenção", "suspenso", "arquivado", "encerrado"]);
const processRisksSet = new Set<ProcessRisk>(["baixo", "médio", "alto", "crítico"]);
const processPrioritiesSet = new Set<ProcessPriority>(["baixa", "média", "alta", "urgente"]);

function relatedClientName(row: SupabaseProcessRow) {
  const related = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return related?.name || String(row.metadata?.client_name || "") || "Cliente não informado";
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function fromSupabaseProcess(row: SupabaseProcessRow): Process {
  const timestamp = row.updated_at || row.created_at || nowIso();
  const metadata = row.metadata || {};
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || "",
    client_name: relatedClientName(row),
    number: row.process_number || "",
    title: row.title || row.process_number || "Processo sem título",
    court: row.court_or_agency || "",
    jurisdiction: metadataString(metadata, "jurisdiction"),
    area: normalizeArea(row.area),
    phase: row.phase || "",
    status: row.archived_at ? "arquivado" : normalizeProcessStatus(row.status),
    risk: normalizeRisk(row.risk_level),
    priority: normalizePriority(metadataString(metadata, "priority")),
    responsible: row.responsible || "",
    opposing_party: row.counterparty || "",
    next_deadline_at: row.due_date || "",
    next_action: row.next_action || "",
    main_issue: metadataString(metadata, "main_issue"),
    notes: row.notes || "",
    archived_at: row.archived_at || undefined,
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
  };
}

function toSupabaseProcess(input: Partial<ProcessInput>, workspaceId: string) {
  const archivedAt = input.status === "arquivado" ? nowIso() : null;
  return {
    workspace_id: workspaceId,
    client_id: input.client_id || null,
    title: input.title,
    process_number: input.number || null,
    court_or_agency: input.court || null,
    area: input.area || null,
    phase: input.phase || null,
    status: input.status,
    risk_level: input.risk || null,
    responsible: input.responsible || null,
    counterparty: input.opposing_party || null,
    due_date: input.next_deadline_at || null,
    next_action: input.next_action || null,
    notes: input.notes || null,
    archived_at: archivedAt,
    metadata: {
      client_name: input.client_name || "",
      jurisdiction: input.jurisdiction || "",
      priority: input.priority || "média",
      main_issue: input.main_issue || "",
    },
  };
}

function filterProcessRows(rows: Process[], filters: ProcessFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return rows
    .filter((process) => {
      if (filters.status && filters.status !== "todos") return process.status === filters.status;
      return filters.includeArchived ? true : process.status !== "arquivado";
    })
    .filter((process) => (filters.risk && filters.risk !== "todos" ? process.risk === filters.risk : true))
    .filter((process) => (filters.area && filters.area !== "todos" ? process.area === filters.area : true))
    .filter((process) => (filters.responsible && filters.responsible !== "todos" ? process.responsible === filters.responsible : true))
    .filter((process) => {
      if (!query) return true;
      return [process.number, process.client_name, process.opposing_party, process.responsible, process.title, process.main_issue, process.next_action]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

const PROCESS_SELECT = "id, workspace_id, client_id, title, process_number, area, status, risk_level, phase, responsible, counterparty, court_or_agency, next_action, due_date, notes, metadata, archived_at, created_at, updated_at, clients(name)";

async function recordProcessActivity(workspaceId: string, action: string, entityId: string, description: string) {
  await logProcessActivity({
    workspaceId,
    action,
    entityId,
    description,
  });
}

export async function listProcessesAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: ProcessFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listProcesses(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("processes")
      .select(PROCESS_SELECT)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return filterProcessRows(((data || []) as SupabaseProcessRow[]).map(fromSupabaseProcess), filters);
  } catch (error) {
    warnSupabaseOperationalError("Processos", error);
    return [];
  }
}

export async function getProcessByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getProcessById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("processes")
      .select(PROCESS_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseProcess(data as SupabaseProcessRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Processos", error);
    return null;
  }
}

export async function createProcessAsync(input: ProcessInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createProcess(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar processo real.");

  try {
    const { data, error } = await (supabase as any)
      .from("processes")
      .insert(toSupabaseProcess(input, workspaceId))
      .select(PROCESS_SELECT)
      .single();
    if (error) throw error;
    const process = fromSupabaseProcess(data as SupabaseProcessRow);
    await recordProcessActivity(workspaceId, "process_created", process.id, `Processo ${process.number || process.title} criado.`);
    return process;
  } catch (error) {
    warnSupabaseOperationalError("Processos", error);
    throw error;
  }
}

export async function updateProcessAsync(id: string, input: Partial<ProcessInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return updateProcess(id, input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar processo real.");

  try {
    const current = await getProcessByIdAsync(id, workspaceId);
    const payload = toSupabaseProcess({ ...(current ? toFormInput(current) : emptyProcessInput()), ...input }, workspaceId);
    const { data, error } = await (supabase as any)
      .from("processes")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(PROCESS_SELECT)
      .single();
    if (error) throw error;
    const process = fromSupabaseProcess(data as SupabaseProcessRow);
    await recordProcessActivity(workspaceId, process.status === "arquivado" ? "process_archived" : "process_updated", process.id, `Processo ${process.number || process.title} atualizado.`);
    return process;
  } catch (error) {
    warnSupabaseOperationalError("Processos", error);
    throw error;
  }
}

function emptyProcessInput(): ProcessInput {
  return {
    client_id: "",
    client_name: "",
    number: "",
    title: "",
    court: "",
    jurisdiction: "",
    area: "civel",
    phase: "",
    status: "ativo",
    risk: "médio",
    priority: "média",
    responsible: "",
    opposing_party: "",
    next_deadline_at: "",
    next_action: "",
    main_issue: "",
    notes: "",
  };
}

function toFormInput(process: Process): ProcessInput {
  const { id: _id, workspace_id: _workspaceId, created_at: _createdAt, updated_at: _updatedAt, archived_at: _archivedAt, ...input } = process;
  return input;
}

export async function archiveProcessAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateProcessAsync(id, { status: "arquivado" }, workspaceId);
}

export async function listProcessesByClientIdAsync(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const processes = await listProcessesAsync(workspaceId);
  return processes.filter((process) => process.client_id === clientId);
}
