"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, PaginationControls, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import { listClientsAsync, type Client } from "@/lib/data/clients";
import { listProcessesAsync, type Process } from "@/lib/data/processes";
import { listTasksAsync, type Task } from "@/lib/data/tasks";
import {
  AGENDA_REAL_DATA_MODE_LABEL,
  AGENDA_UPDATED_EVENT,
  archiveAgendaEventAsync,
  cancelAgendaEventAsync,
  completeAgendaEventAsync,
  createAgendaEventAsync,
  eventMatchesView,
  getAgendaEventByIdAsync,
  listAgendaEventsAsync,
  rescheduleAgendaEventAsync,
  updateAgendaEventAsync,
  type AgendaEvent,
  type AgendaEventType,
  type AgendaInput,
  type AgendaPriority,
  type AgendaView,
} from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

const AGENDA_PAGE_SIZE = 8;
const viewLabels: Record<AgendaView, string> = { operacional: "Agenda operacional", hoje: "Hoje", semana: "Próximos 7 dias", prazos: "Prazos vinculados", audiencias: "Audiências/atos externos", reunioes: "Reuniões internas/externas", followups: "Follow-ups de relacionamento", concluidos: "Concluídos no período", arquivados: "Cancelados/arquivados" };
const eventTypes: AgendaEventType[] = ["prazo", "audiencia", "reuniao", "atendimento", "follow_up", "interno", "financeiro", "outro"];
const priorities: AgendaPriority[] = ["baixa", "média", "alta", "urgente", "máxima"];

const emptyForm: AgendaInput = {
  title: "",
  description: "",
  type: "reuniao",
  status: "agendado",
  priority: "média",
  responsible: "Dra. Helena",
  starts_at: "2026-05-13T14:00",
  ends_at: "",
  reminder_at: "",
  location: "",
  next_action: "",
  notes: "",
  client_id: "",
  client_name: "",
  process_id: "",
  process_number: "",
  task_id: "",
};

type ConfirmAction = "cancelar" | "arquivar";
type MetricFilter = "temporais" | "criticos" | "derivados" | "proxima" | "compromissos" | "sem_responsavel" | "finalizados" | "vencidos";
type TemporalStatus = "vencido" | "hoje" | "futuro" | "sem_data";

const metricTitles: Record<MetricFilter, string> = {
  temporais: "Itens temporais ativos",
  criticos: "Itens críticos",
  derivados: "Derivados de tarefas/processos",
  proxima: "Alerta temporal",
  compromissos: "Audiências e reuniões",
  sem_responsavel: "Eventos sem responsável",
  finalizados: "Concluídos e cancelados",
  vencidos: "Providências vencidas",
};

