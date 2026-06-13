"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { SectionCard, StatusBadge } from "@/components/ui";
import { getDataSourceStatus } from "@/lib/data/source";
import {
  defaultProfileSettings,
  defaultWorkspaceSettings,
  broadcastLexosVisualPreference,
  loadSettings,
  operationalIdentityOptions,
  saveDemoSettings,
  saveSupabaseSettings,
  visualPreferenceOptions,
  type ProfileSettingsForm,
  type SettingsLoadState,
  type WorkspaceSettingsForm,
} from "@/lib/data/settings";
import {
  loadWorkspaceMembers,
  updateCurrentProfile,
  updateWorkspaceMember,
  type WorkspaceMember,
  type WorkspaceMembersState,
} from "@/lib/data/users";
import {
  canEditWorkspaceSettings,
  getRolePermissions,
  normalizeWorkspaceRole,
  roleDescriptions,
  roleLabels,
  workspaceRoles,
  type WorkspaceModule,
  type WorkspaceRole,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { clearDemoSeed, generateDemoSeed } from "@/lib/data/demoSeed";

type ActiveSection = "workspace" | "perfil" | "usuarios" | "seguranca" | "operacionais";
type WorkspaceForm = WorkspaceSettingsForm;
type ProfileForm = ProfileSettingsForm;

type OperationalPreferences = {
  criticalDeadline: string;
  upcomingDeadline: string;
  defaultOwner: string;
  reportTemplate: string;
  visualPriority: string;
  archiveRule: string;
  showDemoDataByDefault: string;
  sensitiveActionConfirmation: string;
};

type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  position: string;
  department: string;
};

const initialWorkspace: WorkspaceForm = defaultWorkspaceSettings;
const initialProfile: ProfileForm = defaultProfileSettings;

const defaultOperationalPreferences: OperationalPreferences = {
  criticalDeadline: "48 horas antes do vencimento",
  upcomingDeadline: "7 dias corridos antes do vencimento",
  defaultOwner: "Responsável padrão do escritório",
  reportTemplate: "Relatório executivo com revisão humana",
  visualPriority: "Alta prioridade destacada em dourado/ciano",
  archiveRule: "Arquivar após encerramento validado",
  showDemoDataByDefault: "Sim",
  sensitiveActionConfirmation: "Ativa",
};

const demoUsers: DemoUser[] = [
  { id: "helena-moraes", name: "Dra. Helena Moraes", email: "helena.demo@lexos.local", role: "socio", status: "ativo", position: "Sócia gestora", department: "Estratégia" },
  { id: "rafael-brito", name: "Dr. Rafael Brito", email: "rafael.demo@lexos.local", role: "advogado", status: "ativo", position: "Advogado", department: "Contencioso" },
  { id: "carla-nogueira", name: "Carla Nogueira", email: "carla.demo@lexos.local", role: "financeiro", status: "ativo", position: "Financeiro", department: "Administrativo" },
  { id: "livia-ramos", name: "Lívia Ramos", email: "livia.demo@lexos.local", role: "operacional", status: "ativo", position: "Operação", department: "Atendimento" },
];

const moduleLabels: Record<WorkspaceModule, string> = {
  dashboard: "Dashboard",
  socios: "Painel dos Sócios",
  clientes: "Clientes",
  processos: "Processos",
  parcerias: "Parcerias",
  tarefas: "Tarefas",
  agenda: "Agenda",
  financeiro: "Financeiro",
  relatorios: "Relatórios",
  central: "Central LEX.OS",
  prompts: "Prompts",
  configuracoes: "Configurações",
  usuarios: "Usuários",
};

const roleGovernanceCards: Array<{ role: WorkspaceRole; access: string; canView: string; cannotExecute: string }> = [
  { role: "socio", access: "Executivo", canView: "Financeiro, relatórios, configurações e visão consolidada do escritório.", cannotExecute: "Não envia saídas externas automáticas sem revisão humana." },
  { role: "advogado", access: "Operacional jurídico", canView: "Clientes, processos, tarefas, agenda e relatórios operacionais.", cannotExecute: "Não altera governança, plano, auditoria ou permissões estruturais." },
  { role: "financeiro", access: "Financeiro controlado", canView: "Financeiro, cobranças, relatórios de caixa e indicadores administrativos.", cannotExecute: "Não modifica processos, prompts, papéis de equipe ou identidade do workspace." },
  { role: "operacional", access: "Execução assistida", canView: "Tarefas, agenda e acompanhamento operacional do escritório.", cannotExecute: "Não acessa gestão financeira completa, configurações ou permissões." },
];

const securityCards = [
  { title: "Revisão humana obrigatória", text: "Toda saída relevante permanece revisável antes de uso externo." },
  { title: "Sem envio automático externo", text: "Esta rodada não dispara e-mails, petições, integrações ou comunicações externas." },
  { title: "Dados demo/local", text: "Demonstrações usam dados fictícios ou salvos localmente no navegador." },
  { title: "Logs/auditoria operacional", text: "Eventos sensíveis são organizados para rastreabilidade e prestação de contas." },
  { title: "Controle de permissões", text: "Papéis delimitam leitura, edição e acesso a módulos críticos." },
  { title: "Uso responsável da IA", text: "Apoio consultivo com validação jurídica e proibição de automação cega." },
];

const GOVERNANCE_STORAGE_KEY = "lexos.control.operational.preferences";

function formatDateTime(value: string | null) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getFriendlySaveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("rls")) {
    return "Não foi possível salvar por controle de acesso do escritório. Verifique seu vínculo e tente novamente.";
  }
  if (message) return `Não foi possível salvar: ${message}`;
  return "Não foi possível salvar agora.";
}

function loadOperationalPreferences() {
  if (typeof window === "undefined") return defaultOperationalPreferences;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GOVERNANCE_STORAGE_KEY) || "null") as Partial<OperationalPreferences> | null;
    return { ...defaultOperationalPreferences, ...(parsed ?? {}) };
  } catch {
    return defaultOperationalPreferences;
  }
}

