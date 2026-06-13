export const workspaceRoles = [
  "owner",
  "admin",
  "socio",
  "advogado",
  "estagiario",
  "financeiro",
  "operacional",
  "leitura",
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceModules = [
  "dashboard",
  "socios",
  "clientes",
  "processos",
  "parcerias",
  "tarefas",
  "agenda",
  "financeiro",
  "relatorios",
  "central",
  "prompts",
  "configuracoes",
  "usuarios",
] as const;

export type WorkspaceModule = (typeof workspaceModules)[number];

export type RolePermissions = {
  modules: WorkspaceModule[];
  manageMembers: boolean;
  viewPartnersDashboard: boolean;
  viewFinance: boolean;
  editFinance: boolean;
  managePrompts: boolean;
  generateReports: boolean;
  editWorkspaceSettings: boolean;
};

const allModules = [...workspaceModules];

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  socio: "Sócio",
  advogado: "Advogado",
  estagiario: "Estagiário",
  financeiro: "Financeiro",
  operacional: "Operacional",
  leitura: "Leitura",
};

export const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: "Acesso total, gestão de membros, áreas estratégicas e configurações avançadas.",
  admin: "Acesso amplo à operação e gestão de membros, com configurações não sensíveis.",
  socio: "Visão estratégica, Painel dos Sócios, financeiro e relatórios estratégicos.",
  advogado: "Operação jurídica: clientes, processos, tarefas, agenda, relatórios operacionais e Central.",
  estagiario: "Acesso operacional limitado a clientes, processos, tarefas e agenda.",
  financeiro: "Financeiro, clientes e relatórios financeiros, sem Painel dos Sócios por padrão.",
  operacional: "Tarefas, agenda, clientes, processos e Central, sem áreas sensíveis.",
  leitura: "Acesso de leitura quando possível, sem edição operacional sensível.",
};

export function normalizeWorkspaceRole(role: string | null | undefined): WorkspaceRole {
  const normalized = (role || "leitura")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized === "socios" || normalized === "socia" || normalized === "socio") return "socio";
  if (normalized === "estagiario" || normalized === "estagiaria") return "estagiario";
  if (normalized === "atendimento" || normalized === "operacao" || normalized === "operacional") return "operacional";
  if (normalized === "member" || normalized === "membro") return "advogado";
  if (workspaceRoles.includes(normalized as WorkspaceRole)) return normalized as WorkspaceRole;
  return "leitura";
}

const rolePermissionMatrix: Record<WorkspaceRole, RolePermissions> = {
  owner: {
    modules: allModules,
    manageMembers: true,
    viewPartnersDashboard: true,
    viewFinance: true,
    editFinance: true,
    managePrompts: true,
    generateReports: true,
    editWorkspaceSettings: true,
  },
  admin: {
    modules: allModules,
    manageMembers: true,
    viewPartnersDashboard: true,
    viewFinance: true,
    editFinance: true,
    managePrompts: true,
    generateReports: true,
    editWorkspaceSettings: true,
  },
  socio: {
    modules: allModules.filter((module) => module !== "usuarios"),
    manageMembers: false,
    viewPartnersDashboard: true,
    viewFinance: true,
    editFinance: true,
    managePrompts: true,
    generateReports: true,
    editWorkspaceSettings: false,
  },
  advogado: {
    modules: ["dashboard", "clientes", "processos", "parcerias", "tarefas", "agenda", "central", "prompts", "configuracoes"],
    manageMembers: false,
    viewPartnersDashboard: false,
    viewFinance: false,
    editFinance: false,
    managePrompts: false,
    generateReports: false,
    editWorkspaceSettings: false,
  },
  estagiario: {
    modules: ["dashboard", "clientes", "processos", "tarefas", "agenda", "central", "configuracoes"],
    manageMembers: false,
    viewPartnersDashboard: false,
    viewFinance: false,
    editFinance: false,
    managePrompts: false,
    generateReports: false,
    editWorkspaceSettings: false,
  },
  financeiro: {
    modules: ["dashboard", "clientes", "financeiro", "central", "configuracoes"],
    manageMembers: false,
    viewPartnersDashboard: false,
    viewFinance: true,
    editFinance: true,
    managePrompts: false,
    generateReports: false,
    editWorkspaceSettings: false,
  },
  operacional: {
    modules: ["dashboard", "clientes", "processos", "parcerias", "tarefas", "agenda", "central", "configuracoes"],
    manageMembers: false,
    viewPartnersDashboard: false,
    viewFinance: false,
    editFinance: false,
    managePrompts: false,
    generateReports: false,
    editWorkspaceSettings: false,
  },
  leitura: {
    modules: ["dashboard", "clientes", "processos", "tarefas", "agenda", "central", "configuracoes"],
    manageMembers: false,
    viewPartnersDashboard: false,
    viewFinance: false,
    editFinance: false,
    managePrompts: false,
    generateReports: false,
    editWorkspaceSettings: false,
  },
};

export function getRolePermissions(role: string | null | undefined): RolePermissions {
  return rolePermissionMatrix[normalizeWorkspaceRole(role)];
}

export function canAccessModule(role: string | null | undefined, module: WorkspaceModule) {
  return getRolePermissions(role).modules.includes(module);
}

export function canManageMembers(role: string | null | undefined) {
  return getRolePermissions(role).manageMembers;
}

export function canViewPartnersDashboard(role: string | null | undefined) {
  return getRolePermissions(role).viewPartnersDashboard;
}

export function canViewFinance(role: string | null | undefined) {
  return getRolePermissions(role).viewFinance;
}

export function canEditFinance(role: string | null | undefined) {
  return getRolePermissions(role).editFinance;
}

export function canManagePrompts(role: string | null | undefined) {
  return getRolePermissions(role).managePrompts;
}

export function canGenerateReports(role: string | null | undefined) {
  return getRolePermissions(role).generateReports;
}

export function canEditWorkspaceSettings(role: string | null | undefined) {
  return getRolePermissions(role).editWorkspaceSettings;
}
