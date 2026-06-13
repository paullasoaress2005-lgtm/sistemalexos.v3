"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, PaginationControls, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback, setPendingToast } from "@/lib/auth";
import { Client, listClientsAsync } from "@/lib/data/clients";
import { listProcessesAsync, Process } from "@/lib/data/processes";
import {
  archiveTaskAsync,
  completeTaskAsync,
  createTaskAsync,
  listTasksAsync,
  getTaskByIdAsync,
  reopenTaskAsync,
  resolveEffectiveTaskStatus,
  TASK_REAL_DATA_MODE_LABEL,
  Task,
  TaskInput,
  TaskPriority,
  TaskStatus,
  TaskType,
  updateTaskAsync,
} from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

const TASK_PAGE_SIZE = 8;
const statusOptions: Array<TaskStatus | "operacionais" | "todas"> = ["operacionais", "a_fazer", "em_andamento", "aguardando", "em_revisao", "atrasada", "concluida", "arquivada", "todas"];
const priorityOptions: Array<TaskPriority | "todas"> = ["todas", "baixa", "média", "alta", "urgente", "máxima"];
const typeOptions: Array<TaskType | "todos"> = ["todos", "prazo", "peça", "audiência", "atendimento", "financeiro", "interno", "revisão", "outro"];

const emptyForm: TaskInput = {
  title: "",
  description: "",
  type: "prazo",
  status: "a_fazer",
  priority: "média",
  responsible: "",
  due_at: "",
  reminder_at: "",
  next_action: "",
  notes: "",
  client_id: "",
  client_name: "",
  process_id: "",
  process_number: "",
};

type PanelMode = "details" | "create" | "edit";
type TaskView = "operational" | "completed" | "overdue" | "validation" | "urgent" | "archived" | "all";

function statusLabel(status: TaskStatus | "operacionais" | "todas") {
  const labels: Record<TaskStatus | "operacionais" | "todas", string> = {
    operacionais: "Todas operacionais",
    todas: "Todas não arquivadas",
    a_fazer: "A fazer",
    em_andamento: "Em andamento",
    aguardando: "Aguardando",
    em_revisao: "Em revisão",
    concluida: "Concluída",
    atrasada: "Atrasada",
    arquivada: "Arquivada",
  };
  return labels[status];
}

function typeLabel(type: TaskType | "todos") {
  return type === "todos" ? "Todos os tipos" : type;
}

function taskMatchesView(task: Task, view: TaskView) {
  const effectiveStatus = resolveEffectiveTaskStatus(task);
  if (view === "operational") return !["concluida", "arquivada"].includes(effectiveStatus);
  if (view === "completed") return effectiveStatus === "concluida";
  if (view === "archived") return effectiveStatus === "arquivada";
  if (view === "overdue") return effectiveStatus === "atrasada";
  if (view === "validation") return ["em_revisao", "aguardando"].includes(effectiveStatus);
  if (view === "urgent") return effectiveStatus !== "arquivada" && effectiveStatus !== "concluida" && ["urgente", "máxima"].includes(task.priority);
  return effectiveStatus !== "arquivada";
}

function viewTitle(view: TaskView) {
  const labels: Record<TaskView, string> = {
    operational: "Tarefas operacionais",
    completed: "Tarefas concluídas",
    overdue: "Tarefas com prazo vencido",
    validation: "Tarefas aguardando validação",
    urgent: "Tarefas de prioridade máxima",
    archived: "Tarefas arquivadas",
    all: "Todas as tarefas não arquivadas",
  };
  return labels[view];
}

function formatDate(value?: string) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value?: string) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getPrefilledTaskForm(clients: Client[], processes: Process[], clientId: string | null, processId: string | null): TaskInput {
  const selectedProcess = processId ? processes.find((process) => process.id === processId) : undefined;
  const selectedClient = selectedProcess?.client_id
    ? clients.find((client) => client.id === selectedProcess.client_id)
    : clientId
      ? clients.find((client) => client.id === clientId)
      : undefined;

  return {
    ...emptyForm,
    responsible: getCurrentSessionOrFallback().user.name || selectedProcess?.responsible || selectedClient?.owner || "",
    client_id: selectedClient?.id ?? selectedProcess?.client_id ?? "",
    client_name: selectedClient?.name ?? selectedProcess?.client_name ?? "",
    process_id: selectedProcess?.id ?? "",
    process_number: selectedProcess?.number ?? "",
  };
}

function toForm(task: Task): TaskInput {
  return {
    client_id: task.client_id ?? "",
    client_name: task.client_name ?? "",
    process_id: task.process_id ?? "",
    process_number: task.process_number ?? "",
    title: task.title,
    description: task.description,
    type: task.type,
    status: task.status,
    priority: task.priority,
    responsible: task.responsible,
    due_at: task.due_at,
    reminder_at: task.reminder_at ?? "",
    completed_at: task.completed_at,
    archived_at: task.archived_at,
    next_action: task.next_action,
    notes: task.notes,
  };
}

