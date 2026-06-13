"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, PaginationControls, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback, setPendingToast } from "@/lib/auth";
import { Client, listClientsAsync } from "@/lib/data/clients";
import {
  archiveProcessAsync,
  createProcessAsync,
  getProcessByIdAsync,
  listProcessesAsync,
  PROCESS_REAL_DATA_MODE_LABEL,
  Process,
  ProcessArea,
  ProcessInput,
  ProcessPriority,
  ProcessRisk,
  ProcessStatus,
  updateProcessAsync,
} from "@/lib/data/processes";
import { cn } from "@/lib/utils";

const PROCESS_PAGE_SIZE = 8;
const statuses: Array<ProcessStatus | "todos"> = ["todos", "ativo", "atenção", "suspenso", "arquivado", "encerrado"];
const risks: Array<ProcessRisk | "todos"> = ["todos", "baixo", "médio", "alto", "crítico"];
const areas: Array<ProcessArea | "todos"> = ["todos", "civel", "trabalhista", "consumidor", "previdenciario", "administrativo", "tributario", "penal", "familia", "outro"];
const priorities: ProcessPriority[] = ["baixa", "média", "alta", "urgente"];
const processStatuses: ProcessStatus[] = ["ativo", "atenção", "suspenso", "arquivado", "encerrado"];
const processRisks: ProcessRisk[] = ["baixo", "médio", "alto", "crítico"];
const processAreas: ProcessArea[] = ["civel", "trabalhista", "consumidor", "previdenciario", "administrativo", "tributario", "penal", "familia", "outro"];

const emptyForm: ProcessInput = {
  client_id: "",
  client_name: "",
  number: "",
  title: "",
  court: "",
  jurisdiction: "",
  area: "civel",
  phase: "",
  status: "ativo",
  risk: "médio",
  priority: "média",
  responsible: "",
  opposing_party: "",
  next_deadline_at: "",
  next_action: "",
  main_issue: "",
  notes: "",
};

type PanelMode = "details" | "create" | "edit";
type ProcessView = "operational" | "active" | "attention" | "upcoming" | "highRisk" | "suspended" | "archived";

function processMatchesView(process: Process, view: ProcessView) {
  if (view === "operational") return process.status !== "arquivado";
  if (view === "active") return process.status === "ativo";
  if (view === "attention") return process.status === "atenção";
  if (view === "suspended") return process.status === "suspenso";
  if (view === "archived") return process.status === "arquivado";
  if (view === "highRisk") return process.status !== "arquivado" && ["alto", "crítico"].includes(process.risk);
  if (view === "upcoming") return process.status !== "arquivado" && isUpcomingDeadline(process.next_deadline_at);
  return process.status !== "arquivado";
}

function processViewTitle(view: ProcessView) {
  const labels: Record<ProcessView, string> = {
    operational: "Processos em acompanhamento",
    active: "Processos ativos",
    attention: "Processos em atenção",
    upcoming: "Processos com prazo próximo",
    highRisk: "Processos de risco alto/crítico",
    suspended: "Processos suspensos",
    archived: "Processos arquivados",
  };
  return labels[view];
}

function isUpcomingDeadline(value: string) {
  if (!value) return false;
  const deadline = new Date(`${value}T23:59:59`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tenDays = new Date();
  tenDays.setHours(23, 59, 59, 999);
  tenDays.setDate(today.getDate() + 10);
  return deadline >= today && deadline <= tenDays;
}
function isOverdueDeadline(value: string) {
  if (!value) return false;
  const deadline = new Date(`${value}T23:59:59`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline < today;
}

function formatArea(area: ProcessArea | "todos") {
  const labels: Record<ProcessArea | "todos", string> = {
    todos: "todos",
    civel: "cível",
    trabalhista: "trabalhista",
    consumidor: "consumidor",
    previdenciario: "previdenciário",
    administrativo: "administrativo",
    tributario: "tributário",
    penal: "penal",
    familia: "família",
    outro: "outro",
  };
  return labels[area];
}

function formatDate(value: string) {
  if (!value) return "Sem prazo definido";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function daysSinceUpdate(updatedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)));
}

