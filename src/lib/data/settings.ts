import {
  demoWorkspace,
  getCurrentSessionOrFallback,
  persistLocalSession,
  resolveSupabaseSession,
} from "@/lib/auth";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logSettingsActivity, logMemberActivity } from "@/lib/data/activityLogs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";

export const operationalIdentityOptions = [
  "Consultivo executivo",
  "Contencioso estratégico",
  "Escritório full service",
  "Operação jurídica interna",
  "Boutique especializada",
  "Atendimento de massa controlado",
] as const;

export const visualPreferenceOptions = [
  "Navy premium",
  "Claro institucional",
  "Alto contraste",
  "Minimalista executivo",
] as const;

export const LEXOS_VISUAL_PREFERENCE_EVENT = "lexos:visual-preference-updated";

export type OperationalIdentityOption = (typeof operationalIdentityOptions)[number];
export type VisualPreferenceOption = (typeof visualPreferenceOptions)[number];

export type WorkspaceSettingsForm = {
  firmName: string;
  plan: string;
  coBranding: string;
  signature: string;
  operationalIdentity: OperationalIdentityOption;
  visualPreference: VisualPreferenceOption;
  status: string;
};

export type ProfileSettingsForm = {
  fullName: string;
  email: string;
  role: string;
  phone: string;
  position: string;
  department: string;
  membershipRole: string;
  membershipStatus: string;
};

export type SettingsMode = "demo" | "supabase";

export type SettingsLoadState = {
  mode: SettingsMode;
  workspaceId: string | null;
  userId: string | null;
  userEmail: string | null;
  workspace: WorkspaceSettingsForm;
  profile: ProfileSettingsForm;
  message?: string;
  error?: string;
};

type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MembershipRow = Database["public"]["Tables"]["workspace_members"]["Row"];

const DEMO_SETTINGS_STORAGE_KEY = "lexos.control.demo.settings";

export const defaultWorkspaceSettings: WorkspaceSettingsForm = {
  firmName: demoWorkspace.name,
  plan: demoWorkspace.plan,
  coBranding: demoWorkspace.coBranding,
  signature: "Equipe LEX.OS Control",
  operationalIdentity: "Consultivo executivo",
  visualPreference: "Navy premium",
  status: demoWorkspace.status,
};

export const defaultProfileSettings: ProfileSettingsForm = {
  fullName: getCurrentSessionOrFallback().user.name,
  email: getCurrentSessionOrFallback().user.email,
  role: getCurrentSessionOrFallback().user.role,
  phone: "",
  position: "",
  department: "",
  membershipRole: getCurrentSessionOrFallback().user.profile,
  membershipStatus: getCurrentSessionOrFallback().workspace.status,
};

function normalizeOperationalIdentity(value: unknown): OperationalIdentityOption {
  if (operationalIdentityOptions.includes(value as OperationalIdentityOption)) return value as OperationalIdentityOption;
  if (value === "Contencioso organizado") return "Contencioso estratégico";
  if (value === "Full service premium") return "Escritório full service";
  return defaultWorkspaceSettings.operationalIdentity;
}

function normalizeVisualPreference(value: unknown): VisualPreferenceOption {
  if (visualPreferenceOptions.includes(value as VisualPreferenceOption)) return value as VisualPreferenceOption;
  if (value === "Gold highlights") return "Navy premium";
  if (value === "Silver contrast") return "Alto contraste";
  return defaultWorkspaceSettings.visualPreference;
}

function normalizeWorkspaceSettings(workspace: WorkspaceSettingsForm): WorkspaceSettingsForm {
  return {
    ...workspace,
    operationalIdentity: normalizeOperationalIdentity(workspace.operationalIdentity),
    visualPreference: normalizeVisualPreference(workspace.visualPreference),
  };
}

export function getVisualPreferenceTheme(value: unknown) {
  const preference = normalizeVisualPreference(value);
  if (preference === "Claro institucional") return "claro-institucional";
  if (preference === "Alto contraste") return "alto-contraste";
  if (preference === "Minimalista executivo") return "minimalista-executivo";
  return "navy-premium";
}

export function applyLexosVisualPreference(value: unknown) {
  if (!isBrowser()) return;
  document.documentElement.dataset.lexosTheme = getVisualPreferenceTheme(value);
}

export function broadcastLexosVisualPreference(value: unknown) {
  if (!isBrowser()) return;
  const preference = normalizeVisualPreference(value);
  applyLexosVisualPreference(preference);
  window.dispatchEvent(new CustomEvent(LEXOS_VISUAL_PREFERENCE_EVENT, { detail: { preference } }));
}

function isBrowser() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function parseDemoSettings(raw: string | null): Pick<SettingsLoadState, "workspace" | "profile"> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Pick<SettingsLoadState, "workspace" | "profile">>;
    if (!parsed.workspace || !parsed.profile) return null;

    return {
      workspace: normalizeWorkspaceSettings({ ...defaultWorkspaceSettings, ...parsed.workspace }),
      profile: { ...defaultProfileSettings, ...parsed.profile },
    };
  } catch {
    return null;
  }
}