export default function TarefasPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "operacionais" | "todas">("operacionais");
  const [activeView, setActiveView] = useState<TaskView>("operational");
  const [priority, setPriority] = useState<TaskPriority | "todas">("todas");
  const [responsible, setResponsible] = useState<string | "todos">("todos");
  const [type, setType] = useState<TaskType | "todos">("todos");
  const [clientFilter, setClientFilter] = useState<string | "todos">("todos");
  const [processFilter, setProcessFilter] = useState<string | "todos">("todos");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [archiveCandidate, setArchiveCandidate] = useState<Task | null>(null);
  const [page, setPage] = useState(1);
  const session = useMemo(() => getCurrentSessionOrFallback(), []);

  useEffect(() => {
    let active = true;
    async function loadData() {
    const session = getCurrentSessionOrFallback();
    const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    const params = new URLSearchParams(window.location.search);
    setWorkspaceId(sessionWorkspaceId);
    const [nextTasks, nextClients, nextProcesses] = await Promise.all([listTasksAsync(sessionWorkspaceId, { status: "todas", includeArchived: true }), listClientsAsync(sessionWorkspaceId), listProcessesAsync(sessionWorkspaceId, { includeArchived: true })]);
    if (!active) return;
    setTasks(nextTasks);
    setClients(nextClients);
    setProcesses(nextProcesses);

    const taskId = params.get("taskId");
    const clientId = params.get("clientId");
    const processId = params.get("processId");
    const viewParam = params.get("view") as TaskView | null;
    const action = params.get("action");
    if (viewParam && ["operational", "completed", "overdue", "validation", "urgent", "archived", "all"].includes(viewParam)) {
      setActiveView(viewParam);
    }
    if (taskId) {
      const task = await getTaskByIdAsync(taskId, sessionWorkspaceId);
      if (task) {
        setSelectedTask(task);
        setForm(toForm(task));
        setPanelMode("details");
      }
    }
    if (action === "novo" || action === "nova") {
      setSelectedTask(null);
      setForm(getPrefilledTaskForm(nextClients, nextProcesses, clientId, processId));
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

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => taskMatchesView(task, activeView))
      .filter((task) => {
        const effectiveStatus = resolveEffectiveTaskStatus(task);
        if (["operacionais", "todas"].includes(status)) return true;
        return effectiveStatus === status;
      })
      .filter((task) => (priority === "todas" ? true : task.priority === priority))
      .filter((task) => (responsible === "todos" ? true : task.responsible === responsible))
      .filter((task) => (type === "todos" ? true : task.type === type))
      .filter((task) => (clientFilter === "todos" ? true : clientFilter === "sem_cliente" ? !task.client_id : task.client_id === clientFilter))
      .filter((task) => (processFilter === "todos" ? true : processFilter === "sem_processo" ? !task.process_id : task.process_id === processFilter))
      .filter((task) => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return true;
        return [task.title, task.client_name, task.process_number, task.responsible, task.type, task.description, task.next_action]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [activeView, clientFilter, priority, processFilter, query, responsible, status, tasks, type]);

  useEffect(() => {
    setPage(1);
  }, [activeView, clientFilter, priority, processFilter, query, responsible, status, type]);

  const visibleTasks = useMemo(() => filteredTasks.slice((page - 1) * TASK_PAGE_SIZE, page * TASK_PAGE_SIZE), [filteredTasks, page]);

  const operationalTasks = useMemo(() => tasks.filter((task) => taskMatchesView(task, "operational")), [tasks]);
  const executionStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const doneThisMonth = tasks.filter((task) => task.completed_at && new Date(task.completed_at).getMonth() === today.getMonth()).length;
    const dueToday = operationalTasks.filter((task) => task.due_at === today.toISOString().slice(0, 10)).length;
    const upcoming = operationalTasks.filter((task) => {
      if (!task.due_at) return false;
      const due = new Date(`${task.due_at}T12:00:00`);
      return due >= today && due <= in7 && task.due_at !== today.toISOString().slice(0, 10);
    }).length;
    const overdue = operationalTasks.filter((task) => resolveEffectiveTaskStatus(task) === "atrasada").length;
    const unassigned = operationalTasks.filter((task) => !task.responsible?.trim()).length;
    const linkedToProcess = operationalTasks.filter((task) => Boolean(task.process_id)).length;
    return { open: operationalTasks.length, overdue, dueToday, upcoming, unassigned, linkedToProcess, doneThisMonth };
  }, [operationalTasks, tasks]);
  const priorityQueue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return operationalTasks
      .filter((task) => {
        const overdue = resolveEffectiveTaskStatus(task) === "atrasada";
        const dueToday = task.due_at === today;
        const unassigned = !task.responsible?.trim();
        const criticalProcess = !!task.process_id && ["alta", "crítico"].includes((task as unknown as { process_risk?: string }).process_risk ?? "");
        const sensitiveFinance = task.type === "financeiro" && ["urgente", "máxima"].includes(task.priority);
        return overdue || dueToday || unassigned || criticalProcess || sensitiveFinance;
      })
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
      .slice(0, 5);
  }, [operationalTasks]);

  const responsibleOptions = useMemo(() => Array.from(new Set(tasks.map((task) => task.responsible).filter(Boolean))).sort(), [tasks]);
  const processOptions = useMemo(() => {
    const active = processes.filter((process) => process.status !== "arquivado");
    return form.client_id ? active.filter((process) => process.client_id === form.client_id) : active;
  }, [form.client_id, processes]);

  function activateShortcut(view: TaskView) {
    setActiveView(view);
    if (view === "operational") {
      setStatus("operacionais");
      setPriority("todas");
    } else if (view === "completed") {
      setStatus("concluida");
      setPriority("todas");
    } else if (view === "overdue") {
      setStatus("atrasada");
      setPriority("todas");
    } else if (view === "validation") {
      setStatus("todas");
      setPriority("todas");
    } else if (view === "urgent") {
      setStatus("todas");
      setPriority("todas");
    } else if (view === "archived") {
      setStatus("arquivada");
      setPriority("todas");
    } else {
      setStatus("todas");
      setPriority("todas");
    }
  }

  function handleStatusFilter(value: string) {
    const nextStatus = value as TaskStatus | "operacionais" | "todas";
    setStatus(nextStatus);
    if (nextStatus === "operacionais") setActiveView("operational");
    else if (nextStatus === "concluida") setActiveView("completed");
    else if (nextStatus === "arquivada") setActiveView("archived");
    else if (nextStatus === "atrasada") setActiveView("overdue");
    else if (["aguardando", "em_revisao"].includes(nextStatus)) setActiveView("validation");
    else if (nextStatus === "todas") setActiveView("all");
    else setActiveView("operational");
  }

  async function refresh(message?: string) {
    setTasks(await listTasksAsync(workspaceId, { status: "todas", includeArchived: true }));
    setClients(await listClientsAsync(workspaceId));
    setProcesses(await listProcessesAsync(workspaceId, { includeArchived: true }));
    if (message) {
      setToast(message);
      setPendingToast(message);
    }
  }

  function openCreatePanel() {
    setSelectedTask(null);
    setForm(getPrefilledTaskForm(clients, processes, null, null));
    setFormError(null);
    setPanelMode("create");
  }

  function openDetails(task: Task) {
    setSelectedTask(task);
    setForm(toForm(task));
    setFormError(null);
    setPanelMode("details");
  }

  function openEdit(task: Task) {
    setSelectedTask(task);
    setForm(toForm(task));
    setFormError(null);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedTask(null);
    setFormError(null);
  }

  function validateForm() {
    if (!form.title.trim()) return "Informe o título da tarefa.";
    if (!form.responsible.trim()) return "Informe o responsável pela tarefa.";
    if (!form.due_at) return "Informe o prazo/data limite.";
    if (!form.next_action.trim()) return "Informe a próxima ação operacional.";
    return null;
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const cleanForm = {
        ...form,
        client_id: form.client_id || undefined,
        client_name: form.client_name || undefined,
        process_id: form.process_id || undefined,
        process_number: form.process_number || undefined,
        reminder_at: form.reminder_at || undefined,
      };
      if (panelMode === "edit" && selectedTask) {
        const updated = await updateTaskAsync(selectedTask.id, cleanForm, workspaceId);
        if (updated) setSelectedTask(updated);
        await refresh("Tarefa atualizada no ambiente atual.");
        setPanelMode("details");
      } else {
        const created = await createTaskAsync(cleanForm, workspaceId);
        setSelectedTask(created);
        await refresh("Tarefa cadastrada no ambiente atual.");
        setPanelMode("details");
      }
    } catch (error) {
      console.error(error);
      setFormError("Não foi possível salvar a tarefa no ambiente atual. Verifique as permissões e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    setForm((current) => ({
      ...current,
      client_id: client?.id ?? "",
      client_name: client?.name ?? "",
      process_id: "",
      process_number: "",
      responsible: current.responsible || client?.owner || "",
    }));
  }

  function handleProcessChange(processId: string) {
    const process = processes.find((item) => item.id === processId);
    setForm((current) => ({
      ...current,
      process_id: process?.id ?? "",
      process_number: process?.number ?? "",
      client_id: process?.client_id ?? current.client_id,
      client_name: process?.client_name ?? current.client_name,
      responsible: current.responsible || process?.responsible || "",
    }));
  }

  async function markComplete(task: Task) {
    const updated = await completeTaskAsync(task.id, workspaceId);
    if (updated) setSelectedTask(updated);
    await refresh("Tarefa concluída no ambiente atual.");
  }

  async function markReopen(task: Task) {
    const updated = await reopenTaskAsync(task.id, workspaceId);
    if (updated) setSelectedTask(updated);
    await refresh("Tarefa reaberta no ambiente atual.");
  }

  async function confirmArchive() {
    if (!archiveCandidate) return;
    const archived = await archiveTaskAsync(archiveCandidate.id, workspaceId);
    if (archived) {
      await refresh("Tarefa arquivada no ambiente atual.");
      closePanel();
    }
    setArchiveCandidate(null);
  }

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-7 pb-4">
        <section className="calm-hero operational-hero-compact">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Tarefas • execução diária</p>
              <h1 className="mt-1.5 max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white">Central de tarefas para prazos, responsáveis e próximas providências.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-5 text-lexos-muted">Organize pendências, acompanhe vencimentos e mantenha a execução do escritório sob controle.</p>
              <p className="mt-3 max-w-4xl rounded-2xl border border-lexos-cyan/12 bg-white/[0.035] px-4 py-3 text-sm leading-5 text-lexos-silver">{executionStats.overdue + executionStats.dueToday + executionStats.upcoming + executionStats.unassigned > 0 ? `Hoje a operação exige atenção em ${executionStats.overdue} tarefa(s) atrasada(s), ${executionStats.dueToday} tarefa(s) para hoje, ${executionStats.upcoming} tarefa(s) próximas e ${executionStats.unassigned} tarefa(s) sem responsável.` : "Nenhuma tarefa crítica no momento. Mantenha a rotina de acompanhamento atualizada."}</p>
            </div>
            <button className="calm-primary-action" onClick={openCreatePanel} type="button">
              Nova tarefa
            </button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <TaskShortcutCard active={activeView === "operational"} label="Tarefas abertas" value={String(executionStats.open)} detail="em acompanhamento" tone="premium" onClick={() => activateShortcut("operational")} />
          <TaskShortcutCard active={activeView === "overdue"} label="Atrasadas" value={String(executionStats.overdue)} detail="revisão objetiva" tone="warning" onClick={() => activateShortcut("overdue")} />
          <TaskShortcutCard active={activeView === "all"} label="Vencem hoje" value={String(executionStats.dueToday)} detail="janela do dia" tone="premium" onClick={() => activateShortcut("all")} />
          <TaskShortcutCard active={activeView === "all"} label="Próximos 7 dias" value={String(executionStats.upcoming)} detail="acompanhamento" tone="premium" onClick={() => activateShortcut("all")} />
          <TaskShortcutCard active={activeView === "all"} label="Sem responsável" value={String(executionStats.unassigned)} detail="definir dono" tone="warning" onClick={() => activateShortcut("all")} />
          <TaskShortcutCard active={activeView === "all"} label="Vinculadas a processo" value={String(executionStats.linkedToProcess)} detail="processos vinculados" tone="neutral" onClick={() => activateShortcut("all")} />
          <TaskShortcutCard active={activeView === "completed"} label="Concluídas no mês" value={String(executionStats.doneThisMonth)} detail="resultado positivo" tone="positive" onClick={() => activateShortcut("completed")} />
        </div>

        <SectionCard eyebrow="Prioridade do dia" title="Fila de execução">
          <div className="rounded-[1.35rem] bg-white/[0.018] p-2.5 lg:p-3">
            <div className="grid gap-3.5 xl:grid-cols-2">
              {priorityQueue.length ? priorityQueue.map((task) => <TaskCard key={`queue-${task.id}`} compact queue onArchive={() => setArchiveCandidate(task)} onClick={() => openDetails(task)} onComplete={() => markComplete(task)} onEdit={() => openEdit(task)} onOpenClient={task.client_id ? () => router.push(`/clientes?clientId=${task.client_id}`) : undefined} onOpenProcess={task.process_id ? () => router.push(`/processos/${task.process_id}`) : undefined} onReopen={() => markReopen(task)} task={task} />) : <EmptyState title="Nenhuma providência crítica na fila de execução." description="Mantenha as tarefas em acompanhamento com responsável e prazo definidos." />}
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Carteira de tarefas" title="Todas as providências em acompanhamento" action={!loading ? <span className="rounded-full border border-lexos-cyan/35 px-3 py-1 text-xs font-semibold text-lexos-cyan">{filteredTasks.length} tarefa(s)</span> : null}>
          <div className="grid gap-2.5 lg:grid-cols-[1.4fr_repeat(6,minmax(0,0.75fr))]">
            <input className="operational-control-compact w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-cyan" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, cliente, processo, responsável, tipo ou descrição..." value={query} />
            <Select label="Status" onChange={handleStatusFilter} value={status} values={statusOptions.map((item) => [item, statusLabel(item)])} />
            <Select label="Prioridade" onChange={(value) => setPriority(value as TaskPriority | "todas")} value={priority} values={priorityOptions.map((item) => [item, item === "todas" ? "Todas" : item])} />
            <Select label="Responsável" onChange={setResponsible} value={responsible} values={[["todos", "Todos"], ...responsibleOptions.map((item) => [item, item] as [string, string])]} />
            <Select label="Tipo" onChange={(value) => setType(value as TaskType | "todos")} value={type} values={typeOptions.map((item) => [item, typeLabel(item)])} />
            <Select label="Cliente" onChange={setClientFilter} value={clientFilter} values={[["todos", "Todos os clientes"], ["sem_cliente", "Sem cliente"], ...clients.map((client) => [client.id, client.name] as [string, string])]} />
            <Select label="Processo" onChange={setProcessFilter} value={processFilter} values={[["todos", "Todos os processos"], ["sem_processo", "Sem processo"], ...processes.filter((process) => process.status !== "arquivado").map((process) => [process.id, process.number || process.title] as [string, string])]} />
          </div>

          {session.mode !== "supabase" ? <p className="mt-3 rounded-xl border border-lexos-gold/20 bg-lexos-gold/8 p-3 text-xs leading-5 text-lexos-goldSoft">{TASK_REAL_DATA_MODE_LABEL}</p> : null}

          <div className="mt-3 space-y-2.5">
            {loading ? <EmptyState title="Carregando tarefas do escritório" description="A carteira está sendo preparada conforme o ambiente atual." /> : null}
            {!loading && !filteredTasks.length ? <EmptyState title={tasks.length ? "Nenhuma tarefa encontrada com os filtros atuais." : "Nenhuma tarefa aberta no momento."} description={tasks.length ? "Ajuste os filtros para ampliar a busca de providências." : "Cadastre uma providência, vincule a cliente/processo e defina responsável para acompanhar a execução."} actionLabel={tasks.length ? "Limpar filtros" : "Criar tarefa"} onAction={tasks.length ? () => { setQuery(""); setStatus("operacionais"); setPriority("todas"); setType("todos"); setClientFilter("todos"); setProcessFilter("todos"); setActiveView("operational"); } : openCreatePanel} /> : null}
            {!loading && filteredTasks.length ? <PaginationControls currentPage={page} onPageChange={setPage} pageSize={TASK_PAGE_SIZE} totalItems={filteredTasks.length} /> : null}
            {visibleTasks.map((task) => <TaskCard compact key={task.id} onArchive={() => setArchiveCandidate(task)} onClick={() => openDetails(task)} onComplete={() => markComplete(task)} onEdit={() => openEdit(task)} onOpenClient={task.client_id ? () => router.push(`/clientes?clientId=${task.client_id}`) : undefined} onOpenProcess={task.process_id ? () => router.push(`/processos/${task.process_id}`) : undefined} onReopen={() => markReopen(task)} task={task} />)}
            {!loading && filteredTasks.length ? <PaginationControls currentPage={page} onPageChange={setPage} pageSize={TASK_PAGE_SIZE} totalItems={filteredTasks.length} /> : null}
          </div>
        </SectionCard>
      </div>

      {panelMode ? (
        <TaskPanel
          clients={clients}
          form={form}
          formError={formError}
          mode={panelMode}
          onCancel={closePanel}
          onClientChange={handleClientChange}
          onComplete={() => selectedTask && markComplete(selectedTask)}
          onEdit={() => selectedTask && openEdit(selectedTask)}
          onProcessChange={handleProcessChange}
          onReopen={() => selectedTask && markReopen(selectedTask)}
          onRequestArchive={() => selectedTask && setArchiveCandidate(selectedTask)}
          onSubmit={submitForm}
          processOptions={processOptions}
          saving={saving}
          selectedTask={selectedTask}
          setForm={setForm}
        />
      ) : null}

      {archiveCandidate ? <ArchiveTaskModal onCancel={() => setArchiveCandidate(null)} onConfirm={confirmArchive} task={archiveCandidate} /> : null}
      {toast ? <div className="fixed bottom-6 right-6 z-[140] max-w-sm rounded-2xl border border-lexos-gold/35 bg-[#0b1728] px-5 py-4 text-sm font-semibold text-lexos-gold shadow-[0_24px_80px_rgba(0,0,0,0.55)]">{toast}</div> : null}
    </AppLayout>
  );
}

