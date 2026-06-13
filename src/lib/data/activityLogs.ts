import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import type { Json } from "@/lib/supabase/types";

export const ACTIVITY_LOGS_UPDATED_EVENT = "lexos:activity-logs:updated";

export type ActivityEntityType =
  | "clients"
  | "processes"
  | "process_partnerships"
  | "tasks"
  | "agenda"
  | "financeiro"
  | "reports"
  | "central_lexos"
  | "prompts"
  | "usuarios"
  | "configuracoes"
  | string;

export type ActivityLog = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  user_id: string | null;
  entity_type: ActivityEntityType;
  module: string;
  entity_id: string | null;
  action: string;
  title: string | null;
  description: string | null;
  metadata: Json;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
};

export type ActivityLogPayload = {
  workspaceId: string;
  entityType: ActivityEntityType;
  action: string;
  entityId?: string | null;
  title?: string | null;
  description?: string | null;
  metadata?: Json;
};

export type ActivityLogFilters = {
  entityType?: string;
  action?: string;
  limit?: number;
};

const moduleLabels: Record<string, string> = {
  clients: "Clientes",
  processes: "Processos",
  process_partnerships: "Parcerias",
  tasks: "Tarefas",
  agenda: "Agenda",
  financeiro: "Financeiro",
  reports: "Relatórios",
  central_lexos: "Central LEX.OS",
  prompts: "Prompts",
  usuarios: "Usuários/permissões",
  configuracoes: "Configurações",
};

const routes: Record<string, string> = {
  clients: "/clientes?clientId=",
  processes: "/processos?processId=",
  process_partnerships: "/processos/parcerias?partnershipId=",
  tasks: "/tarefas?taskId=",
  agenda: "/agenda?eventId=",
  financeiro: "/financeiro?financeId=",
  reports: "/relatorios?reportId=",
  central_lexos: "/central-lexos?executionId=",
  prompts: "/central-lexos/prompts?promptId=",
  usuarios: "/configuracoes",
  configuracoes: "/configuracoes",
};

export function getActivityModuleLabel(entityType: string) {
  return moduleLabels[entityType] ?? entityType;
}

export function getActivityRoute(log: Pick<ActivityLog, "entity_type" | "entity_id">) {
  const base = routes[log.entity_type] ?? "/configuracoes/auditoria";
  if (!log.entity_id || ["/configuracoes", "/configuracoes/auditoria"].includes(base)) return base;
  return `${base}${log.entity_id}`;
}

function dispatchUpdated(workspaceId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_LOGS_UPDATED_EVENT, { detail: { workspaceId } }));
}

function sanitizeMetadata(metadata: Json | undefined): Json {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata ?? {};
  const blocked = ["password", "senha", "token", "secret", "key", "chave", "authorization"];
  return Object.fromEntries(
    Object.entries(metadata as Record<string, Json>).filter(([key]) => !blocked.some((blockedKey) => key.toLowerCase().includes(blockedKey))),
  );
}

export async function createActivityLog(payload: ActivityLogPayload): Promise<ActivityLog | null> {
  if (!payload.workspaceId || !payload.entityType || !payload.action || !shouldUseWorkspaceSupabase()) return null;
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: authData } = await (supabase as any).auth.getUser();
    const actorId = authData?.user?.id ?? null;
    const row = {
      workspace_id: payload.workspaceId,
      user_id: actorId,
      actor_user_id: actorId,
      module: payload.entityType,
      entity_type: payload.entityType,
      entity_id: payload.entityId ?? null,
      action: payload.action,
      title: payload.title ?? null,
      description: payload.description ?? null,
      metadata: sanitizeMetadata(payload.metadata),
    };

    const { data, error } = await (supabase as any).from("activity_logs").insert(row).select("id, workspace_id, user_id, actor_user_id, module, entity_type, entity_id, action, title, description, metadata, created_at").single();
    if (error) throw error;
    dispatchUpdated(payload.workspaceId);
    return mapActivityLog(data);
  } catch (error) {
    warnSupabaseOperationalError("activity_logs.create", error);
    return null;
  }
}

export async function listActivityLogs(workspaceId: string, filters: ActivityLogFilters = {}): Promise<ActivityLog[]> {
  if (!workspaceId || !shouldUseWorkspaceSupabase()) return [];
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    let query = (supabase as any)
      .from("activity_logs")
      .select("id, workspace_id, user_id, actor_user_id, module, entity_type, entity_id, action, title, description, metadata, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 50);

    if (filters.entityType && filters.entityType !== "todos") query = query.eq("entity_type", filters.entityType);
    if (filters.action && filters.action !== "todos") query = query.eq("action", filters.action);

    const { data, error } = await query;
    if (error) throw error;
    const logs = ((data ?? []) as any[]).map(mapActivityLog);
    await hydrateActors(supabase, logs);
    return logs;
  } catch (error) {
    warnSupabaseOperationalError("activity_logs.list", error);
    return [];
  }
}

async function hydrateActors(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>, logs: ActivityLog[]) {
  const ids = Array.from(new Set(logs.map((log) => log.actor_user_id || log.user_id).filter(Boolean))) as string[];
  if (!ids.length) return;
  try {
    const { data, error } = await (supabase as any).from("profiles").select("id, full_name, email").in("id", ids);
    if (error) throw error;
    const profiles = new Map((data ?? []).map((profile: any) => [profile.id, profile]));
    logs.forEach((log) => {
      const profile = profiles.get(log.actor_user_id || log.user_id || "") as any;
      log.actor_name = profile?.full_name ?? null;
      log.actor_email = profile?.email ?? null;
    });
  } catch (error) {
    warnSupabaseOperationalError("activity_logs.actors", error);
  }
}

function mapActivityLog(row: any): ActivityLog {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id ?? null,
    actor_user_id: row.actor_user_id ?? row.user_id ?? null,
    module: row.module ?? row.entity_type,
    entity_type: row.entity_type ?? row.module,
    entity_id: row.entity_id ?? null,
    action: row.action,
    title: row.title ?? null,
    description: row.description ?? null,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
  };
}

function logModuleActivity(entityType: ActivityEntityType, payload: Omit<ActivityLogPayload, "entityType">) {
  return createActivityLog({ ...payload, entityType });
}

export const logClientActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("clients", payload);
export const logProcessActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("processes", payload);
export const logPartnershipActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("process_partnerships", payload);
export const logTaskActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("tasks", payload);
export const logAgendaActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("agenda", payload);
export const logFinanceActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("financeiro", payload);
export const logReportActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("reports", payload);
export const logCentralActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("central_lexos", payload);
export const logPromptActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("prompts", payload);
export const logMemberActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("usuarios", payload);
export const logSettingsActivity = (payload: Omit<ActivityLogPayload, "entityType">) => logModuleActivity("configuracoes", payload);