function needsExecutiveDecision(process: Process) {
  const noRecentUpdate = Date.now() - new Date(process.updated_at).getTime() > 1000 * 60 * 60 * 24 * 14;
  const sensitiveNextAction = /pendente|urgente|prioridade|decisão|prazo/i.test(process.next_action);
  const relevantPending = process.main_issue.toLowerCase().includes("pend") || process.notes.toLowerCase().includes("pend");
  return (
    process.status === "atenção" ||
    ["alto", "crítico"].includes(process.risk) ||
    isOverdueDeadline(process.next_deadline_at) ||
    isUpcomingDeadline(process.next_deadline_at) ||
    sensitiveNextAction ||
    noRecentUpdate ||
    relevantPending
  );
}

function getDeadlineState(value: string) {
  if (!value) return { label: "Sem prazo definido", tone: "neutral" as const };
  if (isOverdueDeadline(value)) return { label: `Prazo vencido: ${formatDate(value)}`, tone: "critical" as const };
  if (isUpcomingDeadline(value)) return { label: `Prazo próximo: ${formatDate(value)}`, tone: "warning" as const };
  return { label: `Prazo: ${formatDate(value)}`, tone: "neutral" as const };
}

function getPrefilledProcessForm(clients: Client[], clientId: string | null): ProcessInput {
  const selectedClient = clientId ? clients.find((client) => client.id === clientId) : undefined;
  const fallbackClient = selectedClient ?? clients[0];
  return fallbackClient ? { ...emptyForm, client_id: fallbackClient.id, client_name: fallbackClient.name, responsible: fallbackClient.owner } : emptyForm;
}

function toForm(process: Process): ProcessInput {
  return {
    client_id: process.client_id,
    client_name: process.client_name,
    number: process.number,
    title: process.title,
    court: process.court,
    jurisdiction: process.jurisdiction,
    area: process.area,
    phase: process.phase,
    status: process.status,
    risk: process.risk,
    priority: process.priority,
    responsible: process.responsible,
    opposing_party: process.opposing_party,
    next_deadline_at: process.next_deadline_at,
    next_action: process.next_action,
    main_issue: process.main_issue,
    notes: process.notes,
  };
}

