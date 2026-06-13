"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  centralCards,
  clientPortfolio,
  financeRows,
  processPortfolio,
  reportCards,
  routes,
  todayOffice,
  workspace,
} from "@/data/mock";
import {
  consumePendingToast,
  endDemoSession,
  getCurrentSessionOrFallback,
  type LexosSession,
} from "@/lib/auth";
import { CLIENTS_UPDATED_EVENT, getLocalClientSearchResults, listClientsAsync } from "@/lib/data/clients";
import { getLocalProcessSearchResults, listProcessesAsync, PROCESSES_UPDATED_EVENT } from "@/lib/data/processes";
import { AGENDA_UPDATED_EVENT, getLocalAgendaSearchResults, listAgendaEventsAsync } from "@/lib/data/agenda";
import { getLocalTaskSearchResults, listTasksAsync, TASKS_UPDATED_EVENT } from "@/lib/data/tasks";
import { FINANCE_UPDATED_EVENT, formatCurrency, formatDate, getLocalFinanceSearchResults, listFinancialRecordsAsync } from "@/lib/data/finance";
import { getLocalReportSearchResults, getReportSearchResultsAsync, REPORTS_UPDATED_EVENT } from "@/lib/data/reports";
import { getLocalPartnershipSearchResults, listPartnershipsAsync, PARTNERSHIPS_UPDATED_EVENT } from "@/lib/data/partnerships";
import { CENTRAL_EXECUTIONS_UPDATED_EVENT, getCentralExecutionSearchResultsAsync, getLocalCentralExecutionSearchResults } from "@/lib/data/centralExecutions";
import { PROMPT_TEMPLATES_UPDATED_EVENT, getPromptTemplateSearchResultsAsync } from "@/lib/data/promptTemplates";
import { canViewFinance } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SearchResult = {
  type: string;
  title: string;
  description: string;
  route: string;
  action: string;
};

type Notification = {
  id: number;
  category: string;
  priority: "alta" | "média" | "urgente";
  text: string;
  time: string;
  route: string;
  action: string;
  read: boolean;
};

const searchBase: SearchResult[] = [
  ...clientPortfolio.map((client, index) => ({
    type: "Clientes",
    title: client.name,
    description: `${client.status} • ${client.pending} • responsável ${client.owner}`,
    route: `/clientes?clientId=client-demo-${index + 1}`,
    action: "Abrir cliente",
  })),
  ...processPortfolio.map((process, index) => ({
    type: "Processos",
    title: `Proc. ${process.number.slice(0, 10)}`,
    description: `${process.client} • ${process.phase} • risco ${process.risk}`,
    route: `/processos/process-demo-${index + 1}`,
    action: "Abrir processo",
  })),
  ...todayOffice.map((item) => ({
    type: "Agenda",
    title: item.title,
    description: `${item.time} • ${item.meta} • ${item.status}`,
    route: "/agenda",
    action: "Ver agenda",
  })),
  ...financeRows.map((row) => ({
    type: "Financeiro",
    title: row.client,
    description: `${row.contract} • pendente ${row.pending} • ${row.status}`,
    route: "/financeiro",
    action: "Abrir financeiro",
  })),
  ...centralCards.map((card) => ({
    type: "Central LEX.OS",
    title: card.title,
    description: `${card.metric} • ${card.description}`,
    route: card.href,
    action: "Abrir módulo",
  })),
  ...reportCards.map((report) => ({
    type: "Relatórios",
    title: report.title,
    description: `${report.purpose} Público: ${report.audience}`,
    route: "/relatorios",
    action: "Gerar prévia",
  })),
  {
    type: "Tarefas",
    title: "Revisar réplica Grupo Ápice",
    description: "Tarefa pendente • Dra. Helena • prioridade alta",
    route: "/tarefas",
    action: "Abrir tarefas",
  },
  {
    type: "Tarefas",
    title: "Cobrar contrato social Villa Norte",
    description: "Tarefa atrasada • Dra. Camila • depende do cliente",
    route: "/tarefas",
    action: "Abrir tarefas",
  },
  {
    type: "Prompts",
    title: "Mensagem humana de cobrança",
    description: "Biblioteca de Prompts • financeiro e relacionamento",
    route: "/central-lexos/prompts",
    action: "Abrir prompt",
  },
  {
    type: "Dossiê rápido",
    title: "Dossiê Grupo Ápice",
    description: "Briefing executivo para reunião estratégica",
    route: "/central-lexos/dossie-rapido",
    action: "Simular dossiê",
  },
  {
    type: "Agentes",
    title: "Agente de Prazos",
    description: "Organiza dependências e alerta responsáveis",
    route: "/central-lexos/agentes",
    action: "Abrir agente",
  },
  {
    type: "Fluxos",
    title: "Cobrança humanizada",
    description: "Fluxo guiado para regularização sem desgaste",
    route: "/central-lexos/fluxos",
    action: "Abrir fluxo",
  },
  {
    type: "Playbooks",
    title: "Preparação de audiência",
    description: "Checklist interno com responsáveis e riscos",
    route: "/central-lexos/playbooks",
    action: "Abrir playbook",
  },
  ...routes.map(([route, label]) => ({
    type: "Módulos",
    title: label,
    description: `Navegar para ${label} na demonstração`,
    route,
    action: "Navegar",
  })),
];


