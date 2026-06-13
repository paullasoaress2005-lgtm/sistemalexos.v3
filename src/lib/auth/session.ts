import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { normalizeWorkspaceRole } from "@/lib/permissions";
import { DEMO_ACCESS_COOKIE, DEMO_ACCESS_COOKIE_VALUE } from "./routes";
import type {
  AuthLoginResult,
  LexosPermission,
  LexosProfile,
  LexosSession,
  LexosUser,
  LexosWorkspace,
} from "./types";

const DEMO_SESSION_STORAGE_KEY = "lexos.control.demo.session";
const PENDING_TOAST_STORAGE_KEY = "lexos.control.pending.toast";
const SESSION_UPDATED_EVENT = "lexos:session-updated";

const LEGACY_DEMO_MODE_STORAGE_KEYS = [
  "demoMode",
  "lexos_demo",
  "dataSource",
  "sessionMode",
  "lexosDataSource",
  "lexos.dataSource",
  "lexos.control.dataSource",
  "lexos.control.demoMode",
  "lexos.control.sessionMode",
] as const;

export const permissionMap: Record<LexosProfile, LexosPermission[]> = {
  owner: [
    "dashboard",
    "clientes",
    "processos",
    "parcerias",
    "tarefas",
    "agenda",
    "financeiro",
    "relatorios",
    "central_lexos",
    "prompts",
    "configuracoes",
    "usuarios",
    "painel_socios",
  ],
  admin: [
    "dashboard",
    "clientes",
    "processos",
    "parcerias",
    "tarefas",
    "agenda",
    "financeiro",
    "relatorios",
    "central_lexos",
    "prompts",
    "configuracoes",
    "usuarios",
    "painel_socios",
  ],
  socio: [
    "dashboard",
    "clientes",
    "processos",
    "parcerias",
    "tarefas",
    "agenda",
    "financeiro",
    "relatorios",
    "central_lexos",
    "prompts",
    "configuracoes",
    "painel_socios",
  ],
  advogado: [
    "dashboard",
    "clientes",
    "processos",
    "parcerias",
    "tarefas",
    "agenda",
    "relatorios",
    "central_lexos",
    "prompts",
    "configuracoes",
  ],
  estagiario: ["dashboard", "clientes", "processos", "tarefas", "agenda", "central_lexos", "configuracoes"],
  financeiro: ["dashboard", "financeiro", "relatorios", "clientes", "central_lexos", "configuracoes"],
  operacional: ["dashboard", "clientes", "processos", "parcerias", "tarefas", "agenda", "central_lexos", "configuracoes"],
  leitura: ["dashboard", "clientes", "processos", "tarefas", "agenda", "relatorios", "central_lexos", "configuracoes"],
};

export const demoWorkspace: LexosWorkspace = {
  id: "workspace-demo-moraes-brito",
  name: "Escritório Demonstração LEX.OS",
  plan: "Intelligence",
  coBranding: "LEX.OS Control + Workspace do Escritório",
  status: "demo",
  createdAt: "2026-05-13T09:00:00.000Z",
};

export const demoUser: LexosUser = {
  id: "user-demo-helena-moraes",
  name: "Dra. Helena Moraes",
  email: "helena.demo@lexos.local",
  role: "Sócia/Gestora",
  firmName: demoWorkspace.name,
  profile: "socio",
  workspaceId: demoWorkspace.id,
};

export const fallbackSession: LexosSession = {
  mode: "fallback",
  user: {
    id: "user-fallback-demonstrativo",
    name: "Usuário da demonstração",
    email: "demo@lexos.local",
    role: "Perfil da demonstração",
    firmName: demoWorkspace.name,
    profile: "socio",
    workspaceId: demoWorkspace.id,
  },
  workspace: demoWorkspace,
  permissions: permissionMap.socio,
  createdAt: demoWorkspace.createdAt,
};

export function createDemoSession(): LexosSession {
  return {
    mode: "demo",
    user: demoUser,
    workspace: demoWorkspace,
    permissions: permissionMap[demoUser.profile],
    createdAt: new Date().toISOString(),
  };
}

function isBrowser() {
  return typeof window !== "undefined";
}

function isLexosSession(value: unknown): value is LexosSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<LexosSession>;
  return Boolean(
    (session.mode === "demo" || session.mode === "supabase") &&
      session.user?.name &&
      session.user?.email &&
      session.workspace?.name &&
      Array.isArray(session.permissions),
  );
}

export function getCurrentSession(): LexosSession | null {
  if (!isBrowser()) return null;

  const rawSession = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const parsedSession = JSON.parse(rawSession) as unknown;
    return isLexosSession(parsedSession) ? parsedSession : null;
  } catch {
    return null;
  }
}

export function getCurrentSessionOrFallback(): LexosSession {
  return getCurrentSession() ?? fallbackSession;
}

export function notifySessionUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
}

export function persistLocalSession(session: LexosSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session));
  notifySessionUpdated();
}

