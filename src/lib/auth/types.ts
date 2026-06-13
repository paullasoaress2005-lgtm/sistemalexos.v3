import type { WorkspaceModule, WorkspaceRole } from "@/lib/permissions";

export type LexosProfile = WorkspaceRole;

export type LexosPermission =
  | "dashboard"
  | "clientes"
  | "processos"
  | "tarefas"
  | "agenda"
  | "financeiro"
  | "relatorios"
  | "central_lexos"
  | "configuracoes"
  | "painel_socios"
  | "parcerias"
  | "prompts"
  | "usuarios";

export type LexosWorkspaceModule = WorkspaceModule;

export type LexosWorkspaceStatus = "demo" | "active" | "inactive";

export type LexosWorkspace = {
  id: string;
  name: string;
  plan: "Intelligence" | string;
  coBranding: string;
  status: LexosWorkspaceStatus;
  createdAt: string;
};

export type LexosUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  firmName: string;
  profile: LexosProfile;
  workspaceId: string;
};

export type LexosSessionMode = "demo" | "supabase" | "fallback";

export type LexosSession = {
  mode: LexosSessionMode;
  user: LexosUser;
  workspace: LexosWorkspace;
  permissions: LexosPermission[];
  createdAt: string;
};

export type AuthLoginResult =
  | { ok: true; session: LexosSession }
  | { ok: false; message: string; mode: "demo" | "supabase_unavailable" | "supabase_error" };
