import { hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { authStorageKeys } from "@/lib/auth";
import { hasDemoAccessCookie } from "@/lib/auth/routes";

export type DataSource = "demo" | "supabase" | "hybrid";

export type DataSourceStatus = {
  requested: DataSource;
  effective: DataSource;
  supabaseConfigured: boolean;
  label: string;
  warning?: string;
};

const labels: Record<DataSource, string> = {
  demo: "demo local",
  supabase: "Supabase",
  hybrid: "Híbrido",
};

function normalizeDataSource(value: string | undefined): DataSource {
  if (value === "supabase" || value === "hybrid" || value === "demo") return value;
  return "demo";
}

type StoredSessionSnapshot = {
  mode?: string;
  user?: {
    workspaceId?: string | null;
  };
  workspace?: {
    id?: string | null;
  };
};

function readStoredSession(): StoredSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const rawSession = window.localStorage.getItem(authStorageKeys.demoSession);
    if (!rawSession) return null;
    return JSON.parse(rawSession) as StoredSessionSnapshot;
  } catch {
    return null;
  }
}

function hasResolvedSupabaseWorkspace(session = readStoredSession()) {
  const workspaceId = session?.workspace?.id || session?.user?.workspaceId;
  return Boolean(
    session?.mode === "supabase" &&
      workspaceId &&
      !workspaceId.startsWith("workspace-demo-") &&
      workspaceId !== "workspace-demo-moraes-brito",
  );
}

export function getRequestedDataSource(): DataSource {
  return normalizeDataSource(
    process.env.NEXT_PUBLIC_LEXOS_DATA_SOURCE ?? process.env.LEXOS_DATA_SOURCE,
  );
}

export function getDataSource(): DataSource {
  const requested = getRequestedDataSource();

  if (hasDemoAccessCookie()) return "demo";

  if (hasSupabaseBrowserConfig() && readStoredSession()?.mode === "supabase") {
    return "supabase";
  }

  if (requested === "demo") return "demo";

  if (!hasSupabaseBrowserConfig()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[LEX.OS] Supabase solicitado, mas NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY não estão configuradas. Usando demo local.",
      );
    }
    return "demo";
  }

  return requested;
}

export function shouldUseSupabase() {
  const source = getDataSource();
  return source === "supabase" || source === "hybrid";
}

export function isDemoSessionActive() {
  return readStoredSession()?.mode === "demo";
}

export function isSupabaseSessionActive() {
  return readStoredSession()?.mode === "supabase";
}

export function isResolvedSupabaseWorkspaceActive() {
  return hasResolvedSupabaseWorkspace();
}

export function shouldUseWorkspaceSupabase() {
  return !hasDemoAccessCookie() && hasSupabaseBrowserConfig() && readStoredSession()?.mode === "supabase";
}

export function shouldUseDemoData() {
  return !shouldUseWorkspaceSupabase();
}

export function warnSupabaseOperationalError(module: string, error: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[LEX.OS] ${module}: falha ao acessar dados reais do Supabase. Retornando lista real vazia para não misturar demo.`, error);
  }
}

export function getDataSourceStatus(): DataSourceStatus {
  const effective = getDataSource();
  const requested = effective === "supabase" ? "supabase" : getRequestedDataSource();
  const supabaseConfigured = hasSupabaseBrowserConfig();
  const warning =
    requested !== "demo" && !supabaseConfigured
      ? "Supabase não configurado neste ambiente. Use a demonstração local."
      : undefined;

  return {
    requested,
    effective,
    supabaseConfigured,
    label: labels[effective],
    warning,
  };
}

export function formatDataSourceLabel(source: DataSource = getDataSource()) {
  return labels[source];
}