export default function AgendaPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [activeView, setActiveView] = useState<AgendaView>("semana");
  const [activeMetric, setActiveMetric] = useState<MetricFilter | null>(null);
  const [modeInfoOpen, setModeInfoOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AgendaEventType | "todos" | "tarefa_derivada" | "processo_derivado">("todos");
  const [periodFilter, setPeriodFilter] = useState<"todos" | "hoje" | "7dias" | "30dias" | "vencidos">("todos");
  const [priorityFilter, setPriorityFilter] = useState<AgendaPriority | "todas">("todas");
  const [responsibleFilter, setResponsibleFilter] = useState<string | "todos">("todos");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<AgendaEvent | null>(null);
  const [editing, setEditing] = useState<AgendaEvent | "new" | null>(null);
  const [rescheduling, setRescheduling] = useState<AgendaEvent | null>(null);
  const [confirming, setConfirming] = useState<{ event: AgendaEvent; action: ConfirmAction } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh(nextWorkspaceId = workspaceId) {
    const [nextEvents, nextClients, nextProcesses, nextTasks] = await Promise.all([
      listAgendaEventsAsync(nextWorkspaceId),
      listClientsAsync(nextWorkspaceId),
      listProcessesAsync(nextWorkspaceId, { includeArchived: false }),
      listTasksAsync(nextWorkspaceId, { status: "todas", includeArchived: false }),
    ]);
    setEvents(nextEvents);
    setClients(nextClients);
    setProcesses(nextProcesses);
    setTasks(nextTasks);
  }

  useEffect(() => {
    let active = true;
    const session = getCurrentSessionOrFallback();
    const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    async function loadData() {
    setWorkspaceId(sessionWorkspaceId);
    await refresh(sessionWorkspaceId);
    if (!active) return;
    setLoading(false);

    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") as AgendaView | null;
    const eventId = params.get("eventId");
    const action = params.get("action");
    if (view && viewLabels[view]) setActiveView(view);
    if (eventId) setSelected(await getAgendaEventByIdAsync(eventId, sessionWorkspaceId));
    if (action === "novo") setEditing("new");

    }
    loadData();
    function onAgendaUpdate() { void refresh(sessionWorkspaceId); }
    window.addEventListener(AGENDA_UPDATED_EVENT, onAgendaUpdate);
    window.addEventListener("lexos:tasks-updated", onAgendaUpdate);
    window.addEventListener("lexos:processes-updated", onAgendaUpdate);
    return () => {
      window.removeEventListener(AGENDA_UPDATED_EVENT, onAgendaUpdate);
      window.removeEventListener("lexos:tasks-updated", onAgendaUpdate);
      window.removeEventListener("lexos:processes-updated", onAgendaUpdate);
      active = false;
    };
  // A carga inicial precisa rodar apenas uma vez para hidratar a sessão demo e registrar listeners locais.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const operational = events.filter(isOperationalEvent);
  const riskEvents = operational.filter(isRiskMaximumEvent);
  const derivedEvents = events.filter(isDerivedEvent);
  const manualEvents = events.filter((event) => !isDerivedEvent(event));
  const todayEvents = events.filter((event) => eventMatchesView(event, "hoje"));
  const weekEvents = events.filter((event) => eventMatchesView(event, "semana"));
  const meetingEvents = events.filter((event) => isOperationalEvent(event) && ["audiencia", "reuniao"].includes(event.type));
  const unassignedEvents = operational.filter((event) => !event.responsible.trim());
  const finishedEvents = events.filter((event) => ["concluido", "cancelado", "arquivado"].includes(event.status));
  const overdueEvents = operational.filter((event) => getTemporalStatus(event) === "vencido");
  const linkedDeadlineEvents = events.filter((event) => eventMatchesView(event, "prazos"));
  const followUpEvents = events.filter((event) => eventMatchesView(event, "followups"));
  const nextOverdueEvent = pickTemporalPriority(overdueEvents);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return events
      .filter((event) => (activeMetric ? eventMatchesMetric(event, activeMetric) : eventMatchesView(event, activeView)))
      .filter((event) => eventMatchesType(event, typeFilter))
      .filter((event) => eventMatchesPeriod(event, periodFilter))
      .filter((event) => (priorityFilter !== "todas" ? event.priority === priorityFilter : true))
      .filter((event) => (responsibleFilter !== "todos" ? event.responsible === responsibleFilter : true))
      .filter((event) => !text || [event.title, event.client_name, event.process_number, event.responsible, event.type, event.description, event.next_action, event.notes].join(" ").toLowerCase().includes(text));
  }, [activeMetric, activeView, events, periodFilter, priorityFilter, query, responsibleFilter, typeFilter]);
  const responsibles = Array.from(new Set(events.map((event) => event.responsible).filter(Boolean))).sort();
  const listTitle = activeMetric ? metricTitles[activeMetric] : viewLabels[activeView];

  useEffect(() => {
    setPage(1);
  }, [activeMetric, activeView, periodFilter, priorityFilter, query, responsibleFilter, typeFilter]);

  const visibleEvents = useMemo(() => filtered.slice((page - 1) * AGENDA_PAGE_SIZE, page * AGENDA_PAGE_SIZE), [filtered, page]);

  function applyView(view: AgendaView) {
    setActiveMetric(null);
    setActiveView(view);
    router.replace(`/agenda?view=${view}`, { scroll: false });
  }

  function applyMetric(metric: MetricFilter) {
    setActiveMetric(metric);
    router.replace("/agenda", { scroll: false });
  }

  function showToast(message: string) { setToast(message); }

  function saveEvent(input: AgendaInput, current?: AgendaEvent) {
    setSaving(true);
    window.setTimeout(async () => {
      if (current?.id) {
        const updated = await updateAgendaEventAsync(current.id, input, workspaceId);
        setSelected(updated);
        showToast("Compromisso atualizado no modo de dados atual.");
      } else {
        await createAgendaEventAsync(input, workspaceId);
        setSelected(null);
        showToast("Compromisso cadastrado no modo de dados atual.");
      }
      await refresh();
      setEditing(null);
      setSaving(false);
    }, 350);
  }

  async function complete(event: AgendaEvent) {
    const updated = await completeAgendaEventAsync(event.id, workspaceId);
    await refresh();
    setSelected(updated);
    showToast("Compromisso concluído no modo de dados atual.");
  }

  async function reschedule(event: AgendaEvent, dates: { starts_at: string; ends_at?: string; reminder_at?: string }) {
    const updated = await rescheduleAgendaEventAsync(event.id, dates, workspaceId);
    await refresh();
    setSelected(updated);
    setRescheduling(null);
    showToast("Compromisso remarcado no modo de dados atual.");
  }

  async function confirmAction() {
    if (!confirming) return;
    const updated = confirming.action === "cancelar" ? await cancelAgendaEventAsync(confirming.event.id, workspaceId) : await archiveAgendaEventAsync(confirming.event.id, workspaceId);
    await refresh();
    setSelected(updated);
    setConfirming(null);
    showToast(confirming.action === "cancelar" ? "Compromisso cancelado no modo de dados atual." : "Compromisso arquivado no modo de dados atual.");
  }

  return <AppLayout><div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-7 pb-4">
    <section className="calm-hero operational-hero-compact">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Agenda/Prazos • comando temporal</p><h1 className="mt-1.5 max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white">Agenda jurídica operacional do escritório.</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-lexos-muted">Compromissos, prazos e providências em uma leitura compacta para revisão humana diária.</p></div><div className="flex flex-wrap items-center gap-2"><button className="calm-secondary-action text-xs" onClick={() => setModeInfoOpen(true)} type="button">Ambiente local · dados fictícios</button><button className="calm-primary-action" onClick={() => setEditing("new")} type="button">+ Novo compromisso</button></div></div>
    </section>

    <section aria-label="Indicadores executivos da agenda" className="space-y-2.5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard active={!activeMetric && activeView === "hoje"} label="Hoje" value={String(todayEvents.length)} detail="itens do dia" onClick={() => applyView("hoje")} tone="premium" />
        <SummaryCard active={!activeMetric && activeView === "semana"} label="Próximos 7 dias" value={String(weekEvents.length)} detail="janela operacional" onClick={() => applyView("semana")} tone="positive" />
        <SummaryCard active={activeMetric === "compromissos"} label="Audiências/reuniões" value={String(meetingEvents.length)} detail="atos e alinhamentos" onClick={() => applyMetric("compromissos")} tone="premium" />
        <SummaryCard active={activeMetric === "criticos"} label="Prazos críticos" value={String(riskEvents.length)} detail="revisão serena" onClick={() => applyMetric("criticos")} tone="warning" />
        <SummaryCard active={activeMetric === "sem_responsavel"} label="Sem responsável" value={String(unassignedEvents.length)} detail="definir dono" onClick={() => applyMetric("sem_responsavel")} />
        <SummaryCard active={activeMetric === "finalizados"} label="Concluídos/cancelados" value={String(finishedEvents.length)} detail="histórico recente" onClick={() => applyMetric("finalizados")} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard compact active={activeMetric === "temporais"} label="Itens temporais ativos" value={String(operational.length)} detail="agenda operacional" onClick={() => applyMetric("temporais")} />
        <SummaryCard compact active={activeMetric === "criticos"} label="Itens críticos" value={String(riskEvents.length)} detail="prioridade elevada" onClick={() => applyMetric("criticos")} tone="warning" />
        <SummaryCard compact active={activeMetric === "derivados"} label="Derivados de tarefas/processos" value={String(derivedEvents.length)} detail="origem vinculada" onClick={() => applyMetric("derivados")} tone="premium" />
        <SummaryCard compact active={activeMetric === "vencidos"} label="Providência vencida" value={String(overdueEvents.length)} detail={nextOverdueEvent ? `desde ${formatDateTime(nextOverdueEvent.starts_at)}` : "sem pendência vencida"} onClick={() => applyMetric("vencidos")} tone={overdueEvents.length ? "urgent" : "positive"} />
        <SummaryCard compact active={!activeMetric && activeView === "prazos"} label="Prazos vinculados" value={String(linkedDeadlineEvents.length)} detail="tarefas e processos" onClick={() => applyView("prazos")} tone="warning" />
        <SummaryCard compact active={!activeMetric && activeView === "followups"} label="Follow-ups de relacionamento" value={String(followUpEvents.length)} detail="retornos consultivos" onClick={() => applyView("followups")} />
      </div>
    </section>

    <nav aria-label="Filtros rápidos da agenda" className="flex flex-wrap gap-2 rounded-[1.35rem] bg-white/[0.018] p-2.5">
      <ViewPill active={!activeMetric && activeView === "hoje"} count={todayEvents.length} label="Hoje" onClick={() => applyView("hoje")} />
      <ViewPill active={!activeMetric && activeView === "semana"} count={weekEvents.length} label="Próximos 7 dias" onClick={() => applyView("semana")} />
      <ViewPill active={activeMetric === "vencidos"} count={overdueEvents.length} label="Vencidos" onClick={() => applyMetric("vencidos")} />
      <ViewPill active={!activeMetric && activeView === "audiencias"} count={events.filter((event) => eventMatchesView(event, "audiencias")).length} label="Audiências" onClick={() => applyView("audiencias")} />
      <ViewPill active={!activeMetric && activeView === "reunioes"} count={events.filter((event) => eventMatchesView(event, "reunioes")).length} label="Reuniões" onClick={() => applyView("reunioes")} />
      <ViewPill active={!activeMetric && activeView === "followups"} count={followUpEvents.length} label="Follow-ups" onClick={() => applyView("followups")} />
      <ViewPill active={activeMetric === "derivados"} count={derivedEvents.length} label="Derivados" onClick={() => applyMetric("derivados")} />
      <ViewPill active={activeMetric === "temporais"} count={operational.length} label="Ativos" onClick={() => applyMetric("temporais")} />
      <ViewPill active={activeMetric === "finalizados"} count={finishedEvents.length} label="Concluídos/cancelados" onClick={() => applyMetric("finalizados")} />
    </nav>

    <SectionCard eyebrow="Prioridade temporal" title="Próximas providências do escritório">
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        <PriorityTile fallbackLabel="Próximo prazo" event={pickPriority(events, "prazo")} />
        <PriorityTile fallbackLabel="Próxima audiência/reunião" event={pickPriority(events, "audiencia-reuniao")} />
        <PriorityTile fallbackLabel="Follow-up mais antigo" event={pickPriority(events, "followup")} />
        <PriorityTile fallbackLabel="Item crítico derivado mais urgente" event={pickPriority(events, "critico-derivado")} />
      </div>
    </SectionCard>

    <SectionCard eyebrow="Agenda jurídica" title={listTitle} action={<div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-lexos-cyan/35 px-3 py-1.5 text-xs font-semibold text-lexos-cyan">{filtered.length} item(ns)</span><button className="rounded-full border border-lexos-line px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={() => applyView("operacional")} type="button">Limpar visão</button></div>}>
      <p className="mb-3 text-xs leading-5 text-lexos-muted">Leitura unificada de prazos, compromissos e itens derivados, com filtros discretos para a rotina diária.</p>
      <div className="mb-3.5 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.45fr)_repeat(4,minmax(0,0.72fr))]"><input className="field !min-h-[2.25rem] !rounded-xl !px-3 !py-2 text-sm md:col-span-2 xl:col-span-1" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, cliente, processo, responsável, tipo ou descrição..." value={query} /><Select label="Tipo (agenda e derivados)" onChange={(value) => setTypeFilter(value as AgendaEventType | "todos" | "tarefa_derivada" | "processo_derivado")} value={typeFilter} values={["todos", "prazo", "audiencia", "reuniao", "follow_up", "tarefa_derivada", "processo_derivado"]} /><Select label="Período" onChange={(value) => setPeriodFilter(value as "todos" | "hoje" | "7dias" | "30dias" | "vencidos")} value={periodFilter} values={["todos", "hoje", "7dias", "30dias", "vencidos"]} /><Select label="Risco/prioridade" onChange={(value) => setPriorityFilter(value as AgendaPriority | "todas")} value={priorityFilter} values={["todas", ...priorities]} /><Select label="Responsável" onChange={setResponsibleFilter} value={responsibleFilter} values={["todos", ...responsibles]} /></div>
      {loading ? <CompactAgendaEmptyState><EmptyState title="Carregando agenda do escritório..." description="Validando a sessão e preparando eventos, tarefas e prazos processuais do escritório." /></CompactAgendaEmptyState> : filtered.length ? <div className="space-y-3"><PaginationControls currentPage={page} onPageChange={setPage} pageSize={AGENDA_PAGE_SIZE} totalItems={filtered.length} /><div className="grid gap-3 xl:grid-cols-2">{visibleEvents.map((event) => <EventCard event={event} key={event.id} onCancel={() => event.editable ? setConfirming({ event, action: "cancelar" }) : setSelected(event)} onComplete={() => complete(event)} onEdit={() => event.editable ? setRescheduling(event) : event.source_route ? router.push(event.source_route) : setSelected(event)} onNavigate={(route) => router.push(route)} onOpen={() => setSelected(event)} />)}</div><PaginationControls currentPage={page} onPageChange={setPage} pageSize={AGENDA_PAGE_SIZE} totalItems={filtered.length} /></div> : <AgendaEmpty hasDerived={derivedEvents.length > 0} hasManual={manualEvents.length > 0} onCreate={() => setEditing("new")} />}
    </SectionCard>
    <p className="rounded-2xl border border-lexos-cyan/12 bg-white/[0.026] p-4 text-xs leading-5 text-lexos-silver">{AGENDA_REAL_DATA_MODE_LABEL} Itens derivados de tarefa/processo devem ser alterados na origem.</p>
  </div>{selected ? <DetailsModal event={selected} onArchive={() => setConfirming({ event: selected, action: "arquivar" })} onCancel={() => setConfirming({ event: selected, action: "cancelar" })} onClose={() => setSelected(null)} onComplete={() => complete(selected)} onEdit={() => setEditing(selected.editable ? selected : "new")} onReschedule={() => selected.editable ? setRescheduling(selected) : setEditing("new")} onNavigateClient={() => selected.client_id ? router.push(`/clientes/${selected.client_id}`) : null} onNavigateProcess={() => selected.process_id ? router.push(`/processos/${selected.process_id}`) : null} onNavigateSource={() => selected.source_route ? router.push(selected.source_route) : null} /> : null}{editing ? <EventForm clients={clients} event={editing === "new" ? null : editing} processes={processes} saving={saving} tasks={tasks} onClose={() => setEditing(null)} onSave={saveEvent} /> : null}{rescheduling ? <RescheduleModal event={rescheduling} onClose={() => setRescheduling(null)} onSave={reschedule} /> : null}{confirming ? <ConfirmModal action={confirming.action} event={confirming.event} onClose={() => setConfirming(null)} onConfirm={confirmAction} /> : null}{modeInfoOpen ? <ModeInfoModal onClose={() => setModeInfoOpen(false)} /> : null}{toast ? <div className="fixed bottom-5 right-5 z-[140] rounded-2xl border border-lexos-gold/40 bg-lexos-panel px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium">{toast}</div> : null}</AppLayout>;
}

