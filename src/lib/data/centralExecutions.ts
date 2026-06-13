import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logCentralActivity, logPromptActivity } from "@/lib/data/activityLogs";
import { FALLBACK_WORKSPACE_ID } from "./clients";

export type CentralExecutionType = "prompt" | "dossie_rapido" | "agente" | "fluxo" | "playbook" | "checklist" | "mensagem" | "resumo";
export type CentralExecutionStatus = "generated" | "copied" | "archived";

export type CentralExecution = {
  id: string;
  workspace_id: string;
  created_by?: string | null;
  type: CentralExecutionType;
  title: string;
  source_module?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  partnership_id?: string | null;
  task_id?: string | null;
  agenda_event_id?: string | null;
  finance_id?: string | null;
  financial_record_id?: string | null;
  report_id?: string | null;
  input_summary: string;
  output_text: string;
  status: CentralExecutionStatus;
  metadata?: Record<string, unknown>;
  copied_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CentralExecutionInput = Omit<CentralExecution, "id" | "workspace_id" | "status" | "created_at" | "updated_at" | "archived_at" | "copied_at" | "created_by"> & {
  workspace_id?: string;
  status?: CentralExecutionStatus;
  copied_at?: string | null;
  archived_at?: string | null;
};

export type CentralExecutionListOptions = { includeArchived?: boolean; archivedOnly?: boolean; type?: CentralExecutionType | "todos" };

const CENTRAL_EXECUTIONS_STORAGE_PREFIX = "lexos.control.demo.central-executions";
export const CENTRAL_EXECUTIONS_UPDATED_EVENT = "lexos:central-executions-updated";
export const CENTRAL_REVIEW_NOTICE = "Saída gerada com dados do workspace. Revisão humana obrigatória antes de uso externo.";
export const CENTRAL_DEMO_REVIEW_NOTICE = "Saída demonstrativa. Revisão humana obrigatória antes de qualquer uso externo.";

const fallbackExecutions: CentralExecution[] = [
  {
    id: "central-execution-demo-1",
    workspace_id: FALLBACK_WORKSPACE_ID,
    type: "dossie_rapido",
    title: "Dossiê rápido demonstrativo • Grupo Ápice",
    source_module: "Central LEX.OS",
    client_id: "client-demo-2",
    process_id: "process-demo-2",
    input_summary: "Base local/demo com cliente, processo, tarefas e parcerias vinculadas.",
    output_text: `Resumo executivo\nDossiê demonstrativo criado para reunião estratégica com cliente.\n\nAviso\n${CENTRAL_DEMO_REVIEW_NOTICE}`,
    status: "generated",
    created_at: "2026-05-12T14:30:00.000Z",
    updated_at: "2026-05-12T14:30:00.000Z",
  },
];

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${CENTRAL_EXECUTIONS_STORAGE_PREFIX}.${workspaceId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `central-execution-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStatus(status: unknown): CentralExecutionStatus {
  if (status === "archived" || status === "arquivado") return "archived";
  if (status === "copied" || status === "copiado") return "copied";
  return "generated";
}

function isArchived(execution: CentralExecution) {
  return execution.status === "archived" || Boolean(execution.archived_at);
}

function isCentralExecution(value: unknown): value is CentralExecution {
  if (!value || typeof value !== "object") return false;
  const execution = value as Partial<CentralExecution>;
  return Boolean(execution.id && execution.workspace_id && execution.type && execution.title && execution.output_text && execution.status);
}

function normalizeExecution(execution: CentralExecution): CentralExecution {
  return { ...execution, status: normalizeStatus(execution.status), financial_record_id: execution.financial_record_id ?? execution.finance_id ?? null, finance_id: execution.finance_id ?? execution.financial_record_id ?? null };
}

function safeParseExecutions(raw: string | null): CentralExecution[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCentralExecution).map(normalizeExecution) : null;
  } catch {
    return null;
  }
}

function dispatchUpdated(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(CENTRAL_EXECUTIONS_UPDATED_EVENT, { detail: { workspaceId } }));
}

function persistExecutions(executions: CentralExecution[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(executions));
  dispatchUpdated(workspaceId);
}

function ensureReviewNotice(output: string) {
  if (output.includes(CENTRAL_REVIEW_NOTICE) || output.includes(CENTRAL_DEMO_REVIEW_NOTICE) || output.toLowerCase().includes("revisão humana")) return output;
  return `${output.trim()}

Aviso
${CENTRAL_DEMO_REVIEW_NOTICE}`;
}

function getCentralExecutionSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParseExecutions(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getFallbackCentralExecutions(workspaceId);
}

function applyListOptions(executions: CentralExecution[], options: CentralExecutionListOptions = {}) {
  return executions
    .map(normalizeExecution)
    .filter((execution) => (options.type && options.type !== "todos" ? execution.type === options.type : true))
    .filter((execution) => {
      if (options.archivedOnly) return isArchived(execution);
      return options.includeArchived ? true : !isArchived(execution);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getFallbackCentralExecutions(workspaceId = FALLBACK_WORKSPACE_ID) {
  return fallbackExecutions.map((execution) => ({ ...execution, workspace_id: workspaceId }));
}

export function listCentralExecutions(workspaceId = FALLBACK_WORKSPACE_ID, options: CentralExecutionListOptions = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  return applyListOptions(getCentralExecutionSource(workspaceId), options);
}

export function getCentralExecutionById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listCentralExecutions(workspaceId, { includeArchived: true }).find((execution) => execution.id === id) ?? null;
}

export function createCentralExecution(input: CentralExecutionInput, workspaceId = input.workspace_id ?? FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Execuções reais devem ser criadas via Supabase.");
  const timestamp = nowIso();
  const execution: CentralExecution = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    finance_id: input.finance_id ?? input.financial_record_id ?? null,
    financial_record_id: input.financial_record_id ?? input.finance_id ?? null,
    output_text: ensureReviewNotice(input.output_text),
    status: input.status ?? "generated",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const executions = [execution, ...getCentralExecutionSource(workspaceId)];
  persistExecutions(executions, workspaceId);
  return execution;
}

export function markCentralExecutionCopied(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const timestamp = nowIso();
  const executions = getCentralExecutionSource(workspaceId).map((execution) =>
    execution.id === id ? { ...execution, status: "copied" as const, copied_at: timestamp, updated_at: timestamp } : execution,
  );
  persistExecutions(executions, workspaceId);
  return getCentralExecutionById(id, workspaceId);
}

export function archiveCentralExecution(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const timestamp = nowIso();
  const executions = getCentralExecutionSource(workspaceId).map((execution) =>
    execution.id === id ? { ...execution, status: "archived" as const, archived_at: timestamp, updated_at: timestamp } : execution,
  );
  persistExecutions(executions, workspaceId);
  return getCentralExecutionById(id, workspaceId);
}

type CentralExecutionRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  execution_type: string;
  title: string;
  source_module: string | null;
  client_id: string | null;
  process_id: string | null;
  partnership_id: string | null;
  task_id: string | null;
  agenda_event_id: string | null;
  financial_record_id: string | null;
  report_id: string | null;
  input_summary: string | null;
  output_text: string;
  status: string;
  metadata: Record<string, unknown> | null;
  copied_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const CENTRAL_EXECUTION_SELECT = "id, workspace_id, created_by, execution_type, title, source_module, client_id, process_id, partnership_id, task_id, agenda_event_id, financial_record_id, report_id, input_summary, output_text, status, metadata, copied_at, archived_at, created_at, updated_at";

function fromSupabaseExecution(row: CentralExecutionRow): CentralExecution {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    created_by: row.created_by,
    type: row.execution_type as CentralExecutionType,
    title: row.title,
    source_module: row.source_module,
    client_id: row.client_id,
    process_id: row.process_id,
    partnership_id: row.partnership_id,
    task_id: row.task_id,
    agenda_event_id: row.agenda_event_id,
    finance_id: row.financial_record_id,
    financial_record_id: row.financial_record_id,
    report_id: row.report_id,
    input_summary: row.input_summary || "",
    output_text: row.output_text,
    status: normalizeStatus(row.status),
    metadata: row.metadata || {},
    copied_at: row.copied_at,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function resolveCreatedBy(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function toSupabaseExecution(input: CentralExecutionInput, workspaceId: string, createdBy: string | null) {
  return {
    workspace_id: workspaceId,
    created_by: createdBy,
    execution_type: input.type,
    title: input.title,
    source_module: input.source_module ?? "Central LEX.OS",
    client_id: input.client_id ?? null,
    process_id: input.process_id ?? null,
    partnership_id: input.partnership_id ?? null,
    task_id: input.task_id ?? null,
    agenda_event_id: input.agenda_event_id ?? null,
    financial_record_id: input.financial_record_id ?? input.finance_id ?? null,
    report_id: input.report_id ?? null,
    input_summary: input.input_summary ?? null,
    output_text: ensureReviewNotice(input.output_text),
    status: input.status ?? "generated",
    metadata: input.metadata ?? {},
  };
}

export async function listCentralExecutionsAsync(workspaceId = FALLBACK_WORKSPACE_ID, options: CentralExecutionListOptions = {}) {
  if (!shouldUseWorkspaceSupabase()) return listCentralExecutions(workspaceId, options);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("central_executions")
      .select(CENTRAL_EXECUTION_SELECT)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return applyListOptions(((data || []) as CentralExecutionRow[]).map(fromSupabaseExecution), options);
  } catch (error) {
    warnSupabaseOperationalError("Central LEX.OS", error);
    return [];
  }
}

export async function getCentralExecutionByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getCentralExecutionById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("central_executions")
      .select(CENTRAL_EXECUTION_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? fromSupabaseExecution(data as CentralExecutionRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Central LEX.OS", error);
    return null;
  }
}

export async function createCentralExecutionAsync(input: CentralExecutionInput, workspaceId = input.workspace_id ?? FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createCentralExecution(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para salvar execução real da Central LEX.OS.");

  try {
    const createdBy = await resolveCreatedBy(supabase);
    const { data, error } = await (supabase as any)
      .from("central_executions")
      .insert(toSupabaseExecution(input, workspaceId, createdBy))
      .select(CENTRAL_EXECUTION_SELECT)
      .single();

    if (error) throw error;
    const execution = fromSupabaseExecution(data as CentralExecutionRow);
    dispatchUpdated(workspaceId);
    await logCentralActivity({ workspaceId, action: "central_execution_generated", entityId: execution.id, title: execution.title, description: `Execução ${execution.title} gerada na Central LEX.OS.` });
    if (execution.type === "prompt") {
      await logPromptActivity({ workspaceId, action: "prompt_executed", entityId: String(execution.metadata?.prompt_template_id ?? execution.id), title: execution.title, description: `Prompt ${execution.title} executado na Central LEX.OS.` });
    }
    return execution;
  } catch (error) {
    warnSupabaseOperationalError("Central LEX.OS", error);
    throw error;
  }
}

export async function markCentralExecutionCopiedAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return markCentralExecutionCopied(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  const timestamp = nowIso();

  try {
    const { data, error } = await (supabase as any)
      .from("central_executions")
      .update({ status: "copied", copied_at: timestamp })
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(CENTRAL_EXECUTION_SELECT)
      .single();

    if (error) throw error;
    const execution = fromSupabaseExecution(data as CentralExecutionRow);
    dispatchUpdated(workspaceId);
    await logCentralActivity({ workspaceId, action: "central_execution_copied", entityId: execution.id, title: execution.title, description: `Execução ${execution.title} copiada.` });
    return execution;
  } catch (error) {
    warnSupabaseOperationalError("Central LEX.OS", error);
    return null;
  }
}

export async function archiveCentralExecutionAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return archiveCentralExecution(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  const timestamp = nowIso();

  try {
    const { data, error } = await (supabase as any)
      .from("central_executions")
      .update({ status: "archived", archived_at: timestamp })
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(CENTRAL_EXECUTION_SELECT)
      .single();

    if (error) throw error;
    const execution = fromSupabaseExecution(data as CentralExecutionRow);
    dispatchUpdated(workspaceId);
    await logCentralActivity({ workspaceId, action: "central_execution_archived", entityId: execution.id, title: execution.title, description: `Execução ${execution.title} arquivada.` });
    return execution;
  } catch (error) {
    warnSupabaseOperationalError("Central LEX.OS", error);
    return null;
  }
}

export function getLocalCentralExecutionSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listCentralExecutions(workspaceId, { includeArchived: false }).map((execution) => ({
    type: "Central LEX.OS",
    title: execution.title,
    description: `${execution.type} • ${execution.input_summary || "execução registrada"}`,
    route: `/central-lexos?executionId=${execution.id}`,
    action: "Abrir execução",
  }));
}

export async function getCentralExecutionSearchResultsAsync(workspaceId = FALLBACK_WORKSPACE_ID) {
  const executions = await listCentralExecutionsAsync(workspaceId, { includeArchived: false });
  return executions.map((execution) => ({
    type: "Central LEX.OS",
    title: execution.title,
    description: `${execution.type} • ${execution.input_summary || "execução registrada"}`,
    route: `/central-lexos?executionId=${execution.id}`,
    action: "Abrir execução",
  }));
}
