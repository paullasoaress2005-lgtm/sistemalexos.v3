import { resolveSupabaseSession, persistLocalSession } from "@/lib/auth";
import { canManageMembers, normalizeWorkspaceRole, type WorkspaceRole } from "@/lib/permissions";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import { logMemberActivity } from "@/lib/data/activityLogs";

export type WorkspaceMemberStatus = "active" | "inactive" | "pending" | string;

export type WorkspaceMemberProfile = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone: string;
  position: string;
  department: string;
  avatarUrl: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  displayName: string;
  position: string;
  department: string;
  permissions: Json;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deactivatedAt: string | null;
  profile: WorkspaceMemberProfile | null;
};

export type WorkspaceMembersState = {
  mode: "demo" | "supabase";
  workspaceId: string | null;
  currentUserId: string | null;
  currentUserRole: WorkspaceRole;
  canManage: boolean;
  members: WorkspaceMember[];
  message?: string;
  error?: string;
};

export type MemberUpdateInput = {
  memberId: string;
  workspaceId: string;
  currentUserRole: string;
  role?: WorkspaceRole;
  status?: WorkspaceMemberStatus;
  displayName?: string;
  position?: string;
  department?: string;
};

export type CurrentProfileUpdateInput = {
  userId: string;
  fullName: string;
  position: string;
  department: string;
  phone: string;
};

function normalizeStatus(status: string | null | undefined): WorkspaceMemberStatus {
  return status || "active";
}

function mapProfile(row: any): WorkspaceMemberProfile {
  return {
    id: row.id,
    fullName: row.full_name || row.email || "Usuário do workspace",
    email: row.email || "sem-email@lexos.local",
    role: row.role || "",
    phone: row.phone || "",
    position: row.position || "",
    department: row.department || "",
    avatarUrl: row.avatar_url || "",
  };
}

function mapMember(row: any, profilesById: Map<string, WorkspaceMemberProfile>): WorkspaceMember {
  const profile = profilesById.get(row.user_id) ?? null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: normalizeWorkspaceRole(row.role),
    status: normalizeStatus(row.status),
    displayName: row.display_name || profile?.fullName || "Usuário do workspace",
    position: row.position || profile?.position || "",
    department: row.department || profile?.department || "",
    permissions: row.permissions || {},
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    deactivatedAt: row.deactivated_at || null,
    profile,
  };
}

async function writeActivityLog(workspaceId: string, action: string, entityId: string, description: string) {
  await logMemberActivity({ workspaceId, action, entityId, description });
}

export async function loadWorkspaceMembers(): Promise<WorkspaceMembersState> {
  const session = await resolveSupabaseSession();

  if (!shouldUseWorkspaceSupabase() || session?.mode !== "supabase" || !session.user.workspaceId) {
    return {
      mode: "demo",
      workspaceId: null,
      currentUserId: session?.user.id ?? null,
      currentUserRole: "socio",
      canManage: true,
      members: [],
      message: "Modo demonstração ativo: usuários reais do Supabase ficam separados.",
    };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      mode: "demo",
      workspaceId: null,
      currentUserId: null,
      currentUserRole: "leitura",
      canManage: false,
      members: [],
      error: "Supabase não configurado neste ambiente.",
    };
  }

  const currentUserRole = normalizeWorkspaceRole(session.user.profile);

  try {
    const { data: members, error: membersError } = await supabase
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, status, display_name, position, department, permissions, last_seen_at, deactivated_at, created_at, updated_at")
      .eq("workspace_id", session.user.workspaceId)
      .order("created_at", { ascending: true });

    if (membersError) throw membersError;

    const userIds = Array.from(new Set((members ?? []).map((member: any) => member.user_id).filter(Boolean)));
    const profilesById = new Map<string, WorkspaceMemberProfile>();

    if (userIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, position, department, avatar_url")
        .in("id", userIds);

      if (profilesError) throw profilesError;
      (profiles ?? []).forEach((profile: any) => profilesById.set(profile.id, mapProfile(profile)));
    }

    return {
      mode: "supabase",
      workspaceId: session.user.workspaceId,
      currentUserId: session.user.id,
      currentUserRole,
      canManage: canManageMembers(currentUserRole),
      members: (members ?? []).map((member: any) => mapMember(member, profilesById)),
    };
  } catch (error) {
    warnSupabaseOperationalError("users.load", error);
    return {
      mode: "supabase",
      workspaceId: session.user.workspaceId,
      currentUserId: session.user.id,
      currentUserRole,
      canManage: canManageMembers(currentUserRole),
      members: [],
      error: "Não foi possível carregar membros reais. Aplique a migração da Etapa 3L e confira as políticas RLS.",
    };
  }
}

export async function updateWorkspaceMember(input: MemberUpdateInput) {
  const currentRole = normalizeWorkspaceRole(input.currentUserRole);
  if (!canManageMembers(currentRole)) {
    throw new Error("Seu papel atual permite visualizar, mas não gerenciar membros neste workspace.");
  }

  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado neste ambiente.");

  const payload: Record<string, unknown> = {};
  if (input.role) payload.role = input.role;
  if (input.status) {
    payload.status = input.status;
    payload.deactivated_at = input.status === "inactive" ? new Date().toISOString() : null;
  }
  if (typeof input.displayName === "string") payload.display_name = input.displayName.trim() || null;
  if (typeof input.position === "string") payload.position = input.position.trim() || null;
  if (typeof input.department === "string") payload.department = input.department.trim() || null;

  const { error } = await supabase
    .from("workspace_members")
    .update(payload)
    .eq("id", input.memberId)
    .eq("workspace_id", input.workspaceId);

  if (error) throw error;

  const action = input.status ? "member_status_updated" : input.role ? "member_role_updated" : "member_status_updated";
  await writeActivityLog(input.workspaceId, action, input.memberId, "Membro atualizado em Usuários e permissões.");

  const refreshed = await resolveSupabaseSession();
  if (refreshed) persistLocalSession(refreshed);
}

export async function updateCurrentProfile(input: CurrentProfileUpdateInput) {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado neste ambiente.");

  const { error } = await supabase.from("profiles").upsert({
    id: input.userId,
    full_name: input.fullName.trim() || null,
    position: input.position.trim() || null,
    department: input.department.trim() || null,
    phone: input.phone.trim() || null,
  });

  if (error) throw error;

  const session = await resolveSupabaseSession();
  if (session?.user.workspaceId) {
    await writeActivityLog(session.user.workspaceId, "profile_updated", input.userId, "Perfil do usuário atualizado.");
    persistLocalSession(session);
  }
}