function isOperationalEvent(event: AgendaEvent) { return ["agendado", "em_andamento", "remarcado"].includes(event.status); }
function getTemporalStatus(event: AgendaEvent): TemporalStatus {
  if (!event.starts_at || Number.isNaN(new Date(event.starts_at).getTime())) return "sem_data";
  if (["concluido", "cancelado", "arquivado"].includes(event.status)) return "sem_data";
  const now = new Date();
  const start = new Date(event.starts_at);
  if (start < now && start.toDateString() !== now.toDateString()) return "vencido";
  if (start.toDateString() === now.toDateString()) return "hoje";
  return "futuro";
}
function getDisplayTemporalLabel(event: AgendaEvent) {
  if (event.status === "concluido") return "concluído";
  if (event.status === "cancelado" || event.status === "arquivado") return event.status;
  const temporalStatus = getTemporalStatus(event);
  if (temporalStatus === "vencido") return "atrasado";
  if (temporalStatus === "hoje") return "hoje";
  return "próximo";
}
function pickTemporalPriority(items: AgendaEvent[]) {
  return [...items]
    .filter((item) => getTemporalStatus(item) !== "sem_data")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
}
function eventMatchesType(event: AgendaEvent, filter: AgendaEventType | "todos" | "tarefa_derivada" | "processo_derivado") {
  if (filter === "todos") return true;
  if (filter === "tarefa_derivada") return isDerivedEvent(event) && event.source === "task";
  if (filter === "processo_derivado") return isDerivedEvent(event) && event.source === "process";
  return event.type === filter;
}
function isRiskMaximumEvent(event: AgendaEvent) { return isOperationalEvent(event) && (event.priority === "urgente" || event.risk === "alto" || event.risk === "crítico"); }
function isDerivedEvent(event: AgendaEvent) { return Boolean(event.task_id || event.process_id || event.source === "task" || event.source === "process" || event.id.startsWith("task-agenda-") || event.id.startsWith("process-agenda-")); }
function eventMatchesMetric(event: AgendaEvent, metric: MetricFilter) { if (metric === "temporais" || metric === "proxima") return isOperationalEvent(event); if (metric === "criticos") return isRiskMaximumEvent(event); if (metric === "compromissos") return isOperationalEvent(event) && ["audiencia", "reuniao"].includes(event.type); if (metric === "sem_responsavel") return isOperationalEvent(event) && !event.responsible.trim(); if (metric === "finalizados") return ["concluido", "cancelado", "arquivado"].includes(event.status); if (metric === "vencidos") return isOperationalEvent(event) && getTemporalStatus(event) === "vencido"; return isDerivedEvent(event); }
function eventMatchesPeriod(event: AgendaEvent, filter: "todos" | "hoje" | "7dias" | "30dias" | "vencidos") {
  if (filter === "todos") return true;
  const now = new Date();
  const start = new Date(event.starts_at);
  const days = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const status = getTemporalStatus(event);
  if (filter === "hoje") return status === "hoje";
  if (filter === "7dias") return status === "hoje" || (status === "futuro" && days <= 7);
  if (filter === "30dias") return status === "hoje" || (status === "futuro" && days <= 30);
  return status === "vencido";
}
function pickPriority(events: AgendaEvent[], mode: "prazo" | "audiencia-reuniao" | "followup" | "critico-derivado") {
  const active = events.filter((event) => getTemporalStatus(event) !== "sem_data");
  const sorted = [...active].sort((a, b) => {
    const order = { vencido: 0, hoje: 1, futuro: 2, sem_data: 3 } as const;
    const diff = order[getTemporalStatus(a)] - order[getTemporalStatus(b)];
    if (diff !== 0) return diff;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
  if (mode === "prazo") return sorted.find((event) => event.type === "prazo");
  if (mode === "audiencia-reuniao") return sorted.find((event) => event.type === "audiencia" || event.type === "reuniao");
  if (mode === "followup") return sorted.find((event) => event.type === "follow_up");
  return sorted.find((event) => isDerivedEvent(event) && isRiskMaximumEvent(event));
}
function SummaryCard({ active, compact, label, value, detail, tone = "neutral", onClick }: { active?: boolean; compact?: boolean; label: string; value: string; detail: string; tone?: string; onClick: () => void }) {
  const toneClasses = tone === "positive" ? "text-lexos-green" : tone === "premium" ? "text-lexos-cyan" : tone === "warning" || tone === "urgent" ? "text-lexos-goldSoft" : "text-lexos-silver";
  return <button className={cn("calm-metric-card border text-left transition focus:outline-none", compact ? "min-h-[92px]" : "min-h-[108px]", active ? "border-lexos-cyan/45 bg-lexos-cyan/[0.055] ring-1 ring-lexos-cyan/25" : "border-lexos-line/45 hover:border-lexos-cyan/20")} onClick={onClick} type="button"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">{label}</p><p className={cn("font-semibold tracking-[-0.02em] text-white", compact ? "mt-1 text-xl" : "mt-1.5 text-2xl")}>{value}</p><div className={cn("flex items-end justify-between gap-2", compact ? "mt-1.5" : "mt-2")}><p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", toneClasses)}>{detail}</p><span className="shrink-0 text-xs font-semibold text-lexos-cyan/80">{active ? "Ativo" : "Abrir"}</span></div></button>;
}