export default function ProcessosPage() {
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProcessStatus | "todos">("todos");
  const [activeView, setActiveView] = useState<ProcessView>("operational");
  const [risk, setRisk] = useState<ProcessRisk | "todos">("todos");
  const [area, setArea] = useState<ProcessArea | "todos">("todos");
  const [responsible, setResponsible] = useState<string | "todos">("todos");
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [form, setForm] = useState<ProcessInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [archiveCandidate, setArchiveCandidate] = useState<Process | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function loadData() {
    const session = getCurrentSessionOrFallback();
    const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    const params = new URLSearchParams(window.location.search);
    setWorkspaceId(sessionWorkspaceId);
    const [nextProcesses, nextClients] = await Promise.all([listProcessesAsync(sessionWorkspaceId, { includeArchived: true }), listClientsAsync(sessionWorkspaceId)]);
    if (!active) return;
    setProcesses(nextProcesses);
    setClients(nextClients);

    const statusParam = params.get("status") as ProcessStatus | null;
    const processId = params.get("processId");
    const clientId = params.get("clientId");
    const action = params.get("action");
    if (statusParam && statuses.includes(statusParam)) handleStatusFilter(statusParam);
    if (processId) {
      const process = await getProcessByIdAsync(processId, sessionWorkspaceId);
      if (process) {
        setSelectedProcess(process);
        setForm(toForm(process));
        setPanelMode("details");
      }
    }
    if (action === "novo" || action === "nova") {
      setSelectedProcess(null);
      setForm(getPrefilledProcessForm(nextClients, clientId));
      setPanelMode("create");
    }
    setLoading(false);
    }
    loadData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredProcesses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return processes
      .filter((process) => processMatchesView(process, activeView))
      .filter((process) => (status === "todos" ? true : process.status === status))
      .filter((process) => (risk === "todos" ? true : process.risk === risk))
      .filter((process) => (area === "todos" ? true : process.area === area))
      .filter((process) => (responsible === "todos" ? true : process.responsible === responsible))
      .filter((process) => {
        if (!normalizedQuery) return true;
        return [process.number, process.client_name, process.opposing_party, process.responsible, process.title, process.main_issue, process.next_action]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [activeView, area, processes, query, responsible, risk, status]);
  useEffect(() => {
    setPage(1);
  }, [activeView, area, query, responsible, risk, status]);

  const visibleProcesses = useMemo(() => filteredProcesses.slice((page - 1) * PROCESS_PAGE_SIZE, page * PROCESS_PAGE_SIZE), [filteredProcesses, page]);

  const stats = useMemo(() => {
    const overdue = processes.filter((process) => process.status !== "arquivado" && isOverdueDeadline(process.next_deadline_at)).length;
    const upcoming = processes.filter((process) => process.status !== "arquivado" && isUpcomingDeadline(process.next_deadline_at)).length;
    const deadlineLabel = overdue > 0 ? "Prazos vencidos" : upcoming > 0 ? "Prazos próximos" : "Sem prazo crítico";
    const deadlineValue = overdue > 0 ? overdue : upcoming > 0 ? upcoming : 0;
    const deadlineDetail = overdue > 0 ? "exigem reação imediata" : upcoming > 0 ? "próximos 10 dias" : "sem urgência de prazo";
    const deadlineTone = overdue > 0 ? "urgent" : upcoming > 0 ? "warning" : "neutral";
    return [
      { view: "active" as const, label: "Processos ativos", value: String(processes.filter((process) => processMatchesView(process, "active")).length), detail: "em acompanhamento", tone: "positive" },
      { view: "attention" as const, label: "Em atenção", value: String(processes.filter((process) => processMatchesView(process, "attention")).length), detail: "pedem decisão", tone: "warning" },
      { view: "upcoming" as const, label: deadlineLabel, value: String(deadlineValue), detail: deadlineDetail, tone: deadlineTone },
      { view: "highRisk" as const, label: "Risco alto/crítico", value: String(processes.filter((process) => processMatchesView(process, "highRisk")).length), detail: "priorização jurídica", tone: "premium" },
      { view: "suspended" as const, label: "Suspensos", value: String(processes.filter((process) => processMatchesView(process, "suspended")).length), detail: "pausados", tone: "neutral" },
      { view: "archived" as const, label: "Arquivados", value: String(processes.filter((process) => processMatchesView(process, "archived")).length), detail: "fora da operação", tone: "neutral" },
    ];
  }, [processes]);
  const responsibleOptions = useMemo(() => Array.from(new Set(processes.map((process) => process.responsible).filter(Boolean))).sort(), [processes]);
  const decisionProcesses = useMemo(() => processes.filter((process) => process.status !== "arquivado" && needsExecutiveDecision(process)).slice(0, 5), [processes]);
  const activeCount = processes.filter((process) => process.status === "ativo").length;
  const overdueCount = processes.filter((process) => process.status !== "arquivado" && isOverdueDeadline(process.next_deadline_at)).length;
  const upcomingCount = processes.filter((process) => isUpcomingDeadline(process.next_deadline_at) && process.status !== "arquivado").length;
  const highRiskCount = processes.filter((process) => ["alto", "crítico"].includes(process.risk) && process.status !== "arquivado").length;
  const hasActiveFilters = Boolean(query.trim()) || status !== "todos" || risk !== "todos" || area !== "todos" || responsible !== "todos" || activeView !== "operational";

  function activateShortcut(view: ProcessView) {
    setActiveView(view);
    setStatus(view === "archived" ? "arquivado" : view === "active" ? "ativo" : view === "attention" ? "atenção" : view === "suspended" ? "suspenso" : "todos");
    setRisk("todos");
  }

  function handleStatusFilter(value: string) {
    const nextStatus = value as ProcessStatus | "todos";
    setStatus(nextStatus);
    if (nextStatus === "ativo") setActiveView("active");
    else if (nextStatus === "atenção") setActiveView("attention");
    else if (nextStatus === "suspenso") setActiveView("suspended");
    else if (nextStatus === "arquivado") setActiveView("archived");
    else setActiveView("operational");
  }

  async function refresh(message?: string) {
    setProcesses(await listProcessesAsync(workspaceId, { includeArchived: true }));
    setClients(await listClientsAsync(workspaceId));
    if (message) {
      setToast(message);
      setPendingToast(message);
    }
  }

  function openCreatePanel() {
    setSelectedProcess(null);
    setForm(getPrefilledProcessForm(clients, null));
    setFormError(null);
    setPanelMode("create");
  }

  function openDetails(process: Process) {
    setSelectedProcess(process);
    setForm(toForm(process));
    setFormError(null);
    setPanelMode("details");
  }

  function openEdit(process: Process) {
    setSelectedProcess(process);
    setForm(toForm(process));
    setFormError(null);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedProcess(null);
    setFormError(null);
  }

  function validateForm() {
    if (!form.number.trim()) return "Informe o número do processo.";
    if (!form.title.trim()) return "Informe um título ou identificação interna.";
    if (!form.responsible.trim()) return "Informe o responsável pelo acompanhamento.";
    if (!form.next_action.trim()) return "Informe a próxima ação operacional.";
    return null;
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    (async () => {
      try {
        if (panelMode === "edit" && selectedProcess) {
          const updated = await updateProcessAsync(selectedProcess.id, form, workspaceId);
          if (updated) setSelectedProcess(updated);
          await refresh("Processo atualizado no ambiente atual.");
          setPanelMode("details");
        } else {
          const created = await createProcessAsync(form, workspaceId);
          setSelectedProcess(created);
          await refresh("Processo cadastrado no ambiente atual.");
          setPanelMode("details");
        }
      } catch {
        setFormError("Não foi possível salvar o processo. Verifique as permissões do escritório e tente novamente.");
      } finally {
        setSaving(false);
      }
    })();
  }

  function requestArchive(process: Process) {
    setArchiveCandidate(process);
  }

  async function confirmArchive() {
    if (!archiveCandidate) return;
    const archived = await archiveProcessAsync(archiveCandidate.id, workspaceId);
    if (archived) {
      await refresh("Processo arquivado no ambiente atual.");
      closePanel();
    }
    setArchiveCandidate(null);
  }

  return (
    <AppLayout>
      <div className="calm-workspace mx-auto max-w-[1540px] space-y-7 pb-4">
        {toast ? <div className="fixed right-4 top-24 z-[90] max-w-sm rounded-2xl border border-lexos-gold/40 bg-[#0b1728]/95 p-4 text-sm font-semibold text-lexos-gold shadow-premium ring-1 ring-white/5">{toast}</div> : null}

        <section className="calm-hero">
          <div className="grid gap-4 xl:grid-cols-[1.55fr_0.75fr] xl:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Processos • acompanhamento executivo</p>
              <h1 className="mt-2 max-w-4xl text-2xl font-semibold text-white lg:text-3xl">Central processual para priorizar risco, prazo, responsáveis e próximas providências.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-5 text-lexos-muted">Visão operacional da carteira viva para sócios e advogados tomarem decisões rápidas. {PROCESS_REAL_DATA_MODE_LABEL}</p>
              <p className="mt-3 rounded-xl border border-lexos-gold/20 bg-lexos-ink/45 px-3.5 py-2.5 text-sm text-lexos-silver">Hoje a carteira exige atenção em <span className="font-semibold text-lexos-goldSoft">{decisionProcesses.length}</span> processo(s), <span className="font-semibold text-lexos-red">{overdueCount}</span> prazo(s) vencido(s), <span className="font-semibold text-lexos-goldSoft">{upcomingCount}</span> prazo(s) próximo(s) e <span className="font-semibold text-lexos-goldSoft">{highRiskCount}</span> item(ns) de risco alto/crítico.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><div className="rounded-xl border border-lexos-green/40 bg-lexos-green/10 p-3"><p className="text-xs uppercase tracking-[0.18em] text-lexos-green">Carteira ativa</p><p className="mt-2 text-2xl font-semibold text-white">{activeCount}</p></div><div className="flex flex-wrap gap-3"><Link className="calm-secondary-action" href="/processos/parcerias">Parcerias</Link><button className="calm-primary-action" onClick={openCreatePanel} type="button">Novo processo</button></div></div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{stats.map((stat) => <ProcessShortcutCard active={activeView === stat.view} key={stat.label} onClick={() => activateShortcut(stat.view)} {...stat} />)}</section>

        <SectionCard eyebrow="Controle processual" title="Busca, filtros e responsáveis">
          <div className="space-y-3">
            <input className="w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente, parte contrária, responsável, tese/assunto ou pendência..." value={query} />
            <div className="grid gap-2.5 lg:grid-cols-4">
              <Select label="Status" value={status} onChange={handleStatusFilter} options={statuses.map((item) => [item, item])} />
              <Select label="Risco" value={risk} onChange={(value) => setRisk(value as ProcessRisk | "todos")} options={risks.map((item) => [item, item])} />
              <Select label="Área" value={area} onChange={(value) => setArea(value as ProcessArea | "todos")} options={areas.map((item) => [item, formatArea(item)])} />
              <Select label="Responsável" value={responsible} onChange={setResponsible} options={[["todos", "todos"], ...responsibleOptions.map((item) => [item, item] as [string, string])]} />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip label="Em atenção" active={status === "atenção"} onClick={() => handleStatusFilter("atenção")} />
              <FilterChip label="Risco alto/crítico" active={activeView === "highRisk" || risk === "alto" || risk === "crítico"} onClick={() => activateShortcut("highRisk")} />
              <FilterChip label="Próximos 10 dias" active={activeView === "upcoming"} onClick={() => activateShortcut("upcoming")} />
              {hasActiveFilters ? <button className="rounded-full border border-lexos-line px-3 py-1 text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" onClick={() => { setQuery(""); setStatus("todos"); setRisk("todos"); setArea("todos"); setResponsible("todos"); setActiveView("operational"); }} type="button">Limpar filtros</button> : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Prioridade do sócio" title="Processos que exigem decisão">
          {decisionProcesses.length ? (
            <div className="grid gap-2.5 xl:grid-cols-2">
              {decisionProcesses.map((process) => (
                <article className="calm-priority-card text-left" key={process.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-cyan">{formatArea(process.area)} • {process.phase || "fase não informada"}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{process.client_name}</p>
                      <p className="text-xs text-lexos-muted">{process.number}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2"><StatusBadge status={process.status} /><StatusBadge status={`risco ${process.risk}`} /></div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-lexos-goldSoft">Próxima providência: {process.next_action || "Definir providência imediata"}</p>
                  <p className="mt-2 text-xs font-semibold text-lexos-red">{isOverdueDeadline(process.next_deadline_at) ? "Prazo vencido" : isUpcomingDeadline(process.next_deadline_at) ? "Prazo sensível" : ["alto", "crítico"].includes(process.risk) ? "Risco alto" : "Exige decisão"}</p>
                  <div className="mt-2 grid gap-1 text-xs text-lexos-muted sm:grid-cols-3">
                    <p>{getDeadlineState(process.next_deadline_at).label}</p>
                    <p>Responsável: {process.responsible || "não definido"}</p>
                    <p>Parte contrária: {process.opposing_party || "não informada"}</p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button className="rounded-lg border border-lexos-gold/45 px-2.5 py-1.5 text-xs font-semibold text-lexos-gold hover:bg-lexos-gold/10" onClick={() => openDetails(process)} type="button">Abrir processo</button>
                    <button className="rounded-lg border border-lexos-line px-2.5 py-1.5 text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" onClick={() => setToast("Andamento registrado para acompanhamento do processo prioritário.")} type="button">Registrar andamento</button>
                    <Link className="rounded-lg border border-lexos-line px-2.5 py-1.5 text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" href={`/tarefas?processId=${process.id}&action=nova`}>Criar tarefa</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhum processo exige decisão imediata." description="Continue acompanhando a carteira ativa abaixo." />
          )}
        </SectionCard>

        <SectionCard eyebrow="Carteira" title={processViewTitle(activeView)} action={!loading ? <span className="rounded-full border border-lexos-cyan/35 px-3 py-1 text-xs font-semibold text-lexos-cyan">{filteredProcesses.length} processo(s)</span> : null}>
          {loading ? <EmptyState title="Carregando processos do escritório..." description="Preparando a carteira do escritório atual." /> : filteredProcesses.length ? (
            <div className="space-y-3">
              <PaginationControls currentPage={page} onPageChange={setPage} pageSize={PROCESS_PAGE_SIZE} totalItems={filteredProcesses.length} />
              <div className="grid gap-3 xl:grid-cols-2">
              {visibleProcesses.map((process) => (
                <article className="calm-record-card" key={process.id}>
                  <button className="w-full text-left" onClick={() => openDetails(process)} type="button">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.20em] text-lexos-cyan">{formatArea(process.area)} • {process.phase}</p>
                        <h2 className="mt-1.5 text-lg font-semibold text-white">{process.client_name}</h2>
                        <p className="mt-1 text-sm text-lexos-muted">{process.number}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end"><StatusBadge status={process.status} /><StatusBadge status={`risco ${process.risk}`} /></div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <QuickInfo label="Responsável" value={process.responsible} />
                      <QuickInfo label="Prazo" value={getDeadlineState(process.next_deadline_at).label} highlight={getDeadlineState(process.next_deadline_at).tone !== "neutral"} />
                      <QuickInfo label="Próxima providência" value={process.next_action || "Definir providência"} major />
                      <QuickInfo label="Parte contrária" value={process.opposing_party || "Não informada"} />
                    </div>
                  </button>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button className="rounded-xl border border-lexos-gold/40 px-3 py-2 text-xs font-semibold text-lexos-gold hover:bg-lexos-gold/10" onClick={() => openDetails(process)} type="button">Abrir processo</button>
                    <Link className="rounded-xl border border-lexos-line px-3 py-2 text-center text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" href={`/tarefas?processId=${process.id}&action=nova`}>Criar tarefa</Link>
                    <button className="rounded-xl border border-lexos-line px-3 py-2 text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" onClick={() => { setSelectedProcess(process); setToast("Andamento demonstrativo registrado sem envio externo."); }} type="button">Registrar andamento</button>
                    <button className="rounded-xl border border-lexos-line px-3 py-2 text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" onClick={() => openEdit(process)} type="button">Lançar prazo</button>
                    <Link className="rounded-xl border border-lexos-line px-3 py-2 text-center text-xs font-semibold text-lexos-silver hover:border-lexos-gold hover:text-lexos-gold" href={`/clientes?clientId=${process.client_id}`}>Ver cliente</Link>
                    <button className="rounded-xl border border-lexos-wine/45 px-3 py-2 text-xs font-semibold text-lexos-red/90 hover:bg-lexos-wine/15" onClick={() => requestArchive(process)} type="button">Arquivar processo</button>
                  </div>
                </article>
              ))}
              </div>
              <PaginationControls currentPage={page} onPageChange={setPage} pageSize={PROCESS_PAGE_SIZE} totalItems={filteredProcesses.length} />
            </div>
          ) : <EmptyState title="Não há processos cadastrados ainda." description="A primeira recomendação é cadastrar os processos ativos e associá-los aos clientes responsáveis." actionLabel="Cadastrar processo" onAction={openCreatePanel} />}
        </SectionCard>
      </div>

      {panelMode ? <ProcessPanel clients={clients} form={form} formError={formError} mode={panelMode} process={selectedProcess} onArchive={requestArchive} onClose={closePanel} onEdit={() => selectedProcess && openEdit(selectedProcess)} onFormChange={setForm} onSubmit={submitForm} saving={saving} /> : null}
      {archiveCandidate ? <ArchiveProcessModal process={archiveCandidate} onCancel={() => setArchiveCandidate(null)} onConfirm={confirmArchive} /> : null}
    </AppLayout>
  );
}

function ProcessShortcutCard({ active, detail, label, onClick, tone, value }: { active: boolean; detail: string; label: string; onClick: () => void; tone: string; value: string }) {
  const tones: Record<string, string> = { neutral: "text-lexos-silver", urgent: "text-lexos-red", warning: "text-lexos-goldSoft", positive: "text-lexos-green", premium: "text-lexos-cyan" };
  return <button className={cn("calm-metric-card text-left", tones[tone], active ? "bg-lexos-cyan/[0.09] ring-1 ring-lexos-cyan/45" : "")} onClick={onClick} type="button"><p className="text-xs font-medium uppercase tracking-[0.12em] text-lexos-muted">{label}</p><p className="mt-1.5 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em]">{detail}</p>{active ? <p className="mt-1.5 text-[11px] font-semibold text-lexos-cyan">Filtro ativo</p> : null}</button>;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", active ? "border-lexos-gold/60 bg-lexos-gold/10 text-lexos-goldSoft" : "border-lexos-line text-lexos-silver hover:border-lexos-gold/40")} onClick={onClick} type="button">{label}</button>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="text-sm text-lexos-muted">{label}<select className="mt-1.5 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-3.5 py-2.5 text-white outline-none focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="text-sm text-lexos-muted">{label}<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} /></label>;
}

function QuickInfo({ label, value, highlight, major }: { label: string; value: string; highlight?: boolean; major?: boolean }) {
  return <div className={cn("rounded-xl bg-white/[0.028] p-2.5", major ? "bg-lexos-cyan/[0.055]" : "")}><p className="text-lexos-muted">{label}</p><p className={cn("mt-1 font-semibold", highlight ? "text-lexos-goldSoft" : "text-white", major ? "text-sm leading-5 text-lexos-cyan" : "")}>{value}</p></div>;
}

function ProcessPanel({ clients, form, formError, mode, process, onArchive, onClose, onEdit, onFormChange, onSubmit, saving }: { clients: Client[]; form: ProcessInput; formError: string | null; mode: PanelMode; process: Process | null; onArchive: (process: Process) => void; onClose: () => void; onEdit: () => void; onFormChange: (form: ProcessInput) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  const isForm = mode === "create" || mode === "edit";

  function updateClient(value: string) {
    const client = clients.find((item) => item.id === value);
    onFormChange({ ...form, client_id: value, client_name: client?.name ?? "", responsible: form.responsible || client?.owner || "" });
  }

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-lexos-ink/78 p-4 backdrop-blur-sm"><div className="mx-auto my-6 max-w-6xl rounded-[1.8rem] border border-lexos-gold/30 bg-[#0b1728] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5 lg:p-7">
    <div className="mb-5 flex flex-col gap-3 border-b border-lexos-line/80 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{isForm ? "Ficha processual" : "Detalhes do processo"}</p><h2 className="mt-2 text-2xl font-semibold text-white">{mode === "create" ? "Novo processo" : process?.number}</h2><p className="mt-2 text-sm leading-5 text-lexos-muted">No ambiente do escritório, estes dados ficam vinculados à operação atual; na demonstração, continuam locais.</p></div><button className="rounded-full border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Fechar</button></div>
    {isForm ? <form className="space-y-5" onSubmit={onSubmit}>{formError ? <div className="rounded-2xl border border-lexos-wine/55 bg-lexos-wine/12 p-3 text-sm text-lexos-red">{formError}</div> : null}{!clients.length ? <div className="rounded-2xl border border-lexos-gold/30 bg-lexos-gold/10 p-4 text-sm text-lexos-goldSoft">Nenhum cliente cadastrado ainda. Cadastre um cliente para vincular ao processo.</div> : null}<div className="grid gap-4 md:grid-cols-2">
      <Select label="Cliente vinculado" value={form.client_id} onChange={updateClient} options={[["", "Sem cliente vinculado"], ...clients.map((client) => [client.id, client.name] as [string, string])]} />
      <Field label="Número do processo" value={form.number} onChange={(value) => onFormChange({ ...form, number: value })} placeholder="0000000-00.0000.0.00.0000" />
      <Field label="Título/identificação interna" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} placeholder="Ex.: Ação indenizatória estratégica" />
      <Field label="Tribunal/órgão" value={form.court} onChange={(value) => onFormChange({ ...form, court: value })} placeholder="TJSP, TRT, TRF, órgão administrativo..." />
      <Field label="Comarca/foro/jurisdição" value={form.jurisdiction} onChange={(value) => onFormChange({ ...form, jurisdiction: value })} placeholder="Foro Central/SP" />
      <Select label="Área" value={form.area} onChange={(value) => onFormChange({ ...form, area: value as ProcessArea })} options={processAreas.map((item) => [item, formatArea(item)])} />
      <Field label="Fase" value={form.phase} onChange={(value) => onFormChange({ ...form, phase: value })} placeholder="Conhecimento, réplica, instrução..." />
      <Select label="Status" value={form.status} onChange={(value) => onFormChange({ ...form, status: value as ProcessStatus })} options={processStatuses.map((item) => [item, item])} />
      <Select label="Risco" value={form.risk} onChange={(value) => onFormChange({ ...form, risk: value as ProcessRisk })} options={processRisks.map((item) => [item, item])} />
      <Select label="Prioridade" value={form.priority} onChange={(value) => onFormChange({ ...form, priority: value as ProcessPriority })} options={priorities.map((item) => [item, item])} />
      <Field label="Responsável" value={form.responsible} onChange={(value) => onFormChange({ ...form, responsible: value })} placeholder="Dra. Marina Almeida" />
      <Field label="Parte contrária" value={form.opposing_party} onChange={(value) => onFormChange({ ...form, opposing_party: value })} placeholder="Nome da parte contrária" />
      <Field label="Próximo prazo" value={form.next_deadline_at} onChange={(value) => onFormChange({ ...form, next_deadline_at: value })} placeholder="" type="date" />
      <Field label="Próxima providência" value={form.next_action} onChange={(value) => onFormChange({ ...form, next_action: value })} placeholder="Protocolar peça, cobrar documentos..." />
    </div><Field label="Assunto principal" value={form.main_issue} onChange={(value) => onFormChange({ ...form, main_issue: value })} placeholder="Tese, risco, pendência principal ou objetivo operacional" /><label className="block text-sm text-lexos-muted">Observações<textarea className="mt-2 min-h-24 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" onChange={(event) => onFormChange({ ...form, notes: event.target.value })} placeholder="Contexto jurídico, próximos cuidados e histórico relevante..." value={form.notes} /></label><div className="flex flex-wrap justify-end gap-3 border-t border-lexos-line/80 pt-5"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Cancelar</button><button className="rounded-xl border border-lexos-gold/60 bg-lexos-gold px-4 py-2.5 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft disabled:cursor-not-allowed disabled:opacity-70" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar processo"}</button></div></form> : process ? <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"><div className="space-y-4"><div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-lexos-cyan">{formatArea(process.area)} • {process.phase}</p><h3 className="mt-2 text-xl font-semibold text-white">{process.title}</h3><p className="mt-1 text-sm text-lexos-muted">{process.client_name} x {process.opposing_party || "parte contrária não informada"}</p></div><div className="flex flex-wrap gap-2"><StatusBadge status={process.status} /><StatusBadge status={`risco ${process.risk}`} /></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Número" value={process.number} /><Info label="Cliente vinculado" value={process.client_name} /><Info label="Tribunal/órgão" value={process.court || "Não informado"} /><Info label="Comarca/foro" value={process.jurisdiction || "Não informado"} /><Info label="Prioridade" value={process.priority} /><Info label="Responsável" value={process.responsible} /><Info label="Próximo prazo" value={formatDate(process.next_deadline_at)} /><Info label="Próxima providência" value={process.next_action} /></div><div className="mt-4 rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4"><p className="text-sm text-lexos-muted">Assunto principal</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{process.main_issue || "Sem assunto registrado."}</p><p className="mt-2.5 text-sm text-lexos-muted">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{process.notes || "Sem observações registradas."}</p></div></div><div className="flex flex-wrap gap-3"><button className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/18" onClick={onEdit} type="button">Editar dados</button><button className="rounded-2xl border border-lexos-wine/55 px-4 py-3 text-sm font-semibold text-lexos-red transition hover:bg-lexos-wine/14" onClick={() => onArchive(process)} type="button">Arquivar processo</button></div></div><div className="space-y-4"><LinkedSection title="Vínculos reais do processo" items={["Use Tarefas, Agenda e Financeiro para criar vínculos reais a este processo."]} /></div></div> : null}
  </div></div>;
}

function ArchiveProcessModal({ process, onCancel, onConfirm }: { process: Process; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Confirmação</p><h2 className="mt-3 text-2xl font-semibold text-white">Arquivar processo</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Este processo será marcado como arquivado no ambiente atual. O registro não será excluído.</p><div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Processo selecionado</p><p className="mt-2 text-lg font-semibold text-white">{process.number}</p><p className="mt-1 text-sm text-lexos-muted">Cliente: {process.client_name}</p></div></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-wine/65 bg-lexos-wine/18 px-5 py-3 text-sm font-semibold text-lexos-red transition hover:-translate-y-0.5 hover:bg-lexos-wine/26 hover:shadow-[0_18px_48px_rgba(122,27,54,0.22)]" onClick={onConfirm} type="button">Arquivar processo</button></div></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-line/70 bg-lexos-ink/55 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">{label}</p><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>;
}

function LinkedSection({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5"><p className="font-semibold text-white">{title}</p><div className="mt-3 space-y-2">{items.map((item) => <p className="rounded-2xl border border-lexos-line/65 bg-lexos-ink/55 p-3 text-sm leading-6 text-lexos-silver" key={item}>{item}</p>)}</div></div>;
}
