import { resolveSupabaseSession } from "@/lib/auth";
import { createActivityLog, listActivityLogs, type ActivityLog } from "@/lib/data/activityLogs";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { normalizeWorkspaceRole, type WorkspaceRole } from "@/lib/permissions";

export type OnboardingModuleKey =
  | "clients"
  | "processes"
  | "process_partnerships"
  | "tasks"
  | "agenda_events"
  | "financial_records"
  | "reports"
  | "central_executions"
  | "prompt_templates"
  | "activity_logs"
  | "workspace_members";

export type OnboardingCounts = Record<OnboardingModuleKey, number>;

export type TestDataModuleSummary = {
  key: Exclude<OnboardingModuleKey, "activity_logs" | "workspace_members">;
  label: string;
  route: string;
  count: number;
  samples: string[];
  reviewLater: boolean;
};

export type OnboardingState = {
  mode: "demo" | "supabase";
  workspaceId: string | null;
  workspaceName: string;
  workspaceStatus: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  userRole: WorkspaceRole;
  counts: OnboardingCounts;
  hasOwnerAdminActive: boolean;
  latestActivities: ActivityLog[];
  testData: TestDataModuleSummary[];
  errors: string[];
};

const zeroCounts: OnboardingCounts = {
  clients: 0,
  processes: 0,
  process_partnerships: 0,
  tasks: 0,
  agenda_events: 0,
  financial_records: 0,
  reports: 0,
  central_executions: 0,
  prompt_templates: 0,
  activity_logs: 0,
  workspace_members: 0,
};

const testSignals = [
  "TESTE",
  "DEMO",
  "REAL TESTE",
  "3C",
  "3D",
  "3E",
  "3F",
  "3K",
  "FINANCEIRO REAL TESTE",
  "PROCESSO REAL TESTE",
  "TAREFA REAL TESTE",
  "AGENDA REAL TESTE",
  "PROMPT REAL TESTE",
];

const testModules = [
  { key: "clients", label: "Clientes", route: "/clientes", fields: ["name", "document", "email", "pending", "notes"] },
  { key: "processes", label: "Processos", route: "/processos", fields: ["title", "process_number", "counterparty", "next_action", "notes"] },
  { key: "process_partnerships", label: "Parcerias", route: "/processos/parcerias", fields: ["partner_name", "partner_type", "responsible", "notes"] },
  { key: "tasks", label: "Tarefas", route: "/tarefas", fields: ["title", "description", "responsible", "next_action", "notes"] },
  { key: "agenda_events", label: "Agenda/Prazos", route: "/agenda", fields: ["title", "description", "responsible", "location", "next_action", "notes"] },
  { key: "financial_records", label: "Financeiro", route: "/financeiro", fields: ["title", "description", "responsible", "category", "notes"] },
  { key: "reports", label: "Relatórios", route: "/relatorios", fields: ["title", "summary", "generated_text"] },
  { key: "central_executions", label: "Central LEX.OS", route: "/central-lexos", fields: ["title", "input_summary", "output_text", "source_module"] },
  { key: "prompt_templates", label: "Prompts", route: "/central-lexos/prompts", fields: ["title", "description", "category", "legal_area", "prompt_body"] },
] as const;

function includesTestSignal(row: Record<string, unknown>, fields: readonly string[]) {
  const haystack = fields.map((field) => String(row[field] ?? "")).join(" ").toUpperCase();
  return testSignals.some((signal) => haystack.includes(signal));
}

function pickSample(row: Record<string, unknown>, fields: readonly string[]) {
  const value = fields.map((field) => String(row[field] ?? "").trim()).find(Boolean);
  return value ? value.slice(0, 92) : "Registro com indício de teste";
}

async function safeCount(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>, table: OnboardingModuleKey, workspaceId: string) {
  try {
    const { count, error } = await (supabase as any)
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    warnSupabaseOperationalError(`onboarding.count.${table}`, error);
    return 0;
  }
}

async function detectTestData(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>, workspaceId: string) {
  const summaries = await Promise.all(
    testModules.map(async (module) => {
      try {
        const select = ["id", ...module.fields].join(", ");
        const { data, error } = await (supabase as any)
          .from(module.key)
          .select(select)
          .eq("workspace_id", workspaceId)
          .limit(80);
        if (error) throw error;
        const matches = ((data ?? []) as Record<string, unknown>[]).filter((row) => includesTestSignal(row, module.fields));
        return {
          key: module.key,
          label: module.label,
          route: module.route,
          count: matches.length,
          samples: matches.slice(0, 4).map((row) => pickSample(row, module.fields)),
          reviewLater: false,
        } satisfies TestDataModuleSummary;
      } catch (error) {
        warnSupabaseOperationalError(`onboarding.test-data.${module.key}`, error);
        return {
          key: module.key,
          label: module.label,
          route: module.route,
          count: 0,
          samples: [],
          reviewLater: false,
        } satisfies TestDataModuleSummary;
      }
    }),
  );

  return summaries;
}

export async function loadOnboardingState(): Promise<OnboardingState> {
  const session = await resolveSupabaseSession();
  const fallback = {
    mode: (session?.mode === "supabase" && shouldUseWorkspaceSupabase() ? "supabase" : "demo") as "demo" | "supabase",
    workspaceId: session?.workspace.id ?? null,
    workspaceName: session?.workspace.name ?? "Workspace demonstrativo",
    workspaceStatus: session?.workspace.status ?? "demo",
    userId: session?.user.id ?? null,
    userName: session?.user.name ?? "Usuário demonstrativo",
    userEmail: session?.user.email ?? "demo@lexos.local",
    userRole: normalizeWorkspaceRole(session?.user.profile ?? "socio"),
    counts: { ...zeroCounts },
    hasOwnerAdminActive: false,
    latestActivities: [],
    testData: testModules.map((module) => ({
      key: module.key,
      label: module.label,
      route: module.route,
      count: 0,
      samples: [],
      reviewLater: false,
    })),
    errors: [] as string[],
  };

  if (!shouldUseWorkspaceSupabase() || session?.mode !== "supabase" || !session.user.workspaceId) {
    return fallback;
  }

  const supabase = createSupabaseClient();
  if (!supabase) return { ...fallback, errors: ["Supabase não configurado no navegador."] };

  const workspaceId = session.user.workspaceId;
  const counts = { ...zeroCounts };
  await Promise.all(
    (Object.keys(zeroCounts) as OnboardingModuleKey[]).map(async (key) => {
      counts[key] = await safeCount(supabase, key, workspaceId);
    }),
  );

  let hasOwnerAdminActive = false;
  try {
    const { count, error } = await (supabase as any)
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    if (error) throw error;
    hasOwnerAdminActive = (count ?? 0) > 0;
  } catch (error) {
    warnSupabaseOperationalError("onboarding.owner-admin", error);
  }

  const [latestActivities, testData] = await Promise.all([
    listActivityLogs(workspaceId, { limit: 5 }),
    detectTestData(supabase, workspaceId),
  ]);

  return {
    ...fallback,
    mode: "supabase",
    workspaceId,
    counts,
    hasOwnerAdminActive,
    latestActivities,
    testData,
  };
}

export async function logOnboardingActivity(workspaceId: string | null, action: string, description: string) {
  if (!workspaceId || !shouldUseWorkspaceSupabase()) return null;
  return createActivityLog({
    workspaceId,
    entityType: "configuracoes",
    action,
    entityId: workspaceId,
    title: "Onboarding do escritório",
    description,
  });
}