function ViewPill({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) { return <button className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", active ? "border-lexos-cyan/55 bg-lexos-cyan/10 text-lexos-cyan" : "border-lexos-line/55 bg-white/[0.025] text-lexos-silver hover:border-lexos-cyan/28 hover:text-lexos-cyan")} onClick={onClick} type="button">{label} <span className="ml-1 text-[10px] opacity-70">{count}</span></button>; }

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted"><span className="sr-only">{label}</span><select className="field !min-h-[2.25rem] !rounded-xl !px-3 !py-2 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{values.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label>; }
function EventCard({ event, onCancel, onComplete, onEdit, onNavigate, onOpen }: { event: AgendaEvent; onCancel: () => void; onComplete: () => void; onEdit: () => void; onNavigate: (route: string) => void; onOpen: () => void }) {
  const temporalLabel = getDisplayTemporalLabel(event);
  const temporalStatus = getTemporalStatus(event);
  const showPriority = ["urgente", "máxima"].includes(event.priority) || event.risk === "crítico";

  return <article className="calm-record-card border border-lexos-line/48">
    <button className="block w-full text-left" onClick={onOpen} type="button">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">{formatDateTime(event.starts_at)} <span className="text-lexos-muted">• {event.source_label ?? "Evento"}</span></p>
          <h2 className="mt-1.5 text-base font-semibold leading-5 tracking-[-0.015em] text-white">{event.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={temporalLabel} />
          {showPriority ? <StatusBadge status={event.risk ? `risco ${event.risk}` : event.priority} /> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-lexos-muted">
        <span>{event.type.replace("_", " ")}</span>
        <span>•</span>
        <span>{event.status.replace("_", " ")}</span>
        {!showPriority ? <><span>•</span><span>prioridade {event.priority}</span></> : null}
      </div>
      <div className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <p className="text-lexos-muted"><span className="font-semibold text-lexos-silver">Responsável:</span> {event.responsible || "Definir responsável"}</p>
        <p className="truncate text-lexos-muted"><span className="font-semibold text-lexos-silver">Cliente:</span> {event.client_name ?? "Evento interno"}</p>
        <p className="truncate text-lexos-muted sm:col-span-2"><span className="font-semibold text-lexos-silver">Processo:</span> {event.process_number ?? "Sem processo vinculado"}</p>
      </div>
      <p className={cn("mt-3 rounded-2xl border p-3 text-xs leading-5", temporalStatus === "vencido" ? "border-lexos-gold/18 bg-lexos-gold/[0.055] text-lexos-goldSoft" : "border-lexos-cyan/12 bg-white/[0.026] text-lexos-silver")}><span className="font-semibold uppercase tracking-[0.12em] text-lexos-cyan">Próxima providência:</span> {event.next_action || "Definir próxima ação"}</p>
    </button>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-lexos-line/45 pt-3 text-xs font-semibold">
      <button className="rounded-full border border-lexos-cyan/40 bg-lexos-cyan/10 px-3 py-1.5 text-lexos-cyan transition hover:bg-lexos-cyan/16" onClick={onOpen} type="button">Abrir agenda</button>
      <QuickAction onClick={onEdit}>{event.editable ? "Reagendar/editar" : "Ver origem"}</QuickAction>
      {event.client_id ? <QuickAction onClick={() => onNavigate(`/clientes/${event.client_id}`)}>Cliente</QuickAction> : null}
      {event.process_id ? <QuickAction onClick={() => onNavigate(`/processos/${event.process_id}`)}>Processo</QuickAction> : null}
      {isOperationalEvent(event) ? <QuickAction onClick={onComplete}>Concluir</QuickAction> : null}
      {event.editable && isOperationalEvent(event) ? <QuickAction danger onClick={onCancel}>Cancelar</QuickAction> : null}
    </div>
  </article>;
}

function QuickAction({ children, danger, onClick }: { children: React.ReactNode; danger?: boolean; onClick: () => void }) { return <button className={cn("rounded-full border border-transparent px-3 py-1.5 transition hover:border-lexos-line", danger ? "text-lexos-goldSoft hover:text-lexos-red" : "text-lexos-muted hover:text-lexos-silver")} onClick={onClick} type="button">{children}</button>; }

function Chip({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-lexos-line/55 bg-white/[0.026] px-3 py-1 text-xs font-semibold capitalize text-lexos-silver">{children}</span>; }

function PriorityTile({ fallbackLabel, event }: { fallbackLabel: string; event?: AgendaEvent }) {
  if (!event) return <div className="rounded-2xl border border-lexos-line/80 bg-lexos-ink/50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-lexos-muted">{fallbackLabel}</p><p className="mt-1.5 text-xs text-lexos-silver">Sem item no período.</p></div>;
  const status = getTemporalStatus(event);
  const label = fallbackLabel.includes("prazo") && status === "vencido" ? "Prazo vencido mais urgente" : fallbackLabel.includes("audiência") && status === "vencido" ? "Audiência/reunião vencida ou pendente de baixa" : fallbackLabel.includes("crítico") && status === "vencido" ? "Item vencido crítico" : fallbackLabel.includes("prazo") && status === "hoje" ? "Prazo de hoje" : fallbackLabel.includes("audiência") && status === "hoje" ? "Compromisso de hoje" : fallbackLabel;
  return <div className="rounded-2xl border border-lexos-gold/30 bg-lexos-card/70 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-lexos-gold">{label}</p><p className="mt-1.5 text-sm font-semibold leading-5 text-white">{event.title}</p><p className="mt-1 text-[11px] leading-4 text-lexos-silver">{status === "vencido" ? `Vencido desde ${formatDateTime(event.starts_at)}` : formatDateTime(event.starts_at)} • {isDerivedEvent(event) ? `Derivado de ${event.source === "process" ? "processo" : "tarefa"}` : "Agenda cadastrada"}</p></div>;
}
function CompactAgendaEmptyState({ children }: { children: React.ReactNode }) { return <div className="[&_.premium-empty-state]:!p-3 [&_.premium-empty-state_button]:!mt-3 [&_.premium-empty-state_p]:!leading-5">{children}</div>; }
function AgendaEmpty({ hasDerived, hasManual, onCreate }: { hasDerived: boolean; hasManual: boolean; onCreate: () => void }) {
  if (hasDerived && !hasManual) return <div className="space-y-2 rounded-2xl border border-lexos-gold/30 bg-lexos-gold/10 p-3.5 [&_button]:!rounded-xl [&_button]:!px-3 [&_button]:!py-2 [&_button]:!text-xs"><p className="text-sm leading-5 text-lexos-goldSoft">Nenhum compromisso manual registrado para esta semana. Existem itens derivados de tarefas e processos exigindo acompanhamento.</p><div className="flex flex-wrap gap-2"><Action onClick={onCreate}>Novo compromisso</Action><Action onClick={onCreate}>Criar prazo</Action><Action onClick={() => window.dispatchEvent(new Event("lexos:tasks-updated"))}>Ver tarefas com vencimento</Action><Action onClick={() => window.dispatchEvent(new Event("lexos:processes-updated"))}>Ver processos com prazo</Action></div></div>;
  if (hasDerived) return <CompactAgendaEmptyState><EmptyState title="Nenhum compromisso manual nesta semana." description="Ainda há prazos, tarefas ou processos com datas relevantes. Consulte a prioridade temporal ou os itens derivados." /></CompactAgendaEmptyState>;
  return <CompactAgendaEmptyState><EmptyState title="Nenhum compromisso manual nesta semana." description="Nenhum prazo, audiência, reunião ou follow-up registrado. Cadastre um compromisso para iniciar o controle temporal." actionLabel="Criar compromisso" onAction={onCreate} /></CompactAgendaEmptyState>;
}
function fieldLabel(label: string, value?: string) { return <div className="rounded-2xl border border-lexos-line/75 bg-lexos-ink/55 p-4"><p className="text-xs uppercase tracking-[0.18em] text-lexos-muted">{label}</p><p className="mt-2 text-sm leading-6 text-white">{value || "—"}</p></div>; }
function DetailsModal(props: { event: AgendaEvent; onClose: () => void; onEdit: () => void; onComplete: () => void; onReschedule: () => void; onCancel: () => void; onArchive: () => void; onNavigateClient: () => void; onNavigateProcess: () => void; onNavigateSource: () => void }) { const { event } = props; return <ModalShell title={event.title} eyebrow={`Detalhes • ${event.source_label ?? "Evento"}`} onClose={props.onClose}><div className="grid gap-4 md:grid-cols-2">{fieldLabel("Tipo", event.type.replace("_", " "))}{fieldLabel("Status", event.status.replace("_", " "))}{fieldLabel("Prioridade", event.priority)}{fieldLabel("Risco", event.risk)}{fieldLabel("Cliente", event.client_name)}{fieldLabel("Processo", event.process_number)}{fieldLabel("Tarefa", event.task_id)}{fieldLabel("Responsável", event.responsible)}{fieldLabel("Início", formatDateTime(event.starts_at))}{fieldLabel("Fim", event.ends_at ? formatDateTime(event.ends_at) : undefined)}{fieldLabel("Lembrete", event.reminder_at ? formatDateTime(event.reminder_at) : undefined)}{fieldLabel("Local/link", event.location)}</div><div className="mt-4 space-y-3">{fieldLabel("Descrição", event.description)}{fieldLabel("Próxima ação", event.next_action)}{fieldLabel("Observações", event.notes)}</div>{!event.editable ? <p className="mt-4 rounded-2xl border border-lexos-gold/25 bg-lexos-gold/10 p-4 text-sm leading-6 text-lexos-goldSoft">Este item vem de tarefa/processo. Edite na origem para alterar o prazo.</p> : null}<div className="mt-5 flex flex-wrap gap-3">{event.editable ? <><Action onClick={props.onEdit}>Abrir compromisso</Action><Action onClick={props.onReschedule}>Reagendar/editar</Action>{event.client_id ? <Action onClick={props.onNavigateClient}>Ver cliente</Action> : null}{event.process_id ? <Action onClick={props.onNavigateProcess}>Ver processo</Action> : null}<Action onClick={props.onEdit}>Criar tarefa</Action><Action onClick={props.onComplete}>Concluir</Action><Action danger onClick={props.onCancel}>Cancelar</Action><Action danger onClick={props.onArchive}>Arquivar</Action></> : <><Action onClick={props.onNavigateSource}>Abrir origem</Action>{event.client_id ? <Action onClick={props.onNavigateClient}>Ver cliente</Action> : null}{event.process_id ? <Action onClick={props.onNavigateProcess}>Ver processo</Action> : null}<Action onClick={props.onEdit}>Criar compromisso</Action><Action onClick={props.onReschedule}>Criar tarefa</Action><Action onClick={props.onComplete}>Marcar acompanhado</Action></>}</div></ModalShell>; }
function EventForm({ clients, event, processes, saving, tasks, onClose, onSave }: { clients: Client[]; event: AgendaEvent | null; processes: Process[]; tasks: Task[]; saving: boolean; onClose: () => void; onSave: (input: AgendaInput, event?: AgendaEvent) => void }) { const [form, setForm] = useState<AgendaInput>(() => event ? toInput(event) : emptyForm); const linkedProcesses = processes.filter((process) => !form.client_id || process.client_id === form.client_id); const linkedTasks = tasks.filter((task) => (!form.client_id || task.client_id === form.client_id) && (!form.process_id || task.process_id === form.process_id)); function update(next: Partial<AgendaInput>) { setForm((current) => ({ ...current, ...next })); } function submit() { if (!form.title.trim() || !form.starts_at || !form.responsible.trim()) return; onSave({ ...form, starts_at: normalizeDateTime(form.starts_at), ends_at: form.ends_at ? normalizeDateTime(form.ends_at) : undefined, reminder_at: form.reminder_at ? normalizeDateTime(form.reminder_at) : undefined }, event ?? undefined); } return <ModalShell title={event ? "Editar compromisso" : "Novo compromisso"} eyebrow="Ficha de agenda" onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><Input label="Título" value={form.title} onChange={(v) => update({ title: v })} /><SelectField label="Tipo" value={form.type} values={eventTypes} onChange={(v) => update({ type: v as AgendaEventType })} /><SelectField label="Cliente vinculado" value={form.client_id ?? ""} values={["", ...clients.map((c) => c.id)]} labels={{ "": clients.length ? "Sem cliente" : "Nenhum cliente cadastrado neste escritório.", ...Object.fromEntries(clients.map((c) => [c.id, c.name])) }} onChange={(v) => { const client = clients.find((c) => c.id === v); update({ client_id: v, client_name: client?.name ?? "", process_id: "", process_number: "", task_id: "" }); }} /><SelectField label="Processo vinculado" value={form.process_id ?? ""} values={["", ...linkedProcesses.map((p) => p.id)]} labels={{ "": linkedProcesses.length ? "Sem processo" : "Nenhum processo cadastrado neste escritório.", ...Object.fromEntries(linkedProcesses.map((p) => [p.id, `${p.number} • ${p.title}`])) }} onChange={(v) => { const process = processes.find((p) => p.id === v); update({ process_id: v, process_number: process?.number ?? "", process_title: process?.title ?? "", task_id: "" }); }} /><SelectField label="Tarefa opcional" value={form.task_id ?? ""} values={["", ...linkedTasks.map((t) => t.id)]} labels={{ "": linkedTasks.length ? "Sem tarefa" : "Nenhuma tarefa cadastrada neste escritório.", ...Object.fromEntries(linkedTasks.map((t) => [t.id, t.title])) }} onChange={(v) => { const task = tasks.find((t) => t.id === v); update({ task_id: v, task_title: task?.title ?? "" }); }} /><Input label="Responsável" value={form.responsible} onChange={(v) => update({ responsible: v })} /><SelectField label="Prioridade" value={form.priority} values={priorities} onChange={(v) => update({ priority: v as AgendaPriority })} /><Input label="Data/hora de início" type="datetime-local" value={toLocalInput(form.starts_at)} onChange={(v) => update({ starts_at: v })} /><Input label="Data/hora de fim" type="datetime-local" value={toLocalInput(form.ends_at)} onChange={(v) => update({ ends_at: v })} /><Input label="Lembrete" type="datetime-local" value={toLocalInput(form.reminder_at)} onChange={(v) => update({ reminder_at: v })} /><Input label="Local/link" value={form.location ?? ""} onChange={(v) => update({ location: v })} /></div><Textarea label="Descrição" value={form.description} onChange={(v) => update({ description: v })} /><Textarea label="Próxima ação" value={form.next_action} onChange={(v) => update({ next_action: v })} /><Textarea label="Observações" value={form.notes} onChange={(v) => update({ notes: v })} /><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Action onClick={onClose}>Cancelar</Action><Action onClick={submit}>{saving ? "Salvando..." : "Salvar compromisso"}</Action></div></ModalShell>; }
function RescheduleModal({ event, onClose, onSave }: { event: AgendaEvent; onClose: () => void; onSave: (event: AgendaEvent, dates: { starts_at: string; ends_at?: string; reminder_at?: string }) => void }) { const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at)); const [endsAt, setEndsAt] = useState(toLocalInput(event.ends_at)); const [reminderAt, setReminderAt] = useState(toLocalInput(event.reminder_at)); return <ModalShell title="Remarcar compromisso" eyebrow="Agenda" onClose={onClose}><p className="text-sm leading-5 text-lexos-muted">A remarcação altera o evento no modo de dados atual e preserva histórico pelo status remarcado.</p><div className="mt-4 grid gap-4 md:grid-cols-3"><Input label="Novo início" type="datetime-local" value={startsAt} onChange={setStartsAt} /><Input label="Novo fim" type="datetime-local" value={endsAt} onChange={setEndsAt} /><Input label="Novo lembrete" type="datetime-local" value={reminderAt} onChange={setReminderAt} /></div><div className="mt-5 flex justify-end gap-3"><Action onClick={onClose}>Cancelar</Action><Action onClick={() => onSave(event, { starts_at: normalizeDateTime(startsAt), ends_at: endsAt ? normalizeDateTime(endsAt) : undefined, reminder_at: reminderAt ? normalizeDateTime(reminderAt) : undefined })}>Salvar remarcação</Action></div></ModalShell>; }
function ConfirmModal({ action, event, onClose, onConfirm }: { action: ConfirmAction; event: AgendaEvent; onClose: () => void; onConfirm: () => void }) { return <ModalShell title={action === "cancelar" ? "Cancelar compromisso" : "Arquivar compromisso"} eyebrow="Confirmação" onClose={onClose}><p className="text-sm leading-5 text-lexos-muted">Este registro não será excluído. Ele sairá da visão operacional e ficará disponível apenas no filtro de arquivados/cancelados.</p><div className="mt-4 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-lg font-semibold text-white">{event.title}</p><p className="mt-1 text-sm text-lexos-muted">{formatDateTime(event.starts_at)} • {event.responsible}</p></div><div className="mt-5 flex justify-end gap-3"><Action onClick={onClose}>Voltar</Action><Action danger onClick={onConfirm}>{action === "cancelar" ? "Cancelar sem excluir" : "Arquivar sem excluir"}</Action></div></ModalShell>; }
function ModeInfoModal({ onClose }: { onClose: () => void }) { return <ModalShell title="Modo de dados da Agenda" eyebrow="Ambiente controlado" onClose={onClose}><div className="space-y-4"><p className="text-sm leading-7 text-lexos-silver">No ambiente conectado, a Agenda usa apenas dados do escritório. Na demonstração, os dados seguem locais e fictícios.</p><div className="grid gap-3 md:grid-cols-3"><Chip>Ambiente conectado ou demonstração</Chip><Chip>sem chaves reais</Chip><Chip>sem chave administrativa</Chip></div><p className="rounded-2xl border border-lexos-gold/25 bg-lexos-gold/10 p-4 text-sm leading-6 text-lexos-goldSoft">A Agenda não mistura demonstração e escritório conectado: os vínculos operacionais respeitam a sessão atual.</p><div className="flex justify-end"><Action onClick={onClose}>Entendi</Action></div></div></ModalShell>; }
function ModalShell({ eyebrow, title, children, onClose }: { eyebrow: string; title: string; children: React.ReactNode; onClose: () => void }) { useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [onClose]); return <div className="fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-lexos-ink/78 p-4 backdrop-blur-sm"><button aria-label="Fechar painel da agenda" className="absolute inset-0 cursor-default" onClick={onClose} type="button" /><div className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-lexos-line/80 bg-[#0b1728]/98 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.26)] sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2></div><button className="shrink-0 rounded-full border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Fechar</button></div><div className="overflow-y-auto p-5 premium-scrollbar sm:p-6">{children}</div></div></div>; }
function Action({ children, danger, onClick }: { children: React.ReactNode; danger?: boolean; onClick: () => void }) { return <button className={cn("rounded-2xl border px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5", danger ? "border-lexos-wine/65 bg-lexos-wine/18 text-lexos-red hover:bg-lexos-wine/26" : "border-lexos-gold/40 bg-lexos-gold/10 text-lexos-gold hover:bg-lexos-gold/16")} onClick={onClick} type="button">{children}</button>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value?: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm text-lexos-muted">{label}<input className="mt-2 field" type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>; }
function Textarea({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) { return <label className="mt-4 block text-sm text-lexos-muted">{label}<textarea className="mt-2 min-h-24 field" value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label className="block text-sm text-lexos-muted">{label}<select className="mt-2 field" value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item} value={item}>{labels[item] ?? item.replace("_", " ")}</option>)}</select></label>; }
function toInput(event: AgendaEvent): AgendaInput { return { client_id: event.client_id ?? "", client_name: event.client_name ?? "", process_id: event.process_id ?? "", process_number: event.process_number ?? "", process_title: event.process_title ?? "", task_id: event.task_id ?? "", task_title: event.task_title ?? "", title: event.title, description: event.description, type: event.type, status: event.status, priority: event.priority, risk: event.risk, responsible: event.responsible, starts_at: event.starts_at, ends_at: event.ends_at ?? "", reminder_at: event.reminder_at ?? "", location: event.location ?? "", next_action: event.next_action, notes: event.notes, completed_at: event.completed_at, archived_at: event.archived_at }; }
function toLocalInput(value?: string) { if (!value) return ""; return value.slice(0, 16); }
function normalizeDateTime(value: string) { return value.length === 16 ? `${value}:00.000Z` : value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