function setDemoAccessCookie(enabled: boolean) {
  if (!isBrowser()) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${DEMO_ACCESS_COOKIE}=${enabled ? DEMO_ACCESS_COOKIE_VALUE : ""}; Path=/; SameSite=Lax${secure}${enabled ? "" : "; Max-Age=0"}`;
}

export function clearLocalSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  setDemoAccessCookie(false);
  notifySessionUpdated();
}

export function clearDemoModeArtifacts() {
  if (!isBrowser()) return;

  setDemoAccessCookie(false);

  for (const key of LEGACY_DEMO_MODE_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }

  const rawSession = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  if (!rawSession) return;

  try {
    const parsed = JSON.parse(rawSession) as { mode?: string };
    if (parsed.mode === "demo" || parsed.mode === "fallback") {
      window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  }
}

export function startDemoSession(): LexosSession {
  const session = createDemoSession();

  if (isBrowser()) {
    setDemoAccessCookie(true);
    persistLocalSession(session);
    setPendingToast("Demonstração iniciada.");
  }

  return session;
}

export function endDemoSession() {
  if (!isBrowser()) return;

  clearLocalSession();
  void createClient()?.auth.signOut();
  setPendingToast("Sessão da demonstração encerrada.");
}

export function hasPermission(
  session: LexosSession | null | undefined,
  permission: LexosPermission,
) {
  return Boolean(session?.permissions.includes(permission));
}

export function profileCan(profile: LexosProfile, permission: LexosPermission) {
  return permissionMap[profile].includes(permission);
}

export function setPendingToast(message: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PENDING_TOAST_STORAGE_KEY, message);
}

export function consumePendingToast() {
  if (!isBrowser()) return null;

  const message = window.localStorage.getItem(PENDING_TOAST_STORAGE_KEY);
  if (message) window.localStorage.removeItem(PENDING_TOAST_STORAGE_KEY);
  return message;
}

function normalizeProfile(role: string | null | undefined): LexosProfile {
  return normalizeWorkspaceRole(role);
}

export async function resolveSupabaseSession(): Promise<LexosSession | null> {
  if (!hasSupabaseBrowserConfig()) return null;

  const supabase = createClient();
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return null;

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: membership, error: membershipError } = await (supabase as any)
    .from("workspace_members")
    .select("workspace_id, role, status, workspaces(id, name, status, created_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const workspaceRecord = Array.isArray(membership?.workspaces)
    ? membership?.workspaces[0]
    : membership?.workspaces;

  if (membershipError || !membership?.workspace_id || !workspaceRecord?.id || workspaceRecord.status !== "active") {
    return null;
  }

  const profileKey = normalizeProfile(membership.role || profile?.role);
  const workspaceName = workspaceRecord.name || "Escritório conectado";

  return {
    mode: "supabase",
    user: {
      id: user.id,
      name: profile?.full_name || user.email || "Usuário do escritório",
      email: profile?.email || user.email || "sem-email@lexos.local",
      role: profile?.role || membership.role || "member",
      firmName: workspaceName,
      profile: profileKey,
      workspaceId: workspaceRecord.id,
    },
    workspace: {
      id: workspaceRecord.id,
      name: workspaceName,
      plan: "Intelligence",
      coBranding: "LEX.OS Control + Workspace real/controlado",
      status: workspaceRecord.status === "inactive" ? "inactive" : "active",
      createdAt: workspaceRecord.created_at || new Date().toISOString(),
    },
    permissions: permissionMap[profileKey] ?? permissionMap.leitura,
    createdAt: new Date().toISOString(),
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthLoginResult> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail || !password) {
    return {
      ok: false,
      message: "Informe e-mail e senha para preparar o acesso real.",
      mode: "demo",
    };
  }

  if (!hasSupabaseBrowserConfig()) {
    return {
      ok: false,
      message:
        "Autenticação conectada ainda não está configurada. Use a demonstração local controlada.",
      mode: "supabase_unavailable",
    };
  }

  try {
    const supabase = createClient();
    if (!supabase) {
      return {
        ok: false,
        message: "Ambiente conectado não configurado. Use a demonstração local.",
        mode: "supabase_unavailable",
      };
    }

    clearDemoModeArtifacts();

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return { ok: false, message: error.message, mode: "supabase_error" };
    }

    const session = await resolveSupabaseSession();
    if (!session) {
      await supabase.auth.signOut();
      clearLocalSession();
      return {
        ok: false,
        message: "Acesso conectado indisponível: usuário sem workspace ativo. Contate a administração.",
        mode: "supabase_error",
      };
    }
    clearDemoModeArtifacts();
    persistLocalSession(session);
    setPendingToast("Acesso conectado concluído. Dados da demonstração permanecem separados.");
    return { ok: true, session };
  } catch {
    return {
      ok: false,
      message:
        "Não foi possível concluir o login real agora. A demonstração local segue disponível.",
      mode: "supabase_error",
    };
  }
}

export const authStorageKeys = {
  demoSession: DEMO_SESSION_STORAGE_KEY,
  pendingToast: PENDING_TOAST_STORAGE_KEY,
  sessionUpdated: SESSION_UPDATED_EVENT,
} as const;