const moduleSearchBase: SearchResult[] = routes.map(([route, label]) => ({
  type: "Módulos",
  title: label,
  description: `Navegar para ${label} no escritório atual`,
  route,
  action: "Navegar",
}));

function isSupabaseSession(session: LexosSession) {
  return session.mode === "supabase";
}

function clearWorkspaceResults(setters: Array<Dispatch<SetStateAction<SearchResult[]>>>) {
  setters.forEach((setter) => setter([]));
}

const initialNotifications: Notification[] = [
  {
    id: 1,
    category: "Prazo",
    priority: "urgente",
    text: "Audiência de instrução do Proc. 1023387-44 exige conferência final em 48h.",
    time: "há 12 min",
    route: "/processos",
    action: "Ver processo",
    read: false,
  },
  {
    id: 2,
    category: "Cliente",
    priority: "alta",
    text: "Villa Norte SPE está sem retorno há 12 dias sobre documento societário.",
    time: "há 38 min",
    route: "/clientes",
    action: "Ver cliente",
    read: false,
  },
  {
    id: 3,
    category: "Financeiro",
    priority: "alta",
    text: "R$ 28 mil em honorários vencidos aguardam cobrança consultiva.",
    time: "há 1h",
    route: "/financeiro",
    action: "Ver financeiro",
    read: false,
  },
  {
    id: 4,
    category: "Central",
    priority: "média",
    text: "Dossiê Rápido sugerido para reunião do Grupo Ápice amanhã.",
    time: "há 2h",
    route: "/central-lexos/dossie-rapido",
    action: "Abrir Central",
    read: true,
  },
  {
    id: 5,
    category: "Tarefa",
    priority: "urgente",
    text: "Cobrança do contrato social Villa Norte está atrasada e bloqueia a due diligence.",
    time: "hoje, 08:10",
    route: "/tarefas",
    action: "Ver tarefa",
    read: true,
  },
];

function profileFromSession(session: LexosSession) {
  return {
    nome: session.user.name,
    cargo: session.user.role,
    escritorio: session.workspace.name,
    plano: session.workspace.plan,
    permissao: session.user.role,
    assinatura: `Equipe ${session.workspace.name}`,
    coBranding: session.workspace.coBranding,
  };
}

const profileData = profileFromSession(getCurrentSessionOrFallback());

const profileSections = [
  {
    label: "Perfil do usuário",
    description: "Dados executivos e permissões da sócia gestora.",
  },
  {
    label: "Escritório",
    description: "Escritório, equipe e ambiente demonstrativo.",
  },
  {
    label: "Assinatura padrão",
    description: "Modelo de assinatura institucional do escritório.",
  },
  {
    label: "Preferências",
    description: "Preferências visuais e operacionais simuladas.",
  },
  {
    label: "Sair da demonstração",
    description: "Encerra apenas a sessão demonstrativa local.",
  },
] as const;