export function getDemoSettings(): SettingsLoadState {
  const currentSession = getCurrentSessionOrFallback();
  const stored = isBrowser()
    ? parseDemoSettings(window.localStorage.getItem(DEMO_SETTINGS_STORAGE_KEY))
    : null;
  const workspace = normalizeWorkspaceSettings(stored?.workspace ?? {
    ...defaultWorkspaceSettings,
    firmName: currentSession.workspace.name,
    plan: currentSession.workspace.plan,
    coBranding: currentSession.workspace.coBranding,
    status: currentSession.workspace.status,
  });
  const profile = stored?.profile ?? {
    ...defaultProfileSettings,
    fullName: currentSession.user.name,
    email: currentSession.user.email,
    role: currentSession.user.role,
    membershipRole: currentSession.user.profile,
    membershipStatus: currentSession.workspace.status,
  };

  return {
    mode: "demo",
    workspaceId: currentSession.workspace.id,
    userId: currentSession.user.id,
    userEmail: currentSession.user.email,
    workspace,
    profile,
  };
}

export function saveDemoSettings(workspace: WorkspaceSettingsForm, profile: ProfileSettingsForm) {
  if (!isBrowser()) return getDemoSettings();

  const normalizedWorkspace = normalizeWorkspaceSettings(workspace);
  broadcastLexosVisualPreference(normalizedWorkspace.visualPreference);
  window.localStorage.setItem(DEMO_SETTINGS_STORAGE_KEY, JSON.stringify({ workspace: normalizedWorkspace, profile }));

  const currentSession = getCurrentSessionOrFallback();
  persistLocalSession({
    ...currentSession,
    user: {
      ...currentSession.user,
      name: profile.fullName,
      email: profile.email,
      role: profile.role,
      firmName: normalizedWorkspace.firmName,
    },
    workspace: {
      ...currentSession.workspace,
      name: normalizedWorkspace.firmName,
      plan: normalizedWorkspace.plan,
      coBranding: normalizedWorkspace.coBranding,
      status: normalizedWorkspace.status === "inactive" ? "inactive" : currentSession.mode === "demo" ? "demo" : "active",
    },
    createdAt: currentSession.createdAt || nowIso(),
  });

  return getDemoSettings();
}

const WORKSPACE_METADATA_KEY = "lexos_workspace_settings";