function TaskShortcutCard({ active, detail, label, onClick, tone, value }: { active: boolean; detail: string; label: string; onClick: () => void; tone: string; value: string }) {
  const tones: Record<string, string> = {
    neutral: "text-lexos-silver",
    urgent: "text-lexos-goldSoft",
    warning: "text-lexos-goldSoft",
    positive: "text-lexos-green",
    premium: "text-lexos-cyan",
  };

  return (
    <button
      className={cn(
        "calm-metric-card border text-left transition focus:outline-none",
        active ? "border-lexos-cyan/45 bg-lexos-cyan/[0.055] ring-1 ring-lexos-cyan/25" : "border-lexos-line/45 hover:border-lexos-cyan/20",
      )}
      onClick={onClick}
      type="button"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-white">{value}</p>
      <p className={cn("mt-1 text-[11px] font-semibold uppercase tracking-[0.12em]", tones[tone])}>{detail}</p>
    </button>
  );
}

function Select({ label, onChange, value, values }: { label: string; onChange: (value: string) => void; value: string; values: Array<[string, string]> }) {
  return <label className="sr-only">{label}<select aria-label={label} className="not-sr-only operational-control-compact w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white outline-none transition focus:border-lexos-cyan" onChange={(event) => onChange(event.target.value)} value={value}>{values.map(([optionValue, optionLabel]) => <option className="bg-lexos-ink text-white" key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function TaskCard({ compact = false, onArchive, onClick, onComplete, onEdit, onOpenClient, onOpenProcess, onReopen, queue = false, task }: { compact?: boolean; onArchive: () => void; onClick: () => void; onComplete: () => void; onEdit: () => void; onOpenClient?: () => void; onOpenProcess?: () => void; onReopen: () => void; queue?: boolean; task: Task }) {
  const effectiveStatus = resolveEffectiveTaskStatus(task);
  const isLate = effectiveStatus === "atrasada";
  const elevatedPriority = ["urgente", "máxima"].includes(task.priority);

  return (
    <article className={cn("calm-record-card border border-lexos-line/48", compact ? "p-3.5" : "p-4", queue ? "border-lexos-cyan/18 bg-white/[0.032]" : "") }>
      <button className="block w-full text-left" onClick={onClick} type="button">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={statusLabel(effectiveStatus)} />
              {elevatedPriority ? <StatusBadge status={task.priority} /> : <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">{task.type} • prioridade {task.priority}</span>}
            </div>
            <h3 className={cn("font-semibold tracking-[-0.015em] text-white", compact ? "mt-2 text-base" : "mt-2 text-lg")}>{task.title}</h3>
            {!compact ? <p className="mt-2 text-sm leading-5 text-lexos-muted">{task.description || "Sem descrição registrada."}</p> : null}
          </div>
          <div className={cn("shrink-0 rounded-2xl border px-3.5 py-2.5 text-left lg:text-right", isLate ? "border-lexos-gold/22 bg-lexos-gold/[0.055]" : "border-lexos-cyan/12 bg-lexos-ink/42")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lexos-muted">Prazo</p>
            <p className={cn("mt-1 font-semibold", isLate ? "text-lexos-goldSoft" : "text-lexos-cyan")}>{formatDate(task.due_at)}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Info label="Responsável" value={task.responsible || "Sem responsável"} />
          <Info label="Cliente" value={task.client_name || "Tarefa interna"} />
          <Info label="Processo" value={task.process_number || "Sem processo vinculado"} />
        </div>
        <p className="mt-3 rounded-2xl border border-lexos-cyan/12 bg-white/[0.026] p-3 text-sm leading-5 text-lexos-silver"><span className="font-semibold text-lexos-cyan">Próxima providência:</span> {task.next_action || "Definir próxima providência."}</p>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-lexos-line/45 pt-3">
        <button className="rounded-full border border-lexos-cyan/40 bg-lexos-cyan/10 px-3 py-1.5 text-xs font-semibold text-lexos-cyan transition hover:bg-lexos-cyan/16" onClick={onClick} type="button">Abrir tarefa</button>
        {effectiveStatus === "concluida" ? <button className="rounded-full border border-lexos-line/70 px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:border-lexos-cyan/35 hover:text-lexos-cyan" onClick={onReopen} type="button">Reabrir</button> : <button className="rounded-full border border-lexos-line/70 px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:border-lexos-green/35 hover:text-lexos-green" onClick={onComplete} type="button">Concluir</button>}
        <button className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-lexos-muted transition hover:border-lexos-line hover:text-lexos-silver" onClick={onEdit} type="button">Editar prazo</button>
        {onOpenProcess ? <button className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-lexos-muted transition hover:border-lexos-line hover:text-lexos-silver" onClick={onOpenProcess} type="button">Processo</button> : null}
        {onOpenClient ? <button className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-lexos-muted transition hover:border-lexos-line hover:text-lexos-silver" onClick={onOpenClient} type="button">Cliente</button> : null}
        {effectiveStatus !== "arquivada" ? <button className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-lexos-muted transition hover:border-lexos-wine/35 hover:text-lexos-goldSoft" onClick={onArchive} type="button">Arquivar</button> : null}
      </div>
    </article>
  );
}

function TaskPanel({ clients, form, formError, mode, onCancel, onClientChange, onComplete, onEdit, onProcessChange, onReopen, onRequestArchive, onSubmit, processOptions, saving, selectedTask, setForm }: { clients: Client[]; form: TaskInput; formError: string | null; mode: PanelMode; onCancel: () => void; onClientChange: (clientId: string) => void; onComplete: () => void; onEdit: () => void; onProcessChange: (processId: string) => void; onReopen: () => void; onRequestArchive: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; processOptions: Process[]; saving: boolean; selectedTask: Task | null; setForm: React.Dispatch<React.SetStateAction<TaskInput>> }) {
  const readonly = mode === "details";
  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-lexos-ink/74 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 w-full max-w-5xl rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-5 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5 lg:p-7">
        <div className="flex flex-col gap-3 border-b border-lexos-line/75 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{mode === "create" ? "Nova tarefa" : mode === "edit" ? "Editar tarefa" : "Detalhes da tarefa"}</p><h2 className="mt-2 text-2xl font-semibold text-white">{selectedTask?.title || "Cadastro operacional"}</h2><p className="mt-2 text-sm text-lexos-muted">Vínculos do escritório no ambiente conectado e dados locais apenas na demonstração.</p></div>
          <button className="rounded-2xl border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Fechar</button>
        </div>

        {readonly && selectedTask ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 md:grid-cols-4"><Info label="Tipo" value={selectedTask.type} /><Info label="Status" value={statusLabel(resolveEffectiveTaskStatus(selectedTask))} /><Info label="Prioridade" value={selectedTask.priority} /><Info label="Responsável" value={selectedTask.responsible} /><Info label="Cliente" value={selectedTask.client_name || "Tarefa interna"} /><Info label="Processo" value={selectedTask.process_number || "Sem processo"} /><Info label="Prazo" value={formatDate(selectedTask.due_at)} /><Info label="Lembrete" value={formatDateTime(selectedTask.reminder_at)} /></div>
            <TextBlock title="Descrição" value={selectedTask.description || "Sem descrição registrada."} />
            <TextBlock title="Próxima ação" value={selectedTask.next_action || "Sem próxima ação."} />
            <TextBlock title="Observações" value={selectedTask.notes || "Sem observações."} />
            <div className="rounded-2xl border border-lexos-gold/20 bg-lexos-gold/8 p-4 text-xs leading-5 text-lexos-goldSoft">Histórico operacional: criada em {formatDateTime(selectedTask.created_at)}; atualizada em {formatDateTime(selectedTask.updated_at)}{selectedTask.completed_at ? `; concluída em ${formatDateTime(selectedTask.completed_at)}` : ""}{selectedTask.archived_at ? `; arquivada em ${formatDateTime(selectedTask.archived_at)}` : ""}.</div>
            <div className="flex flex-wrap gap-3"><button className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/18" onClick={onEdit} type="button">Editar dados</button>{resolveEffectiveTaskStatus(selectedTask) === "concluida" ? <button className="rounded-2xl border border-lexos-gold/45 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/10" onClick={onReopen} type="button">Reabrir tarefa</button> : resolveEffectiveTaskStatus(selectedTask) !== "arquivada" ? <button className="rounded-2xl border border-lexos-green/45 px-4 py-3 text-sm font-semibold text-lexos-green transition hover:bg-lexos-green/10" onClick={onComplete} type="button">Concluir tarefa</button> : null}{resolveEffectiveTaskStatus(selectedTask) !== "arquivada" ? <button className="rounded-2xl border border-lexos-wine/55 px-4 py-3 text-sm font-semibold text-lexos-red transition hover:bg-lexos-wine/14" onClick={onRequestArchive} type="button">Arquivar tarefa</button> : null}</div>
          </div>
        ) : (
          <form className="mt-5 space-y-5" onSubmit={onSubmit}>
            {!clients.length || !processOptions.length ? <div className="space-y-2 rounded-2xl border border-lexos-gold/25 bg-lexos-gold/8 p-4 text-xs leading-5 text-lexos-goldSoft">{!clients.length ? <p>Nenhum cliente cadastrado ainda.</p> : null}{!processOptions.length ? <p>Nenhum processo cadastrado ainda.</p> : null}<p>Você pode criar uma tarefa interna sem vínculo e vincular depois.</p></div> : null}
            <div className="grid gap-4 md:grid-cols-2"><Field label="Título" onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Ex.: Preparar réplica" value={form.title} /><Field label="Responsável" onChange={(value) => setForm((current) => ({ ...current, responsible: value }))} placeholder="Dra. Helena" value={form.responsible} /></div>
            <div className="grid gap-4 md:grid-cols-4">
              <FieldSelect label="Tipo" onChange={(value) => setForm((current) => ({ ...current, type: value as TaskType }))} value={form.type} values={typeOptions.filter((item) => item !== "todos").map((item) => [item, typeLabel(item)])} />
              <FieldSelect label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value as TaskStatus }))} value={form.status} values={statusOptions.filter((item): item is TaskStatus => !["operacionais", "todas"].includes(item)).map((item) => [item, statusLabel(item)])} />
              <FieldSelect label="Prioridade" onChange={(value) => setForm((current) => ({ ...current, priority: value as TaskPriority }))} value={form.priority} values={priorityOptions.filter((item) => item !== "todas").map((item) => [item, item])} />
              <Field label="Prazo/data limite" onChange={(value) => setForm((current) => ({ ...current, due_at: value }))} type="date" value={form.due_at} />
            </div>
            <div className="grid gap-4 md:grid-cols-3"><FieldSelect label="Cliente vinculado" onChange={onClientChange} value={form.client_id ?? ""} values={[["", "Tarefa interna / sem cliente"], ...clients.map((client) => [client.id, client.name] as [string, string])]} /><FieldSelect label="Processo vinculado" onChange={onProcessChange} value={form.process_id ?? ""} values={[["", "Sem processo vinculado"], ...processOptions.map((process) => [process.id, `${process.number || process.title} • ${process.client_name}`] as [string, string])]} /><Field label="Lembrete" onChange={(value) => setForm((current) => ({ ...current, reminder_at: value }))} type="datetime-local" value={form.reminder_at ?? ""} /></div>
            <TextArea label="Descrição" onChange={(value) => setForm((current) => ({ ...current, description: value }))} placeholder="Descreva o contexto jurídico-operacional." value={form.description} />
            <TextArea label="Próxima ação" onChange={(value) => setForm((current) => ({ ...current, next_action: value }))} placeholder="Qual movimento deve acontecer agora?" value={form.next_action} />
            <TextArea label="Observações" onChange={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder="Notas internas." value={form.notes} />
            {formError ? <p className="rounded-2xl border border-lexos-wine/50 bg-lexos-wine/12 p-4 text-sm text-lexos-red">{formError}</p> : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-xl border border-lexos-gold/55 bg-lexos-gold px-4 py-2.5 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar tarefa"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, onChange, placeholder, type = "text", value }: { label: string; onChange: (value: string) => void; placeholder?: string; type?: string; value?: string }) {
  return <label className="block text-sm font-semibold text-lexos-muted">{label}<input className="mt-2 w-full rounded-2xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value ?? ""} /></label>;
}

function FieldSelect({ label, onChange, value, values }: { label: string; onChange: (value: string) => void; value: string; values: Array<[string, string]> }) {
  return <label className="block text-sm font-semibold text-lexos-muted">{label}<select className="mt-2 w-full rounded-2xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} value={value}>{values.map(([optionValue, optionLabel]) => <option className="bg-lexos-ink text-white" key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function TextArea({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return <label className="block text-sm font-semibold text-lexos-muted">{label}<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} /></label>;
}

function Info({ className, label, value }: { className?: string; label: string; value: string }) {
  return <div className={cn("rounded-xl border border-lexos-line/70 bg-lexos-ink/55 p-2.5", className)}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>;
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4"><p className="text-sm text-lexos-muted">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{value}</p></div>;
}

function ArchiveTaskModal({ onCancel, onConfirm, task }: { onCancel: () => void; onConfirm: () => void; task: Task }) {
  return <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-lexos-ink/78 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Confirmação</p><h2 className="mt-3 text-2xl font-semibold text-white">Arquivar tarefa</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Esta tarefa será marcada como arquivada no ambiente atual. O registro não será excluído.</p><div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Tarefa selecionada</p><p className="mt-2 text-lg font-semibold text-white">{task.title}</p><p className="mt-1 text-sm text-lexos-muted">Responsável: {task.responsible}</p></div></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-wine/65 bg-lexos-wine/18 px-5 py-3 text-sm font-semibold text-lexos-red transition hover:-translate-y-0.5 hover:bg-lexos-wine/26" onClick={onConfirm} type="button">Arquivar tarefa</button></div></div></div>;
}