export default function ConfiguracoesPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("workspace");
  const dataSourceStatus = getDataSourceStatus();
  const [settingsState, setSettingsState] = useState<SettingsLoadState | null>(null);
  const [membersState, setMembersState] = useState<WorkspaceMembersState | null>(null);
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceForm>(initialWorkspace);
  const [profileForm, setProfileForm] = useState<ProfileForm>(initialProfile);
  const [operationalPreferences, setOperationalPreferences] = useState<OperationalPreferences>(defaultOperationalPreferences);
  const [expandedUser, setExpandedUser] = useState<string>(demoUsers[0].id);
  const [toast, setToast] = useState<string | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [isClearingDemo, setIsClearingDemo] = useState(false);

  const isSupabaseMode = settingsState?.mode === "supabase";
  const currentRole = normalizeWorkspaceRole(membersState?.currentUserRole || profileForm.membershipRole || profileForm.role);
  const canEditWorkspace = !isSupabaseMode || canEditWorkspaceSettings(currentRole);
  const canManageMembers = Boolean(membersState?.canManage);
  const realMembers = membersState?.members ?? [];

  async function hydrateSettings() {
    setIsLoadingSettings(true);
    const [loadedSettings, loadedMembers] = await Promise.all([loadSettings(), loadWorkspaceMembers()]);
    setSettingsState(loadedSettings);
    setWorkspaceForm(loadedSettings.workspace);
    setProfileForm(loadedSettings.profile);
    setMembersState(loadedMembers);
    setExpandedUser(loadedMembers.members[0]?.id || loadedSettings.userId || demoUsers[0].id);
    setOperationalPreferences(loadOperationalPreferences());
    if (loadedSettings.message) setToast(loadedSettings.message);
    if (loadedSettings.error) setToast(loadedSettings.error);
    if (loadedMembers.message) setToast(loadedMembers.message);
    if (loadedMembers.error) setToast(loadedMembers.error);
    setIsLoadingSettings(false);
  }

  useEffect(() => {
    let active = true;
    async function run() {
      await hydrateSettings();
      if (!active) return;
    }
    run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function updateWorkspaceField<Field extends keyof WorkspaceForm>(field: Field, value: WorkspaceForm[Field]) {
    setWorkspaceForm((current) => ({ ...current, [field]: value }));
  }

  function updateProfileField<Field extends keyof ProfileForm>(field: Field, value: ProfileForm[Field]) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function updateOperationalPreference<Field extends keyof OperationalPreferences>(field: Field, value: OperationalPreferences[Field]) {
    setOperationalPreferences((current) => ({ ...current, [field]: value }));
  }

  function updateVisualPreference(value: WorkspaceForm["visualPreference"]) {
    updateWorkspaceField("visualPreference", value);
    broadcastLexosVisualPreference(value);
  }

  function updateMemberDraft(memberId: string, patch: Partial<WorkspaceMember>) {
    setMembersState((current) => {
      if (!current) return current;
      return {
        ...current,
        members: current.members.map((member) => (member.id === memberId ? { ...member, ...patch } : member)),
      };
    });
  }

  async function handleGenerateDemoSeed() {
    if (!isSupabaseMode) {
      setToast("Modo local: dados fictícios já permanecem separados no navegador; nenhum banco real foi alterado.");
      return;
    }
    if (!settingsState?.workspaceId) return;
    setIsSeedingDemo(true);
    try {
      const result = await generateDemoSeed(settingsState.workspaceId, settingsState.userId);
      setToast(result.message);
    } catch (error) {
      setToast(getFriendlySaveError(error));
    } finally {
      setIsSeedingDemo(false);
    }
  }

  async function handleClearDemoSeed() {
    if (typeof window !== "undefined" && !window.confirm("Confirma limpar apenas os dados fictícios marcados de demonstração? Esta ação não altera dados reais, autenticação ou integrações externas.")) return;
    if (!isSupabaseMode) {
      setToast("Modo local: limpeza simulada concluída. Dados reais, autenticação e integrações externas não foram alterados.");
      return;
    }
    if (!settingsState?.workspaceId) return;
    setIsClearingDemo(true);
    try {
      const result = await clearDemoSeed(settingsState.workspaceId);
      setToast(result.message);
    } catch (error) {
      setToast(getFriendlySaveError(error));
    } finally {
      setIsClearingDemo(false);
    }
  }

  function handleRestoreDemoDefaults() {
    setWorkspaceForm(defaultWorkspaceSettings);
    setProfileForm(defaultProfileSettings);
    setOperationalPreferences(defaultOperationalPreferences);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GOVERNANCE_STORAGE_KEY, JSON.stringify(defaultOperationalPreferences));
    }
    if (!isSupabaseMode) {
      const saved = saveDemoSettings(defaultWorkspaceSettings, defaultProfileSettings);
      setSettingsState(saved);
      setWorkspaceForm(saved.workspace);
      setProfileForm(saved.profile);
    }
    setToast("Demonstração padrão restaurada localmente. Dados reais e integrações externas não foram alterados.");
  }

  async function handleSaveSettings() {
    setIsSaving(true);

    try {
      if (settingsState?.mode === "supabase" && settingsState.workspaceId && settingsState.userId) {
        if (activeSection === "perfil") {
          await updateCurrentProfile({
            userId: settingsState.userId,
            fullName: profileForm.fullName,
            position: profileForm.position,
            department: profileForm.department,
            phone: profileForm.phone,
          });
          const reloaded = await loadSettings();
          setSettingsState(reloaded);
          setWorkspaceForm(reloaded.workspace);
          setProfileForm(reloaded.profile);
        } else if (activeSection === "workspace") {
          const reloaded = await saveSupabaseSettings(settingsState.workspaceId, settingsState.userId, workspaceForm, profileForm);
          setSettingsState(reloaded);
          setWorkspaceForm(reloaded.workspace);
          setProfileForm(reloaded.profile);
        }
        setMembersState(await loadWorkspaceMembers());
      } else {
        const saved = saveDemoSettings(workspaceForm, profileForm);
        setSettingsState(saved);
        setWorkspaceForm(saved.workspace);
        setProfileForm(saved.profile);
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(GOVERNANCE_STORAGE_KEY, JSON.stringify(operationalPreferences));
      }
      setToast("Configurações salvas localmente para esta demonstração.");
    } catch (error) {
      setToast(getFriendlySaveError(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveMember(member: WorkspaceMember) {
    if (!membersState?.workspaceId) return;
    setSavingMemberId(member.id);
    try {
      await updateWorkspaceMember({
        memberId: member.id,
        workspaceId: membersState.workspaceId,
        currentUserRole: currentRole,
        role: member.role,
        status: member.status,
        displayName: member.displayName,
        position: member.position,
        department: member.department,
      });
      setMembersState(await loadWorkspaceMembers());
      setToast("Membro atualizado com controle de permissões.");
    } catch (error) {
      setToast(getFriendlySaveError(error));
    } finally {
      setSavingMemberId(null);
    }
  }

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
        <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Configurações • Governança do workspace</p>
              <h1 className="mt-2.5 text-3xl font-semibold text-white lg:text-4xl">Configurações do escritório</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-lexos-muted">
                Controle identidade, permissões, ambiente, segurança e preferências operacionais do LEX.OS Control.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:flex-col xl:items-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-lexos-cyan/30 bg-lexos-cyan/8 px-3.5 py-1.5 text-xs font-semibold text-lexos-cyan">
                <span className="h-2 w-2 rounded-full bg-lexos-cyan shadow-[0_0_12px_rgba(61,213,243,0.8)]" />
                {isSupabaseMode ? "Ambiente Supabase • acesso controlado" : "Ambiente local • demonstração segura"}
              </span>
              <button className="calm-primary-action disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoadingSettings} onClick={handleSaveSettings} type="button">
                {isSaving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Indicadores administrativos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <AdministrativeMetric label="Escritório" value="Configurado" text={workspaceForm.firmName || "Escritório Demonstração LEX.OS"} />
          <AdministrativeMetric label="Usuários e permissões" value="4 papéis" text="Acessos por perfil operacional" />
          <AdministrativeMetric emphasized label="Ambiente" value={isSupabaseMode ? "Supabase" : "Local/demo"} text={isSupabaseMode ? "Banco conectado com RLS" : "Sem integração externa ativa"} tone="cyan" />
          <AdministrativeMetric emphasized label="Segurança e LGPD" value="Protegido" text="Revisão humana obrigatória" tone="gold" />
          <AdministrativeMetric label="Dados" value="Demonstração" text="Persistência local controlada" />
          <AdministrativeMetric label="Implantação" value="Piloto seguro" text="Liberação assistida" />
        </section>

        <section className="executive-panel-compact rounded-[1.35rem] border border-white/[0.055] bg-white/[0.026]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Central administrativa</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Governança organizada por frente de controle</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-5 text-lexos-muted">Acesse os ajustes essenciais do workspace sem misturar configuração administrativa com o roteiro de implantação.</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-cyan">Revisão humana obrigatória</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ConfigurationHubCard eyebrow="Escritório" title="Identidade do escritório" description="Dados institucionais e estado do workspace." items={[workspaceForm.firmName || "Escritório Demonstração LEX.OS", workspaceForm.operationalIdentity, `Responsável: ${profileForm.fullName || "Dra. Helena Moraes"}`, `Status: ${workspaceForm.status}`]} action="Editar identidade" onClick={() => setActiveSection("workspace")} tone="gold" />
            <ConfigurationHubCard eyebrow="Equipe" title="Usuários e permissões" description="Papéis controlados e acessos a áreas sensíveis." items={["Sócio/admin com visão executiva", "Financeiro controlado", "Perfis de leitura e operação", "Áreas sensíveis delimitadas"]} action="Revisar permissões" onClick={() => setActiveSection("usuarios")} tone="cyan" />
            <ConfigurationHubCard featured eyebrow="Proteção" title="Segurança e LGPD" description="Guardrails para uso responsável do ambiente." items={["Sem saídas externas automáticas", "Dados sensíveis protegidos", "Revisão humana obrigatória", "Limitações do piloto registradas"]} action="Abrir Segurança/LGPD" href="/configuracoes/seguranca" tone="gold" />
            <ConfigurationHubCard eyebrow="Ambiente" title="Ambiente e dados" description="Demonstração local separada do ambiente real." items={["Modo demonstração/local", "Persistência local no navegador", "Sem banco real nesta rodada", "Sem integrações externas"]} action="Validar ambiente" onClick={handleGenerateDemoSeed} tone="cyan" />
            <ConfigurationHubCard eyebrow="Rotina" title="Preferências operacionais" description="Parâmetros locais para leitura e revisão diária." items={["Filtros e prazos padrão", "Exibição premium confortável", "Rotina de revisão assistida", "Confirmação de ações sensíveis"]} action="Ajustar preferências" onClick={() => setActiveSection("operacionais")} tone="gold" />
            <ConfigurationHubCard eyebrow="Liberação" title="Implantação e liberação" description="Acompanhamento objetivo do piloto seguro." items={["Checklist de entrega", "Status do piloto", "Pontos pendentes", "Liberação assistida"]} action="Abrir implantação" href="/configuracoes/release" tone="cyan" />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="executive-panel-compact rounded-[1.2rem] border border-white/[0.055] bg-white/[0.026]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lexos-gold">Limites do ambiente</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Uso demonstrativo com governança preservada</h2>
              </div>
              <StatusBadge status="revisão humana" />
            </div>
            <div className="mt-4 grid gap-2.5 md:grid-cols-3">
              <GovernanceLimit text="Nenhuma integração externa é acionada por esta página." />
              <GovernanceLimit text="Configurações demo não alteram autenticação, banco real ou permissões externas." />
              <GovernanceLimit text="Qualquer uso externo exige revisão humana antes da liberação." />
            </div>
            {dataSourceStatus.warning ? <p className="mt-3 rounded-xl border border-lexos-gold/18 bg-lexos-gold/[0.055] px-3 py-2 text-xs font-semibold text-lexos-goldSoft">{dataSourceStatus.warning}</p> : null}
            <details className="mt-3 rounded-xl border border-lexos-line/65 bg-lexos-ink/32 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-lexos-silver">Gerenciar dados de demonstração</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <DemoAction disabled={isSeedingDemo || isClearingDemo} label={isSeedingDemo ? "Validando..." : "Validar ambiente demo"} onClick={handleGenerateDemoSeed} />
                <DemoAction disabled={isSeedingDemo || isClearingDemo} label={isClearingDemo ? "Limpando..." : "Limpar dados fictícios"} onClick={handleClearDemoSeed} tone="pink" />
                <DemoAction label="Restaurar demo padrão" onClick={handleRestoreDemoDefaults} />
              </div>
            </details>
          </div>

          <div className="executive-panel-compact rounded-[1.2rem] border border-white/[0.055] bg-white/[0.026]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lexos-cyan">Ações rápidas</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Atalhos administrativos</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <QuickAction label="Revisar permissões" onClick={() => setActiveSection("usuarios")} />
              <QuickAction href="/configuracoes/release" label="Abrir implantação" />
              <QuickAction href="/configuracoes/seguranca" label="Conferir LGPD" />
              <QuickAction label="Validar ambiente" onClick={handleGenerateDemoSeed} />
              <QuickAction href="/dashboard" label="Voltar à visão geral" />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <SectionButton active={activeSection === "workspace"} eyebrow="Escritório" title="Identidade" subtitle="Dados institucionais" onClick={() => setActiveSection("workspace")} />
          <SectionButton active={activeSection === "perfil"} eyebrow="Meu perfil" title="Perfil" subtitle="Preferências pessoais" onClick={() => setActiveSection("perfil")} />
          <SectionButton active={activeSection === "usuarios"} eyebrow="Equipe" title="Permissões" subtitle="Papéis simulados" onClick={() => setActiveSection("usuarios")} />
          <SectionButton active={activeSection === "seguranca"} eyebrow="Segurança" title="LGPD e auditoria" subtitle="Controles de uso" onClick={() => setActiveSection("seguranca")} />
          <SectionButton active={activeSection === "operacionais"} eyebrow="Padrões" title="Operacionais" subtitle="Parâmetros locais" onClick={() => setActiveSection("operacionais")} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0">
            {activeSection === "workspace" ? (
              <SectionCard eyebrow="Escritório" title="Identidade e padrão institucional" className="bg-lexos-panel/95">
                <div className="space-y-4">
                  {!canEditWorkspace ? <PermissionNotice message="Seu papel pode visualizar estas configurações, mas a edição avançada do escritório fica reservada a gestores autorizados." /> : null}
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <FieldGroup title="Identidade institucional" description="Dados exibidos na demonstração do workspace.">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="lg:col-span-2"><DemoField label="Nome do escritório"><textarea className="premium-input min-h-[3.1rem] resize-none overflow-visible whitespace-normal" disabled={!canEditWorkspace} onChange={(event) => updateWorkspaceField("firmName", event.target.value)} rows={2} value={workspaceForm.firmName} /></DemoField></div>
                        <DemoField label="Status do escritório"><select className="premium-input" disabled={!canEditWorkspace} onChange={(event) => updateWorkspaceField("status", event.target.value)} value={workspaceForm.status}><option value="active">active</option><option value="inactive">inactive</option><option value="demo">demo</option></select></DemoField>
                        <DemoField label="Plano atual"><select className="premium-input" disabled={isSupabaseMode} onChange={(event) => updateWorkspaceField("plan", event.target.value)} value={workspaceForm.plan}><option>Intelligence</option><option>Professional</option><option>Enterprise Piloto</option></select></DemoField>
                        <div className="lg:col-span-2"><DemoField label="Co-branding"><textarea className="premium-input min-h-[3.1rem] resize-none overflow-visible whitespace-normal" disabled={isSupabaseMode} onChange={(event) => updateWorkspaceField("coBranding", event.target.value)} rows={2} value={workspaceForm.coBranding} /></DemoField></div>
                      </div>
                    </FieldGroup>
                    <FieldGroup title="Perfil operacional" description="Padrões visuais e assinatura revisável.">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <DemoField label="Identidade operacional"><select className="premium-input" disabled={!canEditWorkspace} onChange={(event) => updateWorkspaceField("operationalIdentity", event.target.value as WorkspaceForm["operationalIdentity"])} value={workspaceForm.operationalIdentity}>{operationalIdentityOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></DemoField>
                        <DemoField label="Preferência visual"><select className="premium-input" disabled={!canEditWorkspace} onChange={(event) => updateVisualPreference(event.target.value as WorkspaceForm["visualPreference"])} value={workspaceForm.visualPreference}>{visualPreferenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></DemoField>
                        <div className="lg:col-span-2"><DemoField label="Assinatura padrão"><textarea className="premium-input min-h-[3.1rem] resize-none overflow-visible whitespace-normal" disabled={isSupabaseMode} onChange={(event) => updateWorkspaceField("signature", event.target.value)} rows={2} value={workspaceForm.signature} /></DemoField></div>
                      </div>
                    </FieldGroup>
                  </div>
                  <ActionFooter message="Alterações permanecem locais na demonstração e não acionam integrações externas."><SaveButton disabled={isSaving || isLoadingSettings || !canEditWorkspace} loading={isSaving} onClick={handleSaveSettings} /></ActionFooter>
                </div>
              </SectionCard>
            ) : null}

            {activeSection === "perfil" ? (
              <SectionCard eyebrow="Meu perfil" title="Perfil, permissões efetivas e assinatura" className="bg-lexos-panel/95">
                <div className="space-y-4">
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <FieldGroup title="Dados do usuário" description="Informações pessoais da demonstração.">
                      <div className="grid gap-3 md:grid-cols-2">
                        <DemoField label="Nome do usuário"><input className="premium-input" onChange={(event) => updateProfileField("fullName", event.target.value)} value={profileForm.fullName} /></DemoField>
                        <DemoField label="E-mail institucional"><input className="premium-input" disabled value={profileForm.email} /></DemoField>
                        <DemoField label="Cargo"><input className="premium-input" onChange={(event) => updateProfileField("position", event.target.value)} value={profileForm.position} /></DemoField>
                        <DemoField label="Departamento"><input className="premium-input" onChange={(event) => updateProfileField("department", event.target.value)} value={profileForm.department} /></DemoField>
                        <DemoField label="Telefone"><input className="premium-input" onChange={(event) => updateProfileField("phone", event.target.value)} value={profileForm.phone} /></DemoField>
                      </div>
                    </FieldGroup>
                    <FieldGroup title="Governança do perfil" description="Permissões e saída revisável.">
                      <div className="grid gap-3 md:grid-cols-2">
                        <DemoField label="Papel atual"><input className="premium-input" disabled value={roleLabels[currentRole]} /></DemoField>
                        <DemoField label="Preferência de visualização"><input className="premium-input" disabled value={workspaceForm.visualPreference} /></DemoField>
                        <div className="md:col-span-2"><DemoField label="Permissões efetivas"><input className="premium-input" disabled value={getRolePermissions(currentRole).modules.map((module) => moduleLabels[module]).slice(0, 4).join(", ")} /></DemoField></div>
                        <div className="md:col-span-2"><DemoField label="Assinatura de saída"><input className="premium-input" onChange={(event) => updateWorkspaceField("signature", event.target.value)} value={workspaceForm.signature} /></DemoField></div>
                      </div>
                    </FieldGroup>
                  </div>
                  <PermissionNotice message="Dados sensíveis protegidos: o próprio usuário não altera seu papel. Saídas relevantes devem permanecer revisáveis antes de qualquer uso externo." />
                  <ActionFooter message="Preferências do perfil são locais nesta demonstração e não enviam dados para terceiros."><SaveButton disabled={isSaving || isLoadingSettings} loading={isSaving} onClick={handleSaveSettings} /></ActionFooter>
                </div>
              </SectionCard>
            ) : null}

            {activeSection === "usuarios" ? (
              <SectionCard eyebrow="Equipe e permissões" title="Papéis simulados e controle local" className="bg-lexos-panel/95">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                    {roleGovernanceCards.map((card) => <RoleGovernanceCard key={card.role} {...card} />)}
                  </div>
                  <div className="rounded-2xl border border-lexos-gold/18 bg-white/[0.026] p-4 text-sm leading-6 text-lexos-silver">
                    <p className="font-semibold text-white">Membros e convites</p>
                    <p className="mt-2">Convites automatizados não estão ativos nesta demonstração. A criação de usuários reais permanece separada da simulação local e deve seguir o fluxo técnico do escritório.</p>
                  </div>
                  {isSupabaseMode ? (
                    realMembers.length ? realMembers.map((member) => (
                      <MemberCard
                        canManage={canManageMembers}
                        currentUserId={membersState?.currentUserId ?? ""}
                        expanded={expandedUser === member.id}
                        key={member.id}
                        member={member}
                        onExpand={() => setExpandedUser(expandedUser === member.id ? "" : member.id)}
                        onSave={() => handleSaveMember(member)}
                        onUpdate={(patch) => updateMemberDraft(member.id, patch)}
                        saving={savingMemberId === member.id}
                      />
                    )) : <PermissionNotice message="Nenhum membro foi retornado pelo controle de acesso deste escritório. Confirme o vínculo com a administração técnica." />
                  ) : (
                    demoUsers.map((user) => <DemoMemberCard expanded={expandedUser === user.id} key={user.id} onExpand={() => setExpandedUser(expandedUser === user.id ? "" : user.id)} user={user} />)
                  )}
                </div>
              </SectionCard>
            ) : null}

            {activeSection === "seguranca" ? (
              <SectionCard eyebrow="Segurança, LGPD e auditoria" title="Controles de governança e uso responsável" className="bg-lexos-panel/95">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {securityCards.map((card) => <InfoCard key={card.title} title={card.title} text={card.text} />)}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Link className="interactive-card rounded-2xl border border-lexos-gold/45 bg-lexos-gold/12 px-5 py-4 text-sm font-semibold text-lexos-goldSoft transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:text-white" href="/configuracoes/seguranca">Abrir Segurança e LGPD</Link>
                    <Link className="interactive-card rounded-2xl border border-lexos-cyan/35 bg-lexos-cyan/10 px-5 py-4 text-sm font-semibold text-lexos-cyan transition hover:-translate-y-0.5 hover:bg-lexos-cyan/15 hover:text-white" href="/configuracoes/auditoria">Abrir auditoria operacional</Link>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {activeSection === "operacionais" ? (
              <OperationalPreferencesPanel preferences={operationalPreferences} onChange={updateOperationalPreference} onSave={handleSaveSettings} disabled={isSaving || isLoadingSettings} loading={isSaving} />
            ) : null}
          </div>

          <GovernanceSummary
            currentRole={roleLabels[currentRole]}
            firmName={workspaceForm.firmName || "Escritório Demonstração LEX.OS"}
            operationalIdentity={workspaceForm.operationalIdentity}
            visualPreference={workspaceForm.visualPreference}
            confirmationStatus={operationalPreferences.sensitiveActionConfirmation}
            environmentLabel={isSupabaseMode ? "Supabase controlado" : "Demonstração separada"}
          />
        </section>
      </div>

      {toast ? <div className="fixed bottom-5 right-5 z-[60] rounded-2xl border border-lexos-gold/40 bg-lexos-panel px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium">{toast}</div> : null}
    </AppLayout>
  );
}

function SectionButton({ active, eyebrow, title, subtitle, onClick }: { active: boolean; eyebrow: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button className={cn("group rounded-[1rem] border p-3.5 text-left transition hover:border-lexos-gold/48 focus:outline-none focus:ring-2 focus:ring-lexos-gold/40", active ? "border-lexos-gold/60 bg-gradient-to-br from-lexos-card/92 via-lexos-navy/90 to-lexos-ink shadow-glow" : "border-lexos-line/75 bg-lexos-panel/66")} onClick={onClick} type="button">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className={cn("text-[0.66rem] font-semibold uppercase tracking-[0.18em]", active ? "text-lexos-gold" : "text-lexos-muted")}>{eyebrow}</p><h2 className="mt-1.5 truncate text-sm font-semibold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-lexos-muted">{subtitle}</p></div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.64rem] font-semibold transition", active ? "border-lexos-gold/52 bg-lexos-gold/10 text-lexos-goldSoft" : "border-lexos-line/75 text-lexos-muted group-hover:text-white")}>{active ? "Ativo" : "Abrir"}</span>
      </div>
    </button>
  );
}

function FieldGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <fieldset className="min-w-0 rounded-2xl border border-lexos-line/80 bg-lexos-ink/55 p-4 subtle-hover-card"><legend className="px-1 text-sm font-semibold text-white">{title}</legend><p className="mb-4 mt-1 text-xs leading-5 text-lexos-muted">{description}</p>{children}</fieldset>;
}

function ActionFooter({ message, children }: { message: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-lexos-line/80 bg-lexos-ink/50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-lexos-muted">{message}</p><div className="shrink-0">{children}</div></div>;
}

function GovernanceSummary({ currentRole, firmName, operationalIdentity, visualPreference, confirmationStatus, environmentLabel }: { currentRole: string; firmName: string; operationalIdentity: string; visualPreference: string; confirmationStatus: string; environmentLabel: string }) {
  return (
    <aside className="executive-panel-compact rounded-[1.35rem] border border-lexos-gold/16 bg-white/[0.026] subtle-hover-card xl:sticky xl:top-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Resumo da governança</p>
      <h2 className="mt-2 text-xl font-semibold text-white">Estado atual do workspace</h2>
      <p className="mt-2 text-sm leading-6 text-lexos-muted">Leitura executiva do ambiente: parâmetros controlados, sem alterar autenticação, middleware ou integrações externas.</p>
      <div className="mt-4 grid gap-2">
        <SummaryRow label="Ambiente" value={environmentLabel} />
        <SummaryRow label="Revisão humana" value="Obrigatória" />
        <SummaryRow label="Envio externo" value="Desativado" />
        <SummaryRow label="Dados" value="Locais no navegador" />
        <SummaryRow label="Padrão visual" value={visualPreference || "Navy premium"} />
        <SummaryRow label="Confirmação sensível" value={confirmationStatus || "Ativa"} />
      </div>
      <div className="mt-4 rounded-2xl border border-lexos-cyan/25 bg-lexos-cyan/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-cyan">Contexto</p>
        <p className="mt-2 text-sm font-semibold text-white">{firmName}</p>
        <p className="mt-1 text-xs leading-5 text-lexos-silver">Papel atual: {currentRole}. Identidade operacional: {operationalIdentity}.</p>
      </div>
      <p className="mt-4 rounded-2xl border border-lexos-gold/20 bg-lexos-gold/10 p-3 text-xs leading-5 text-lexos-goldSoft">As configurações deste bloco são demonstrativas/localmente persistidas e não enviam dados para terceiros.</p>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white/[0.026] px-3 py-2"><span className="text-xs text-lexos-muted">{label}</span><span className="min-w-0 text-right text-xs font-semibold leading-5 text-white">{value}</span></div>;
}

function AdministrativeMetric({ label, value, text, tone = "neutral", emphasized = false }: { label: string; value: string; text: string; tone?: "neutral" | "gold" | "cyan"; emphasized?: boolean }) {
  return <article className={cn("calm-metric-card border text-left", emphasized ? "bg-white/[0.045]" : "border-white/[0.055]", tone === "gold" && "border-lexos-gold/24", tone === "cyan" && "border-lexos-cyan/22")}><p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-lexos-muted">{label}</p><p className={cn("mt-1.5 text-base font-semibold", tone === "gold" ? "text-lexos-goldSoft" : tone === "cyan" ? "text-lexos-cyan" : "text-white")}>{value}</p><p className="mt-1 text-xs leading-4 text-lexos-muted">{text}</p></article>;
}

function ConfigurationHubCard({ eyebrow, title, description, items, action, tone, featured = false, href, onClick }: { eyebrow: string; title: string; description: string; items: string[]; action: string; tone: "gold" | "cyan"; featured?: boolean; href?: string; onClick?: () => void }) {
  const cardClass = cn("group flex flex-col rounded-2xl border p-3.5 text-left transition hover:border-lexos-cyan/24", featured ? "border-lexos-gold/26 bg-lexos-gold/[0.045]" : "border-white/[0.055] bg-white/[0.024]");
  const actionClass = cn("mt-3 inline-flex w-fit items-center gap-2 text-xs font-semibold transition group-hover:text-white", tone === "gold" ? "text-lexos-goldSoft" : "text-lexos-cyan");
  const content = <><p className={cn("text-[0.64rem] font-semibold uppercase tracking-[0.18em]", featured ? "text-lexos-gold" : "text-lexos-muted")}>{eyebrow}</p><h3 className="mt-1.5 text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-4 text-lexos-muted">{description}</p><ul className="mt-2 flex-1 space-y-0.5">{items.map((item) => <li className="flex items-start gap-2 text-xs leading-4 text-lexos-silver" key={item}><span className={cn("mt-[0.34rem] h-1 w-1 shrink-0 rounded-full", featured ? "bg-lexos-gold" : "bg-lexos-muted/70")} />{item}</li>)}</ul><span className={actionClass}>{action}<span aria-hidden="true">→</span></span></>;
  if (href) return <Link className={cardClass} href={href}>{content}</Link>;
  return <button className={cardClass} onClick={onClick} type="button">{content}</button>;
}

function GovernanceLimit({ text }: { text: string }) {
  return <div className="rounded-xl bg-white/[0.026] px-3 py-2 text-xs leading-5 text-lexos-silver"><span className="mr-2 text-lexos-cyan/80">◆</span>{text}</div>;
}

function QuickAction({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const className = "flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-lexos-silver transition hover:bg-white/[0.045] hover:text-white";
  const content = <>{label}<span className="text-lexos-cyan" aria-hidden="true">→</span></>;
  if (href) return <Link className={className} href={href}>{content}</Link>;
  return <button className={className} onClick={onClick} type="button">{content}</button>;
}

function DemoAction({ label, onClick, disabled = false, tone = "cyan" }: { label: string; onClick: () => void; disabled?: boolean; tone?: "cyan" | "pink" }) {
  return <button className={cn("rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60", tone === "pink" ? "bg-lexos-wine/10 text-lexos-red/90 hover:bg-lexos-wine/16" : "bg-white/[0.045] text-lexos-cyan hover:bg-white/[0.08]")} disabled={disabled} onClick={onClick} type="button">{label}</button>;
}

function OperationalPreferencesPanel({ preferences, onChange, onSave, disabled, loading }: { preferences: OperationalPreferences; onChange: <Field extends keyof OperationalPreferences>(field: Field, value: OperationalPreferences[Field]) => void; onSave: () => void; disabled: boolean; loading: boolean }) {
  return (
    <SectionCard eyebrow="Padrões operacionais" title="Parametrização local do escritório" className="bg-lexos-panel/95">
      <div className="space-y-4">
        <p className="rounded-2xl border border-lexos-cyan/25 bg-lexos-cyan/10 p-3 text-xs leading-5 text-lexos-cyan">Preferências do workspace simuladas localmente. Não representam integração real com prazos, protocolos, clientes, banco, autenticação ou sistemas externos.</p>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          <DemoField label="Prazo considerado crítico"><select className="premium-input" value={preferences.criticalDeadline} onChange={(event) => onChange("criticalDeadline", event.target.value)}><option>24 horas antes do vencimento</option><option>48 horas antes do vencimento</option><option>72 horas antes do vencimento</option></select></DemoField>
          <DemoField label="Prazo considerado próximo"><select className="premium-input" value={preferences.upcomingDeadline} onChange={(event) => onChange("upcomingDeadline", event.target.value)}><option>3 dias corridos antes do vencimento</option><option>7 dias corridos antes do vencimento</option><option>15 dias corridos antes do vencimento</option></select></DemoField>
          <DemoField label="Responsável padrão"><input className="premium-input" value={preferences.defaultOwner} onChange={(event) => onChange("defaultOwner", event.target.value)} /></DemoField>
          <DemoField label="Modelo padrão de relatório"><select className="premium-input" value={preferences.reportTemplate} onChange={(event) => onChange("reportTemplate", event.target.value)}><option>Relatório executivo com revisão humana</option><option>Relatório operacional por cliente</option><option>Relatório financeiro consolidado</option></select></DemoField>
          <DemoField label="Prioridade visual padrão"><select className="premium-input" value={preferences.visualPriority} onChange={(event) => onChange("visualPriority", event.target.value)}><option>Alta prioridade destacada em dourado/ciano</option><option>Prioridade por prazo e risco</option><option>Prioridade discreta por status</option></select></DemoField>
          <DemoField label="Regra de arquivamento"><select className="premium-input" value={preferences.archiveRule} onChange={(event) => onChange("archiveRule", event.target.value)}><option>Arquivar após encerramento validado</option><option>Manter ativo até revisão do sócio</option><option>Arquivar somente com confirmação manual</option></select></DemoField>
          <DemoField label="Exibir dados fictícios por padrão"><select className="premium-input" value={preferences.showDemoDataByDefault} onChange={(event) => onChange("showDemoDataByDefault", event.target.value)}><option>Sim</option><option>Não</option></select></DemoField>
          <DemoField label="Confirmação antes de ações sensíveis"><input className="premium-input" disabled value={preferences.sensitiveActionConfirmation} /></DemoField>
        </div>
        <ActionFooter message="Parâmetros salvos localmente para a demonstração, sem ativar integrações ou envio de dados para terceiros."><SaveButton disabled={disabled} loading={loading} onClick={onSave} /></ActionFooter>
      </div>
    </SectionCard>
  );
}

function RoleGovernanceCard({ role, access, canView, cannotExecute }: { role: WorkspaceRole; access: string; canView: string; cannotExecute: string }) {
  return <article className="calm-record-card border border-white/[0.055] p-4 subtle-hover-card"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{roleLabels[role]}</p><p className="mt-1 text-xs uppercase tracking-[0.16em] text-lexos-gold">Nível: {access}</p></div><span className="rounded-full border border-lexos-cyan/35 bg-lexos-cyan/10 px-3 py-1 text-xs font-semibold text-lexos-cyan">simulado/local</span></div><p className="mt-3 text-xs font-semibold text-lexos-silver">Pode visualizar</p><p className="mt-1 text-xs leading-5 text-lexos-muted">{canView}</p><p className="mt-3 text-xs font-semibold text-lexos-silver">Não pode executar</p><p className="mt-1 text-xs leading-5 text-lexos-muted">{cannotExecute}</p></article>;
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return <article className="calm-record-card border border-white/[0.055] p-4 subtle-hover-card"><p className="text-sm font-semibold text-white">{title}</p><p className="mt-2 text-xs leading-5 text-lexos-muted">{text}</p><span className="mt-3 inline-flex rounded-full border border-lexos-gold/25 bg-lexos-gold/10 px-3 py-1 text-xs font-semibold text-lexos-goldSoft">Controle ativo na demonstração</span></article>;
}

function MemberCard({ member, currentUserId, canManage, saving, expanded, onExpand, onUpdate, onSave }: { member: WorkspaceMember; currentUserId: string; canManage: boolean; saving: boolean; expanded: boolean; onExpand: () => void; onUpdate: (patch: Partial<WorkspaceMember>) => void; onSave: () => void }) {
  const permissions = getRolePermissions(member.role);
  return (
    <article className={cn("calm-record-card border p-4 transition", expanded ? "border-lexos-gold/32 bg-lexos-gold/[0.035]" : "border-white/[0.055] hover:border-lexos-cyan/20")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="font-semibold text-white">{member.displayName || member.profile?.email || "Usuário do workspace"}</p><StatusBadge status={member.status} />{member.userId === currentUserId ? <span className="rounded-full border border-lexos-cyan/40 bg-lexos-cyan/10 px-3 py-1 text-xs font-semibold text-lexos-cyan">Você</span> : null}</div><p className="mt-1 text-sm text-lexos-muted">{member.profile?.email || "sem-email@lexos.local"} • {roleLabels[member.role]}</p><p className="mt-3 text-sm leading-6 text-lexos-silver">{roleDescriptions[member.role]}</p></div><button className="rounded-xl border border-lexos-line px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onExpand} type="button">{expanded ? "Ocultar detalhes" : "Ver detalhes"}</button></div>
      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-lexos-line/70 pt-4">
          <div className="grid gap-3 md:grid-cols-3"><PreviewChip label="Cargo" value={member.position || "Não informado"} /><PreviewChip label="Departamento" value={member.department || "Não informado"} /><PreviewChip label="Última atividade" value={formatDateTime(member.lastSeenAt || member.updatedAt)} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <DemoField label="Nome de exibição"><input className="premium-input" disabled={!canManage} onChange={(event) => onUpdate({ displayName: event.target.value })} value={member.displayName} /></DemoField>
            <DemoField label="Papel"><select className="premium-input" disabled={!canManage} onChange={(event) => onUpdate({ role: event.target.value as WorkspaceRole })} value={member.role}>{workspaceRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></DemoField>
            <DemoField label="Status"><select className="premium-input" disabled={!canManage} onChange={(event) => onUpdate({ status: event.target.value })} value={member.status}><option value="active">active</option><option value="inactive">inactive</option><option value="pending">pending</option></select></DemoField>
            <DemoField label="Cargo"><input className="premium-input" disabled={!canManage} onChange={(event) => onUpdate({ position: event.target.value })} value={member.position} /></DemoField>
            <DemoField label="Departamento"><input className="premium-input" disabled={!canManage} onChange={(event) => onUpdate({ department: event.target.value })} value={member.department} /></DemoField>
          </div>
          <div className="subtle-hover-card rounded-xl border border-lexos-gold/18 bg-lexos-ink/70 p-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">Permissões derivadas do papel</p><div className="mt-3 flex flex-wrap gap-2">{permissions.modules.map((module) => <span className="rounded-full border border-lexos-line bg-lexos-card px-3 py-1 text-xs font-semibold text-lexos-silver" key={module}>{moduleLabels[module]}</span>)}</div></div>
          {!canManage ? <PermissionNotice message="Seu papel permite visualizar usuários, mas não editar membros deste escritório." /> : null}
          <button className="rounded-full bg-lexos-cyan px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-lexos-cyan/35 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canManage || saving} onClick={onSave} type="button">{saving ? "Salvando..." : "Salvar membro"}</button>
        </div>
      ) : null}
    </article>
  );
}

function DemoMemberCard({ user, expanded, onExpand }: { user: DemoUser; expanded: boolean; onExpand: () => void }) {
  const permissions = getRolePermissions(user.role);
  return (
    <article className={cn("calm-record-card border p-4 transition", expanded ? "border-lexos-gold/32 bg-lexos-gold/[0.035]" : "border-white/[0.055] hover:border-lexos-cyan/20")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="font-semibold text-white">{user.name}</p><StatusBadge status={user.status} /><span className="rounded-full border border-lexos-cyan/35 bg-lexos-cyan/10 px-3 py-1 text-xs font-semibold text-lexos-cyan">simulado/local</span></div><p className="mt-1 text-sm text-lexos-muted">{user.email} • {roleLabels[user.role]}</p><p className="mt-3 text-sm leading-6 text-lexos-silver">{roleDescriptions[user.role]}</p></div><button className="rounded-xl border border-lexos-line px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onExpand} type="button">{expanded ? "Ocultar detalhes" : "Ver detalhes"}</button></div>
      {expanded ? <div className="mt-4 grid gap-3 border-t border-lexos-line/70 pt-4 md:grid-cols-3"><PreviewChip label="Cargo" value={user.position} /><PreviewChip label="Departamento" value={user.department} /><PreviewChip label="Status" value="simulado/local" /><div className="subtle-hover-card rounded-xl border border-lexos-gold/18 bg-lexos-ink/70 p-3 md:col-span-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">Permissões simuladas</p><div className="mt-3 flex flex-wrap gap-2">{permissions.modules.map((module) => <span className="rounded-full border border-lexos-line bg-lexos-card px-3 py-1 text-xs font-semibold text-lexos-silver" key={module}>{moduleLabels[module]}</span>)}</div></div></div> : null}
    </article>
  );
}

function PermissionNotice({ message }: { message: string }) {
  return <div className="rounded-2xl border border-lexos-gold/18 bg-lexos-gold/[0.055] p-4 text-sm leading-6 text-lexos-goldSoft">{message}</div>;
}

function SaveButton({ disabled, loading, onClick }: { disabled: boolean; loading: boolean; onClick: () => void }) {
  return <button className="rounded-full bg-lexos-cyan px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-lexos-cyan/35 disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={onClick} type="button">{loading ? "Salvando..." : "Salvar alterações"}</button>;
}

function DemoField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-sm font-medium text-lexos-silver"><span className="block leading-5">{label}</span><div className="mt-2 min-w-0 [&_.premium-input]:min-w-0 [&_.premium-input]:w-full">{children}</div></label>;
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/[0.026] p-3"><p className="text-xs uppercase tracking-[0.16em] text-lexos-muted">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>;
}