function isRecord(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickOperationalIdentity(value: unknown): OperationalIdentityOption | undefined {
  if (value == null) return undefined;
  return normalizeOperationalIdentity(value);
}

function pickVisualPreference(value: unknown): VisualPreferenceOption | undefined {
  if (value == null) return undefined;
  return normalizeVisualPreference(value);
}

function getWorkspaceMetadata(profile: ProfileRow | null): Partial<WorkspaceSettingsForm> {
  const metadata = isRecord(profile?.metadata) ? profile?.metadata : null;
  const rawSettings = isRecord(metadata?.[WORKSPACE_METADATA_KEY]) ? metadata?.[WORKSPACE_METADATA_KEY] as Record<string, Json> : {};

  return {
    plan: typeof rawSettings.plan === "string" ? rawSettings.plan : undefined,
    coBranding: typeof rawSettings.coBranding === "string" ? rawSettings.coBranding : undefined,
    signature: typeof rawSettings.signature === "string" ? rawSettings.signature : undefined,
    operationalIdentity: pickOperationalIdentity(rawSettings.operationalIdentity),
    visualPreference: pickVisualPreference(rawSettings.visualPreference),
  };
}

function buildWorkspaceMetadata(existingMetadata: Json | undefined, workspace: WorkspaceSettingsForm): Json {
  const base = isRecord(existingMetadata) ? existingMetadata : {};
  const normalizedWorkspace = normalizeWorkspaceSettings(workspace);
  return {
    ...base,
    [WORKSPACE_METADATA_KEY]: {
      ...(isRecord(base[WORKSPACE_METADATA_KEY]) ? base[WORKSPACE_METADATA_KEY] as Record<string, Json> : {}),
      plan: normalizedWorkspace.plan,
      coBranding: normalizedWorkspace.coBranding,
      signature: normalizedWorkspace.signature,
      operationalIdentity: normalizedWorkspace.operationalIdentity,
      visualPreference: normalizedWorkspace.visualPreference,
    },
  };
}

function mapSupabaseWorkspace(row: WorkspaceRow, profile: ProfileRow | null): WorkspaceSettingsForm {
  const workspaceMetadata = getWorkspaceMetadata(profile);
  return {
    ...defaultWorkspaceSettings,
    ...workspaceMetadata,
    firmName: row.name || defaultWorkspaceSettings.firmName,
    plan: workspaceMetadata.plan || "Intelligence",
    coBranding: workspaceMetadata.coBranding || "LEX.OS Control + escritório conectado",
    status: row.status || "active",
  };
}

function mapSupabaseProfile(
  userEmail: string | null | undefined,
  profile: ProfileRow | null,
  membership: MembershipRow,
): ProfileSettingsForm {
  return {
    fullName: profile?.full_name || userEmail || "Usuário do escritório",
    email: profile?.email || userEmail || "sem-email@lexos.local",
    role: profile?.role || membership.role || "member",
    phone: profile?.phone || "",
    position: profile?.position || membership.position || "",
    department: profile?.department || membership.department || "",
    membershipRole: membership.role,
    membershipStatus: membership.status,
  };
}

export async function loadSettings(): Promise<SettingsLoadState> {
  if (!shouldUseWorkspaceSupabase()) return getDemoSettings();

  const supabase = createSupabaseClient();
  if (!supabase) return getDemoSettings();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const authUser = userData.user;

    if (userError || !authUser) {
      return {
        ...getDemoSettings(),
        message: "Sessão conectada não encontrada. Usando demonstração local.",
      };
    }

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, status, position, department, created_at, updated_at")
      .eq("user_id", authUser.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      warnSupabaseOperationalError("settings.membership", membershipError);
      return {
        ...getDemoSettings(),
        mode: "supabase",
        userId: authUser.id,
        userEmail: authUser.email ?? null,
        error: "Não foi possível ler o vínculo do escritório. Verifique o controle de acesso por usuário.",
      };
    }

    if (!membership) {
      return {
        ...getDemoSettings(),
        mode: "supabase",
        workspaceId: null,
        userId: authUser.id,
        userEmail: authUser.email ?? null,
        message: "Nenhum escritório encontrado para este usuário. Verifique o vínculo de acesso.",
      };
    }

    const [{ data: workspace, error: workspaceError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("workspaces")
        .select("id, name, slug, status, created_at, updated_at")
        .eq("id", membership.workspace_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, position, department, avatar_url, metadata, created_at, updated_at")
        .eq("id", authUser.id)
        .maybeSingle(),
    ]);

    if (workspaceError) {
      warnSupabaseOperationalError("settings.workspace", workspaceError);
      return {
        ...getDemoSettings(),
        mode: "supabase",
        workspaceId: membership.workspace_id,
        userId: authUser.id,
        userEmail: authUser.email ?? null,
        error: "Não foi possível carregar o escritório conectado. Verifique o controle de acesso.",
      };
    }

    if (!workspace) {
      return {
        ...getDemoSettings(),
        mode: "supabase",
        workspaceId: membership.workspace_id,
        userId: authUser.id,
        userEmail: authUser.email ?? null,
        message: "Nenhum escritório encontrado para este usuário. Verifique o vínculo de acesso.",
      };
    }

    if (profileError) {
      warnSupabaseOperationalError("settings.profile", profileError);
    }

    return {
      mode: "supabase",
      workspaceId: workspace.id,
      userId: authUser.id,
      userEmail: authUser.email ?? null,
      workspace: mapSupabaseWorkspace(workspace, profile ?? null),
      profile: mapSupabaseProfile(authUser.email, profile ?? null, membership),
      error: profileError
        ? "Perfil real não pôde ser carregado; os dados do Auth foram usados como fallback seguro."
        : undefined,
    };
  } catch (error) {
    warnSupabaseOperationalError("settings.load", error);
    return {
      ...getDemoSettings(),
      error: "Não foi possível carregar configurações reais agora. A demonstração local permanece disponível.",
    };
  }
}

export async function saveSupabaseSettings(
  workspaceId: string,
  userId: string,
  workspace: WorkspaceSettingsForm,
  profile: ProfileSettingsForm,
) {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Ambiente conectado não configurado neste navegador.");

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .update({
      name: workspace.firmName.trim() || defaultWorkspaceSettings.firmName,
      status: workspace.status.trim() || "active",
    })
    .eq("id", workspaceId);

  if (workspaceError) throw workspaceError;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("metadata")
    .eq("id", userId)
    .maybeSingle();

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      full_name: profile.fullName.trim() || null,
      email: profile.email.trim() || null,
      phone: profile.phone.trim() || null,
      position: profile.position.trim() || null,
      department: profile.department.trim() || null,
      metadata: buildWorkspaceMetadata(existingProfile?.metadata, workspace),
    });

  if (profileError) throw profileError;

  broadcastLexosVisualPreference(workspace.visualPreference);
  await logSettingsActivity({ workspaceId, action: "workspace_settings_updated", entityId: workspaceId, title: workspace.firmName, description: "Configurações do escritório atualizadas." });
  await logMemberActivity({ workspaceId, action: "profile_updated", entityId: userId, title: profile.fullName, description: "Perfil do usuário atualizado em Configurações." });

  const refreshed = await resolveSupabaseSession();
  if (refreshed) persistLocalSession(refreshed);

  return loadSettings();
}