type ProfileSectionLabel = (typeof profileSections)[number]["label"];
type ProfileData = typeof profileData;

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSection, setProfileSection] =
    useState<ProfileSectionLabel>("Perfil do usuário");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [toast, setToast] = useState<string | null>(null);
  const [session, setSession] = useState<LexosSession>(() =>
    getCurrentSessionOrFallback(),
  );
  const [localClientResults, setLocalClientResults] = useState<SearchResult[]>([]);
  const [localProcessResults, setLocalProcessResults] = useState<SearchResult[]>([]);
  const [localTaskResults, setLocalTaskResults] = useState<SearchResult[]>([]);
  const [localAgendaResults, setLocalAgendaResults] = useState<SearchResult[]>([]);
  const [localFinanceResults, setLocalFinanceResults] = useState<SearchResult[]>([]);
  const [localReportResults, setLocalReportResults] = useState<SearchResult[]>([]);
  const [localPartnershipResults, setLocalPartnershipResults] = useState<SearchResult[]>([]);
  const [localCentralResults, setLocalCentralResults] = useState<SearchResult[]>([]);
  const [profile, setProfile] = useState(() =>
    profileFromSession(getCurrentSessionOrFallback()),
  );
  const canSearchFinance = canViewFinance(session.user.profile);
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const trimmedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    const workspaceResults = [
      ...localClientResults,
      ...localProcessResults,
      ...localTaskResults,
      ...localAgendaResults,
      ...(canSearchFinance ? localFinanceResults : []),
      ...localReportResults,
      ...localPartnershipResults,
      ...localCentralResults,
    ];

    if (isSupabaseSession(session)) return [...workspaceResults, ...moduleSearchBase];

    const localReportKeys = new Set(localReportResults.map((item) => item.title));
    const localCentralKeys = new Set(localCentralResults.map((item) => item.title));
    const localKeys = new Set(workspaceResults.map((item) => `${item.type}:${item.title}`));

    return [
      ...workspaceResults,
      ...searchBase.filter((item) => {
        if (item.type === "Financeiro" && !canSearchFinance) return false;
        if (["Clientes", "Processos", "Tarefas", "Agenda", "Financeiro", "Parcerias"].includes(item.type)) return !localKeys.has(`${item.type}:${item.title}`);
        if (item.type === "Relatórios") return !localReportKeys.has(item.title);
        if (item.type === "Central LEX.OS") return !localCentralKeys.has(item.title);
        return true;
      }),
    ];
  }, [canSearchFinance, localAgendaResults, localCentralResults, localClientResults, localFinanceResults, localPartnershipResults, localProcessResults, localReportResults, localTaskResults, session]);

  const results = useMemo(() => {
    if (!trimmedQuery) return [];
    return searchResults.filter((item) =>
      `${item.type} ${item.title} ${item.description}`
        .toLowerCase()
        .includes(trimmedQuery),
    );
  }, [searchResults, trimmedQuery]);
  const groupedResults = useMemo(() => {
    return results.reduce<Record<string, SearchResult[]>>((groups, result) => {
      groups[result.type] = [...(groups[result.type] ?? []), result];
      return groups;
    }, {});
  }, [results]);

  useEffect(() => {
    let active = true;
    const currentSession = getCurrentSessionOrFallback();
    const workspaceId = currentSession.workspace.id;
    const setters = [
      setLocalClientResults,
      setLocalProcessResults,
      setLocalTaskResults,
      setLocalAgendaResults,
      setLocalFinanceResults,
      setLocalReportResults,
      setLocalPartnershipResults,
      setLocalCentralResults,
    ];

    setSession(currentSession);
    setProfile(profileFromSession(currentSession));
    setNotifications(isSupabaseSession(currentSession) ? [] : initialNotifications);

    async function refreshWorkspaceSearch(scope: "all" | "clients" | "processes" | "tasks" | "agenda" | "finance" | "reports" | "partnerships" | "central" = "all") {
      if (!active) return;

      if (isSupabaseSession(currentSession)) {
        setLocalCentralResults([]);
        try {
          if (scope === "all" || scope === "clients") {
            const clients = await listClientsAsync(workspaceId, { includeArchived: true });
            if (active) setLocalClientResults(clients.map((client) => ({ type: "Clientes", title: client.name, description: `${client.status} • ${client.main_pending} • responsável ${client.owner}`, route: `/clientes?clientId=${client.id}`, action: "Abrir cliente" })));
          }
          if (scope === "all" || scope === "processes") {
            const processes = await listProcessesAsync(workspaceId, { includeArchived: true });
            if (active) setLocalProcessResults(processes.map((process) => ({ type: "Processos", title: `Proc. ${process.number}`, description: `${process.client_name} • ${process.phase} • risco ${process.risk} • ${process.next_action}`, route: `/processos?processId=${process.id}`, action: "Abrir processo" })));
          }
          if (scope === "all" || scope === "tasks") {
            const tasks = await listTasksAsync(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true });
            if (active) setLocalTaskResults(tasks.map((task) => ({ type: "Tarefas", title: task.title, description: `${task.client_name ?? "Tarefa interna"} • ${task.responsible} • ${task.priority} • ${task.next_action}`, route: `/tarefas?taskId=${task.id}`, action: "Abrir tarefa" })));
          }
          if (scope === "all" || scope === "agenda" || scope === "tasks" || scope === "processes") {
            const agenda = await listAgendaEventsAsync(workspaceId, { includeDerived: false });
            if (active) setLocalAgendaResults(agenda.map((event) => ({ type: "Agenda", title: event.title, description: `${event.source_label ?? "Evento"} • ${event.client_name ?? "Interno"} • ${event.responsible} • ${event.next_action}`, route: `/agenda?eventId=${event.id}`, action: "Abrir agenda" })));
          }
          if (scope === "all" || scope === "finance") {
            if (canViewFinance(currentSession.user.profile)) {
              const records = await listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined });
              if (active) setLocalFinanceResults(records.map((record) => ({ type: "Financeiro", title: record.title, description: `${record.client_name ?? "Sem cliente"} • ${formatCurrency(record.amount)} • ${record.status} • venc. ${formatDate(record.due_at)}`, route: `/financeiro?financeId=${record.id}`, action: "Abrir lançamento" })));
            } else if (active) {
              setLocalFinanceResults([]);
            }
          }
          if (scope === "all" || scope === "reports") {
            const reports = await getReportSearchResultsAsync(workspaceId);
            if (active) setLocalReportResults(reports);
          }
          if (scope === "all" || scope === "partnerships") {
            const partnerships = await listPartnershipsAsync(workspaceId, { includeArchived: true });
            if (active) setLocalPartnershipResults(partnerships.map((partnership) => ({ type: "Parcerias", title: `${partnership.partner_name} • ${partnership.partner_firm}`, description: `${partnership.client_name ?? "Sem cliente"} • ${partnership.process_number ?? "Sem processo"} • ${partnership.status} • repasse ${partnership.repasse_status} • ${partnership.next_action}`, route: `/processos/parcerias?partnershipId=${partnership.id}`, action: "Abrir parceria" })));
          }
          if (scope === "all" || scope === "central") {
            const [central, prompts] = await Promise.all([getCentralExecutionSearchResultsAsync(workspaceId), getPromptTemplateSearchResultsAsync(workspaceId)]);
            if (active) setLocalCentralResults([...central, ...prompts]);
          }
        } catch {
          clearWorkspaceResults(setters);
        }
        return;
      }

      if (currentSession.mode === "supabase") {
        clearWorkspaceResults(setters);
        return;
      }

      if (scope === "all" || scope === "clients") setLocalClientResults(getLocalClientSearchResults(workspaceId));
      if (scope === "all" || scope === "processes") setLocalProcessResults(getLocalProcessSearchResults(workspaceId));
      if (scope === "all" || scope === "tasks") setLocalTaskResults(getLocalTaskSearchResults(workspaceId));
      if (scope === "all" || scope === "agenda" || scope === "tasks" || scope === "processes") setLocalAgendaResults(getLocalAgendaSearchResults(workspaceId));
      if (scope === "all" || scope === "finance") setLocalFinanceResults(canViewFinance(currentSession.user.profile) ? getLocalFinanceSearchResults(workspaceId) : []);
      if (scope === "all" || scope === "reports") setLocalReportResults(getLocalReportSearchResults(workspaceId));
      if (scope === "all" || scope === "partnerships") setLocalPartnershipResults(getLocalPartnershipSearchResults(workspaceId));
      if (scope === "all" || scope === "central") setLocalCentralResults([...getLocalCentralExecutionSearchResults(workspaceId), ...(await getPromptTemplateSearchResultsAsync(workspaceId))]);
    }

    void refreshWorkspaceSearch();

    const refreshLocalClients = () => void refreshWorkspaceSearch("clients");
    const refreshLocalProcesses = () => void refreshWorkspaceSearch("processes");
    const refreshLocalTasks = () => void refreshWorkspaceSearch("tasks");
    const refreshLocalAgenda = () => void refreshWorkspaceSearch("agenda");
    const refreshLocalFinance = () => void refreshWorkspaceSearch("finance");
    const refreshLocalReports = () => void refreshWorkspaceSearch("reports");
    const refreshLocalPartnerships = () => void refreshWorkspaceSearch("partnerships");
    const refreshLocalCentral = () => void refreshWorkspaceSearch("central");

    window.addEventListener(CLIENTS_UPDATED_EVENT, refreshLocalClients);
    window.addEventListener(PROCESSES_UPDATED_EVENT, refreshLocalProcesses);
    window.addEventListener(TASKS_UPDATED_EVENT, refreshLocalTasks);
    window.addEventListener(AGENDA_UPDATED_EVENT, refreshLocalAgenda);
    window.addEventListener(FINANCE_UPDATED_EVENT, refreshLocalFinance);
    window.addEventListener(REPORTS_UPDATED_EVENT, refreshLocalReports);
    window.addEventListener(PARTNERSHIPS_UPDATED_EVENT, refreshLocalPartnerships);
    window.addEventListener(CENTRAL_EXECUTIONS_UPDATED_EVENT, refreshLocalCentral);
    window.addEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, refreshLocalCentral);

    const pendingToast = consumePendingToast();
    if (pendingToast) setToast(pendingToast);

    return () => {
      active = false;
      window.removeEventListener(CLIENTS_UPDATED_EVENT, refreshLocalClients);
      window.removeEventListener(PROCESSES_UPDATED_EVENT, refreshLocalProcesses);
      window.removeEventListener(TASKS_UPDATED_EVENT, refreshLocalTasks);
      window.removeEventListener(AGENDA_UPDATED_EVENT, refreshLocalAgenda);
      window.removeEventListener(FINANCE_UPDATED_EVENT, refreshLocalFinance);
      window.removeEventListener(REPORTS_UPDATED_EVENT, refreshLocalReports);
      window.removeEventListener(PARTNERSHIPS_UPDATED_EVENT, refreshLocalPartnerships);
      window.removeEventListener(CENTRAL_EXECUTIONS_UPDATED_EVENT, refreshLocalCentral);
      window.removeEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, refreshLocalCentral);
    };
  }, []);

  useEffect(() => {
    function closeFloating(event: MouseEvent) {
      const target = event.target as Node;
      if (!searchRef.current?.contains(target)) setSearchOpen(false);
      if (!notificationRef.current?.contains(target))
        setNotificationsOpen(false);
    }
    function closeOnEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", closeFloating);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      document.removeEventListener("mousedown", closeFloating);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function navigate(route: string) {
    setSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
    router.push(route);
  }

  function markAsRead(id: number) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    );
    setToast("Notificação marcada como lida.");
  }

  function updateProfile() {
    setToast("Perfil atualizado na demonstração.");
  }

  function closeProfilePanel() {
    setProfileOpen(false);
    setProfileSection("Perfil do usuário");
  }

  const hasOverlayPanel = notificationsOpen;

  return (
    <header className="sticky top-0 z-40 border-b border-lexos-line/20 bg-lexos-ink/78 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:px-5">
      {hasOverlayPanel ? (
        <button
          aria-label="Fechar painel aberto"
          className="fixed inset-0 z-30 cursor-default bg-lexos-ink/55 backdrop-blur-[2px]"
          onClick={() => {
            setNotificationsOpen(false);
            setProfileOpen(false);
          }}
          type="button"
        />
      ) : null}

      <div className="relative z-40 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/dashboard">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-lexos-cyan">
            {workspace.product}
          </p>
          <p className="mt-1 hidden text-xs text-lexos-muted sm:block">
            Escritório | {session.workspace.name}
          </p>
        </Link>
        <div className="flex flex-1 flex-col gap-2 lg:max-w-4xl lg:flex-row lg:items-center lg:justify-end">
          <div className="relative flex-1" ref={searchRef}>
            <input
              aria-label="Busca global da demonstração"
              className="w-full rounded-[5px] border border-lexos-line/40 bg-lexos-navy/72 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-lexos-muted/80 hover:border-lexos-cyan/40 focus:border-lexos-cyan lg:min-w-[24rem]"
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
              onFocus={() => {
                setSearchOpen(true);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
              placeholder="Buscar ou executar ação..."
              value={query}
            />
            {searchOpen && query ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] max-h-[70vh] overflow-y-auto rounded-[8px] border border-lexos-cyan/24 bg-[#05111d]/[0.98] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.62)] premium-scrollbar ring-1 ring-white/5">
                {results.length ? (
                  <div className="space-y-3">
                    {Object.entries(groupedResults).map(([group, items]) => (
                      <div key={group}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.20em] text-lexos-gold">
                          {group}
                        </p>
                        <div className="space-y-1.5">
                          {items.slice(0, 4).map((item) => (
                            <button
                              className="w-full rounded-[6px] border border-lexos-line/65 bg-lexos-card/60 p-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-lexos-gold/60 hover:bg-lexos-card hover:shadow-glow"
                              key={`${item.type}-${item.title}`}
                              onClick={() => navigate(item.route)}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-white">
                                    {item.title}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-lexos-muted">
                                    {item.description}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs font-semibold text-lexos-gold">
                                  {item.action} →
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-lexos-gold/28 bg-lexos-ink/50 p-6 text-center">
                    <p className="font-semibold text-white">
                      Nenhum resultado encontrado na base da demonstração.
                    </p>
                    <p className="mt-2 text-sm text-lexos-muted">
                      Tente buscar por cliente, processo, prompt, dossiê,
                      agente, fluxo, playbook ou relatório.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <Link
            className="hidden rounded-[5px] bg-lexos-cyan px-3.5 py-2.5 text-sm font-semibold text-lexos-ink transition hover:brightness-110 lg:inline-flex"
            href="/central-lexos/dossie-rapido"
          >
            Novo dossiê
          </Link>

          <div className="relative" ref={notificationRef}>
            <button
              aria-label="Abrir notificações"
              className="w-full rounded-[5px] border border-lexos-line/40 bg-lexos-panel/46 px-3 py-2.5 text-sm font-medium text-lexos-silver transition hover:border-lexos-cyan/45 hover:bg-lexos-card/60 hover:text-white lg:w-auto"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setSearchOpen(false);
                setProfileOpen(false);
              }}
              type="button"
            >
              {unread} alertas
            </button>
            {notificationsOpen ? (
              <div className="fixed inset-x-3 top-24 z-[80] max-h-[calc(100vh-8rem)] overflow-hidden rounded-[8px] border border-lexos-cyan/24 bg-[#05111d]/[0.99] p-3 shadow-[0_32px_110px_rgba(0,0,0,0.72)] ring-1 ring-white/5 sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[min(92vw,27rem)]">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-lexos-line/80 pb-3">
                  <p className="font-semibold text-white">
                    {isSupabaseSession(session) ? "Notificações do escritório" : "Notificações simuladas"}
                  </p>
                  <span className="rounded-full border border-lexos-gold/30 px-3 py-1 text-xs text-lexos-gold">
                    {unread} não lidas
                  </span>
                </div>
                <div className="max-h-[calc(100vh-13rem)] space-y-3 overflow-y-auto pr-1 premium-scrollbar sm:max-h-[65vh]">
                  {!notifications.length ? (
                    <div className="rounded-2xl border border-dashed border-lexos-line bg-lexos-card/70 p-4 text-sm leading-6 text-lexos-muted">
                      Sem notificações nesta sessão. Alertas operacionais consolidados aparecem na Visão Geral com dados do escritório.
                    </div>
                  ) : null}
                  {notifications.map((notification) => (
                    <div
                      className={cn(
                        "rounded-[7px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-lexos-gold/45",
                        notification.read
                          ? "border-lexos-line/90 bg-[#111f35]/95"
                          : "border-lexos-gold/40 bg-[#182338]/95",
                      )}
                      key={notification.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">
                          {notification.category}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-1 text-[11px] font-semibold",
                            notification.priority === "urgente"
                              ? "border-lexos-wine text-lexos-red"
                              : "border-lexos-gold/40 text-lexos-goldSoft",
                          )}
                        >
                          {notification.priority}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-lexos-silver">
                        {notification.text}
                      </p>
                      <p className="mt-1 text-xs text-lexos-muted">
                        {notification.time}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-lexos-gold/45 bg-lexos-gold/8 px-3 py-2 text-xs font-semibold text-lexos-gold transition hover:bg-lexos-gold/14"
                          onClick={() => navigate(notification.route)}
                          type="button"
                        >
                          {notification.action}
                        </button>
                        {!notification.read ? (
                          <button
                            className="rounded-full border border-lexos-line px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white"
                            onClick={() => markAsRead(notification.id)}
                            type="button"
                          >
                            Marcar como lida
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              aria-label="Abrir perfil"
              className="w-full rounded-[5px] border border-lexos-gold/28 bg-lexos-card/70 px-3 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-lexos-gold hover:bg-lexos-gold/10 lg:w-auto"
              onClick={() => {
                setProfileOpen((open) => !open);
                setSearchOpen(false);
                setNotificationsOpen(false);
                setProfileSection("Perfil do usuário");
              }}
              type="button"
            >
              {session.user.name || "Usuário da demonstração"}
            </button>
            {profileOpen ? (
              <ProfileOverlay
                activeSection={profileSection}
                onClose={closeProfilePanel}
                onNavigateSettings={() => {
                  closeProfilePanel();
                  router.push("/configuracoes");
                }}
                onSectionChange={setProfileSection}
                onSimulatedSignOut={() => {
                  endDemoSession();
                  closeProfilePanel();
                  setToast("Sessão demonstrativa encerrada.");
                  router.push("/login");
                }}
                onUpdateProfile={updateProfile}
                profile={profile}
                setProfile={setProfile}
              />
            ) : null}
          </div>
        </div>
      </div>



      {toast ? (
        <div className="fixed right-4 top-24 z-[60] rounded-2xl border border-lexos-gold/40 bg-lexos-panel/98 px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium ring-1 ring-white/5">
          {toast}
        </div>
      ) : null}
    </header>
  );
}

type ProfileOverlayProps = {
  activeSection: ProfileSectionLabel;
  onClose: () => void;
  onNavigateSettings: () => void;
  onSectionChange: (section: ProfileSectionLabel) => void;
  onSimulatedSignOut: () => void;
  onUpdateProfile: () => void;
  profile: ProfileData;
  setProfile: Dispatch<SetStateAction<ProfileData>>;
};

function profileFieldLabel(key: keyof ProfileData) {
  if (key === "coBranding") return "Co-branding";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function ProfileOverlay({
  activeSection,
  onClose,
  onNavigateSettings,
  onSectionChange,
  onSimulatedSignOut,
  onUpdateProfile,
  profile,
  setProfile,
}: ProfileOverlayProps) {
  if (typeof document === "undefined") return null;

  const profileFields = Object.entries(profile) as [keyof ProfileData, string][];

  const content = (() => {
    if (activeSection === "Perfil do usuário") {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
              Perfil do usuário
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Dados executivos controlados
            </h2>
            <p className="mt-2 text-sm leading-6 text-lexos-muted">
              Edite informações fictícias da sócia gestora sem autenticação real
              ou conexão externa.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {profileFields.map(([key, value]) => (
              <label className="text-sm text-lexos-muted" key={key}>
                {profileFieldLabel(key)}
                <input
                  className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  value={value}
                />
              </label>
            ))}
          </div>
          <button
            className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/12 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:shadow-glow"
            onClick={onUpdateProfile}
            type="button"
          >
            Salvar preferência local
          </button>
        </div>
      );
    }

    if (activeSection === "Escritório") {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
              Escritório
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {profile.escritorio}
            </h2>
            <p className="mt-2 text-sm leading-6 text-lexos-muted">
              Ambiente premium para operação do LEX.OS Control.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Plano", profile.plano],
              ["Permissão", profile.permissao],
              ["Assinatura", profile.assinatura],
              ["Co-branding", profile.coBranding],
            ].map(([label, value]) => (
              <div
                className="rounded-2xl border border-lexos-line/85 bg-[#111f35]/92 p-4"
                key={label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold/85">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-6 text-lexos-silver">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <button
            className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/12 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:shadow-glow"
            onClick={onNavigateSettings}
            type="button"
          >
            Ir para Configurações
          </button>
        </div>
      );
    }

    if (activeSection === "Assinatura padrão") {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
              Assinatura padrão
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Modelo institucional simulado
            </h2>
          </div>
          <div className="rounded-3xl border border-lexos-gold/25 bg-[#111f35]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-base font-semibold text-white">{profile.nome}</p>
            <p className="mt-1 text-sm text-lexos-silver">
              {profile.cargo} • {profile.escritorio}
            </p>
            <p className="mt-3 text-sm leading-6 text-lexos-muted">
              {profile.assinatura}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-lexos-gold/80">
              {profile.coBranding}
            </p>
          </div>
          <label className="block text-sm text-lexos-muted">
            Nome da assinatura fictícia
            <input
              className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  assinatura: event.target.value,
                }))
              }
              value={profile.assinatura}
            />
          </label>
          <button
            className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/12 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:shadow-glow"
            onClick={onUpdateProfile}
            type="button"
          >
            Salvar assinatura simulada
          </button>
        </div>
      );
    }

    if (activeSection === "Preferências") {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
              Preferências
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Operação premium controlada
            </h2>
            <p className="mt-2 text-sm leading-6 text-lexos-muted">
              Preferências apenas visuais e locais, mantendo dados fictícios.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              "Tema dark navy com detalhes gold/silver",
              "Alertas executivos agrupados por prioridade",
              "Painéis seguros de viewport com rolagem interna",
            ].map((preference) => (
              <div
                className="flex items-center justify-between gap-4 rounded-2xl border border-lexos-line/85 bg-[#111f35]/92 p-4"
                key={preference}
              >
                <span className="text-sm leading-6 text-lexos-silver">
                  {preference}
                </span>
                <span className="rounded-full border border-lexos-gold/35 px-3 py-1 text-xs font-semibold text-lexos-gold">
                  Ativo
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
            Sair da demonstração
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Encerramento simulado
          </h2>
          <p className="mt-2 text-sm leading-6 text-lexos-muted">
            Esta ação limpa a sessão demonstrativa local e retorna para a tela
            de entrada. Nenhum serviço externo é acionado.
          </p>
        </div>
        <div className="rounded-3xl border border-lexos-gold/25 bg-[#111f35]/95 p-5 text-sm leading-6 text-lexos-silver">
          A sessão demonstrativa será removida do navegador, preservando dados da demonstração e sem encerrar autenticação real.
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/12 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:shadow-glow"
            onClick={onSimulatedSignOut}
            type="button"
          >
            Sair da demonstração
          </button>
          <button
            className="rounded-2xl border border-lexos-line bg-lexos-card px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold"
            onClick={() => onSectionChange("Perfil do usuário")}
            type="button"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  })();

  return createPortal(
    <>
      <button
        aria-label="Fechar painel de perfil"
        className="fixed inset-0 z-[90] cursor-default bg-lexos-ink/48 backdrop-blur-[2px]"
        onMouseDown={onClose}
        type="button"
      />
      <section
        aria-label="Painel de perfil da Dra. Helena Moraes"
        aria-modal="true"
        className="fixed left-4 right-4 top-[88px] z-[100] max-h-[calc(100vh-112px)] overflow-y-auto rounded-[2rem] border border-lexos-gold/35 bg-[#0a1424]/[0.99] p-4 text-left shadow-[0_34px_120px_rgba(0,0,0,0.76)] ring-1 ring-white/5 premium-scrollbar sm:left-auto sm:right-[clamp(16px,3vw,32px)] sm:w-[min(640px,calc(100vw-32px))] sm:p-5"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mb-5 flex flex-col gap-4 border-b border-lexos-line/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
              Perfil executivo
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {profile.nome}
            </p>
            <p className="mt-1 text-xs leading-5 text-lexos-muted">
              {profile.cargo} • {profile.escritorio}
            </p>
          </div>
          <button
            className="w-fit rounded-full border border-lexos-line bg-lexos-card px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[14rem_1fr]">
          <nav aria-label="Seções do perfil" className="space-y-1.5">
            {profileSections.map((item) => (
              <button
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-lexos-gold/45 hover:bg-[#14243b]/95",
                  activeSection === item.label
                    ? "border-lexos-gold/45 bg-lexos-gold/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-transparent text-lexos-silver",
                )}
                key={item.label}
                onClick={() => onSectionChange(item.label)}
                type="button"
              >
                <span className="block text-sm font-semibold">
                  {item.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-lexos-muted">
                  {item.description}
                </span>
              </button>
            ))}
          </nav>

          <div className="min-w-0 rounded-[1.5rem] border border-lexos-line/70 bg-lexos-panel/70 p-4 sm:p-5">
            {content}
          </div>
        </div>
      </section>
    </>,
    document.body,
  );
}
