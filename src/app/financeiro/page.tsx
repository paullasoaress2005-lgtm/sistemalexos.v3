"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { RestrictedAccess } from "@/components/RestrictedAccess";
import { EmptyState, PaginationControls, SectionCard, StatusBadge } from "@/components/ui";
import { FALLBACK_WORKSPACE_ID, listClientsAsync, type Client } from "@/lib/data/clients";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import { listProcessesAsync, type Process } from "@/lib/data/processes";
import {
  archiveFinancialRecordAsync,
  cancelFinancialRecordAsync,
  createFinancialRecordAsync,
  FINANCE_REAL_DATA_MODE_LABEL,
  filterFinancialRecords,
  financeMatchesView,
  formatCurrency,
  formatDate,
  getDelinquentClients,
  getFinancialRecordByIdAsync,
  isPastDate,
  listFinancialRecordsAsync,
  markFinancialRecordAsPaidAsync,
  reopenFinancialRecordAsync,
  rescheduleFinancialRecordAsync,
  updateFinancialRecordAsync,
  type FinanceDirection,
  type FinanceRecordType,
  type FinanceStatus,
  type FinanceView,
  type FinancialRecord,
  type FinancialRecordInput,
  type PaymentMethod,
} from "@/lib/data/finance";
import { cn } from "@/lib/utils";

const viewLabels: Record<FinanceView, string> = {
  principal: "Carteira operacional",
  receber: "Total em aberto",
  vencidos: "Valores vencidos",
  inadimplentes: "Clientes inadimplentes",
  prevista: "Previsão futura",
  proximas: "Parcelas próximas",
  pendentes: "Ações de cobrança pendentes",
  recebidos: "Recebidos no mês",
  arquivados: "Arquivados/Cancelados",
};

const typeOptions: Array<FinanceRecordType | "todos"> = ["todos", "honorarios", "sucumbencia", "consultoria", "mensalidade", "parcela", "custas", "acordo", "reembolso", "despesa", "repasse_parceria", "outro"];
const statusOptions: Array<FinanceStatus | "todos"> = ["todos", "previsto", "pendente", "aguardando", "pago", "vencido", "cancelado", "arquivado"];
const statusLabels: Record<FinanceStatus | "todos", string> = {
  todos: "Todos",
  previsto: "Previsto",
  pendente: "Pendente",
  aguardando: "Aguardando retorno/pagamento",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
};

const directionOptions: Array<FinanceDirection | "todos"> = ["todos", "entrada", "saida"];
const paymentOptions: PaymentMethod[] = ["nao_definido", "pix", "boleto", "transferencia", "dinheiro", "cartao", "outro"];
const viewAliases: Record<string, FinanceView> = {
  receber: "receber",
  vencidos: "vencidos",
  inadimplentes: "inadimplentes",
  prevista: "prevista",
  proximas: "proximas",
  pendentes: "pendentes",
  recebidos: "recebidos",
  arquivados: "arquivados",
  receivable: "receber",
  overdue: "vencidos",
  delinquent: "inadimplentes",
  forecast: "prevista",
  upcoming: "proximas",
  pending: "pendentes",
};

const FINANCE_PAGE_SIZE = 8;

type Toast = { message: string; tone?: "success" | "warning" };
type ConfirmAction = "arquivar" | "cancelar";
type FormMode = "create" | "edit";
type PriorityItem = { title: string; client: string; value: string; status: string; nextStep: string; responsible: string; tone: "critical" | "warning" | "neutral"; record?: FinancialRecord };

type FinanceFormState = {
  title: string;
  client_id: string;
  process_id: string;
  type: FinanceRecordType;
  direction: FinanceDirection;
  status: FinanceStatus;
  amount: string;
  due_at: string;
  responsible: string;
  payment_method: PaymentMethod;
  category: string;
  installment_number: string;
  installment_total: string;
  description: string;
  next_action: string;
  notes: string;
};


function parseMoneyInput(value: string) {
  const raw = value.trim();
  if (!raw) return 0;
  const sanitized = raw.replace(/\s/g, "").replace(/R\$/gi, "");
  const hasComma = sanitized.includes(",");
  const normalized = hasComma
    ? sanitized.replace(/\./g, "").replace(",", ".")
    : sanitized.replace(/,/g, "");
  return Number(normalized.replace(/[^0-9.-]/g, ""));
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const brDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  return trimmed;
}

function enrichFinancialRecords(records: FinancialRecord[], clients: Client[], processes: Process[]) {
  return records.map((record) => {
    const client = record.client_id ? clients.find((item) => item.id === record.client_id) : undefined;
    const process = record.process_id ? processes.find((item) => item.id === record.process_id) : undefined;
    return {
      ...record,
      client_name: record.client_name ?? client?.name,
      process_number: record.process_number ?? process?.number ?? process?.title,
    };
  });
}

function getOperationalStatus(record: FinancialRecord): FinanceStatus {
  if (["pago", "cancelado", "arquivado"].includes(record.status)) return record.status;
  if (isPastDate(record.due_at)) return record.status === "aguardando" ? "aguardando" : "vencido";
  return record.status;
}

function getFinancialRisk(record: FinancialRecord) {
  if (["cancelado", "arquivado", "pago"].includes(record.status)) return "controlado";
  if (financeMatchesView(record, "vencidos")) return record.amount >= 10000 ? "exposição alta" : "vencido";
  if (record.status === "aguardando") return "aguardando retorno";
  if (record.status === "previsto") return "previsível";
  return "monitorar";
}

function getRecordOrigin(record: FinancialRecord) {
  if (record.process_number) return `Processo ${record.process_number}`;
  if (record.category) return record.category;
  return record.type.replaceAll("_", " ");
}

const emptyForm: FinanceFormState = {
  title: "",
  client_id: "",
  process_id: "",
  type: "honorarios",
  direction: "entrada",
  status: "pendente",
  amount: "",
  due_at: new Date().toISOString().slice(0, 10),
  responsible: "Carla Nogueira",
  payment_method: "nao_definido",
  category: "Recebível operacional",
  installment_number: "",
  installment_total: "",
  description: "",
  next_action: "Acompanhar recebimento e registrar retorno.",
  notes: "",
};

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<AppLayout><div className="rounded-[1.35rem] border border-lexos-line bg-lexos-panel p-8 text-lexos-muted">Carregando financeiro do workspace...</div></AppLayout>}>
      <FinanceiroContent />
    </Suspense>
  );
}

function FinanceiroContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(FALLBACK_WORKSPACE_ID);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [activeView, setActiveView] = useState<FinanceView>("receber");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FinanceStatus | "todos">("todos");
  const [type, setType] = useState<FinanceRecordType | "todos">("todos");
  const [direction, setDirection] = useState<FinanceDirection | "todos">("todos");
  const [responsible, setResponsible] = useState<string | "todos">("todos");
  const [clientId, setClientId] = useState<string | "todos">("todos");
  const [period, setPeriod] = useState<"todos" | "vencidos" | "proximos_7" | "proximos_15" | "proximos_30" | "mes_atual">("todos");
  const [selected, setSelected] = useState<FinancialRecord | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [form, setForm] = useState<FinanceFormState>(emptyForm);
  const [reschedule, setReschedule] = useState<FinancialRecord | null>(null);
  const [newDueAt, setNewDueAt] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ action: ConfirmAction; record: FinancialRecord } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(false);

  async function refreshRecords(nextWorkspaceId = workspaceId, nextClients = clients, nextProcesses = processes) {
    const nextRecords = await listFinancialRecordsAsync(nextWorkspaceId, { includeArchived: true, view: undefined });
    setRecords(enrichFinancialRecords(nextRecords, nextClients, nextProcesses));
  }

  useEffect(() => {
    let active = true;
    async function loadData() {
      const session = getCurrentSessionOrFallback();
      const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || FALLBACK_WORKSPACE_ID;
      setWorkspaceId(sessionWorkspaceId);
      const [nextClients, nextProcesses, nextRecords] = await Promise.all([
        listClientsAsync(sessionWorkspaceId),
        listProcessesAsync(sessionWorkspaceId, { includeArchived: true }),
        listFinancialRecordsAsync(sessionWorkspaceId, { includeArchived: true, view: undefined }),
      ]);
      if (!active) return;
      setClients(nextClients);
      setProcesses(nextProcesses);
      setRecords(enrichFinancialRecords(nextRecords, nextClients, nextProcesses));
    }
    loadData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    const financeId = searchParams.get("financeId");
    const clientIdParam = searchParams.get("clientId");
    const processIdParam = searchParams.get("processId");
    const action = searchParams.get("action");
    if (viewParam && viewAliases[viewParam]) setActiveView(viewAliases[viewParam]);
    if (financeId) {
      getFinancialRecordByIdAsync(financeId, workspaceId).then((record) => { if (record) setSelected(enrichFinancialRecords([record], clients, processes)[0]); });
    }
    if (action === "novo" || action === "nova") openCreateForm({ clientId: clientIdParam, processId: processIdParam });
  // openCreateForm is intentionally kept outside the dependency list to avoid reopening the modal after form edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, processes, searchParams, workspaceId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const operationalRecords = useMemo(() => records.map((record) => ({ ...record, status: getOperationalStatus(record) })), [records]);
  const stats = useMemo(() => {
    const totalEmAberto = operationalRecords.filter((record) => record.direction === "entrada" && !["pago", "cancelado", "arquivado"].includes(record.status));
    const vencidos = totalEmAberto.filter((record) => financeMatchesView(record, "vencidos"));
    const recebidos = records.filter((record) => financeMatchesView(record, "recebidos"));
    const previstos = totalEmAberto.filter((record) => !financeMatchesView(record, "vencidos"));
    const pendentes = totalEmAberto.filter((record) => record.status === "pendente" || record.status === "previsto");
    const acompanhamento = totalEmAberto.filter((record) => record.status === "aguardando");
    return [
      { view: "receber" as const, label: "Total a receber", value: formatCurrency(totalEmAberto.reduce((sum, record) => sum + record.amount, 0)), detail: "recebíveis internos em aberto", tone: "premium" },
      { view: "vencidos" as const, label: "Total vencido", value: formatCurrency(vencidos.reduce((sum, record) => sum + record.amount, 0)), detail: `${vencidos.length} cobrança(s) para revisar`, tone: "urgent" },
      { view: "recebidos" as const, label: "Recebido no mês", value: formatCurrency(recebidos.reduce((sum, record) => sum + record.amount, 0)), detail: "confirmado manualmente", tone: "positive" },
      { view: "prevista" as const, label: "Receita prevista", value: formatCurrency(previstos.reduce((sum, record) => sum + record.amount, 0)), detail: "entradas futuras mapeadas", tone: "neutral" },
      { view: "inadimplentes" as const, label: "Clientes inadimplentes", value: String(getDelinquentClients(records).length), detail: "com valor vencido", tone: "warning" },
      { view: "pendentes" as const, label: "Cobranças pendentes", value: String(pendentes.length), detail: "pedem ação interna", tone: "warning" },
      { view: "pendentes" as const, label: "Em acompanhamento", value: String(acompanhamento.length), detail: "aguardando retorno", tone: "neutral" },
      { view: "recebidos" as const, label: "Recebimentos confirmados", value: String(recebidos.length), detail: "baixas registradas pela equipe", tone: "positive" },
    ];
  }, [operationalRecords, records]);
  const priorities = useMemo<PriorityItem[]>(() => {
    const active = operationalRecords.filter((record) => record.direction === "entrada" && !["pago", "cancelado", "arquivado"].includes(record.status));
    const overdue = active.filter((record) => financeMatchesView(record, "vencidos"));
    const oldestOverdue = [...overdue].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const highestOverdue = [...overdue].sort((a, b) => b.amount - a.amount)[0];
    const noReturn = [...active].filter((record) => record.status === "aguardando").sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
    const nextAction = [...active].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const toPriority = (title: string, record: FinancialRecord | undefined, fallback: string, tone: PriorityItem["tone"]): PriorityItem => ({
      title,
      client: record?.client_name ?? record?.title ?? "Sem pendência no recorte",
      value: record ? formatCurrency(record.amount) : "—",
      status: record ? statusLabels[getOperationalStatus(record)] : "Sob controle",
      nextStep: record?.next_action || fallback,
      responsible: record?.responsible || "A definir",
      tone: record ? tone : "neutral",
      record,
    });
    return [
      toPriority("Cobrança mais urgente", oldestOverdue, "Revisar carteira vencida.", "critical"),
      toPriority("Maior valor vencido", highestOverdue, "Monitorar exposição financeira.", "warning"),
      toPriority("Cliente sem retorno financeiro", noReturn, "Registrar contato e definir nova revisão.", "warning"),
      toPriority("Próxima ação recomendada", nextAction, "Revisar previsibilidade da carteira.", "neutral"),
    ];
  }, [operationalRecords]);
  const responsibles = useMemo(() => Array.from(new Set(records.map((record) => record.responsible).filter(Boolean))).sort(), [records]);
  const filtered = useMemo(() => {
    const base = filterFinancialRecords(operationalRecords, {
      view: activeView === "receber" ? undefined : activeView,
      query,
      status,
      type,
      direction,
      responsible,
      clientId,
      period,
      includeArchived: activeView === "arquivados",
    });
    if (activeView !== "receber") return base;
    return base.filter((record) => record.direction === "entrada" && !["pago", "cancelado", "arquivado"].includes(record.status));
  }, [activeView, clientId, direction, operationalRecords, period, query, responsible, status, type]);
  const delinquentClients = useMemo(() => getDelinquentClients(operationalRecords), [operationalRecords]);
  const visibleTotal = useMemo(() => filtered.reduce((total, record) => total + record.amount, 0), [filtered]);
  const totalOpenRecords = useMemo(
    () => operationalRecords.filter((record) => record.direction === "entrada" && !["pago", "cancelado", "arquivado"].includes(record.status)),
    [operationalRecords],
  );
  const totalOpenAmount = useMemo(() => totalOpenRecords.reduce((sum, record) => sum + record.amount, 0), [totalOpenRecords]);
  const hasActiveFilters = useMemo(
    () =>
      Boolean(query.trim()) ||
      status !== "todos" ||
      type !== "todos" ||
      direction !== "todos" ||
      responsible !== "todos" ||
      clientId !== "todos" ||
      period !== "todos",
    [clientId, direction, period, query, responsible, status, type],
  );
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (status !== "todos") labels.push(`Status: ${statusLabels[status]}`);
    if (type !== "todos") labels.push(`Tipo: ${type.replaceAll("_", " ")}`);
    if (direction !== "todos") labels.push(`Direção: ${direction}`);
    if (responsible !== "todos") labels.push(`Responsável: ${responsible}`);
    if (clientId !== "todos") labels.push(`Cliente: ${clients.find((client) => client.id === clientId)?.name ?? clientId}`);
    if (period !== "todos") labels.push(`Período: ${period.replaceAll("_", " ")}`);
    if (query.trim()) labels.push(`Busca: "${query.trim()}"`);
    return labels;
  }, [clientId, clients, direction, period, query, responsible, status, type]);
  const executiveReading = useMemo(() => {
    const overdue = operationalRecords.filter((record) => record.direction === "entrada" && financeMatchesView(record, "vencidos"));
    const waiting = operationalRecords.filter((record) => record.direction === "entrada" && record.status === "aguardando");
    const exposure = overdue.reduce((sum, record) => sum + record.amount, 0);
    return {
      cashRisk: overdue.length ? `${overdue.length} recebível(is) vencido(s) somam ${formatCurrency(exposure)}.` : "Sem recebíveis vencidos no recorte atual.",
      bottleneck: waiting.length ? `${waiting.length} cobrança(s) aguardam retorno e revisão da equipe.` : "Acompanhamentos sem retorno estão sob controle.",
      recommendation: overdue.length ? "Priorize contato humano nos vencidos de maior valor e registre a próxima ação." : "Revise os próximos vencimentos e confirme a previsibilidade da semana.",
    };
  }, [operationalRecords]);

  function showToast(message: string, tone: Toast["tone"] = "success") {
    setToast({ message, tone });
  }

  function setView(view: FinanceView) {
    setActiveView(view);
    setStatus("todos");
    router.replace(`/financeiro?view=${view}`, { scroll: false });
  }

  function showPaidRecords() {
    setActiveView("principal");
    setStatus("pago");
    router.replace("/financeiro?view=principal", { scroll: false });
  }

  function openCreateForm(prefill?: { clientId?: string | null; processId?: string | null }) {
    const selectedProcess = prefill?.processId ? processes.find((process) => process.id === prefill.processId) : undefined;
    const selectedClient = selectedProcess?.client_id
      ? clients.find((client) => client.id === selectedProcess.client_id)
      : prefill?.clientId
        ? clients.find((client) => client.id === prefill.clientId)
        : undefined;
    setForm({
      ...emptyForm,
      client_id: selectedClient?.id ?? selectedProcess?.client_id ?? "",
      process_id: selectedProcess?.id ?? "",
      responsible: selectedClient?.owner ?? selectedProcess?.responsible ?? emptyForm.responsible,
      title: selectedClient ? `Cobrança interna • ${selectedClient.name}` : emptyForm.title,
    });
    setFormMode("create");
  }

  function openEditForm(record: FinancialRecord) {
    setForm(recordToForm(record));
    setFormMode("edit");
    setSelected(record);
  }

  function saveForm() {
    const title = form.title.trim();
    const amount = parseMoneyInput(form.amount);
    const dueAt = normalizeDateInput(form.due_at);
    if (!title || !Number.isFinite(amount) || amount <= 0 || !dueAt || !form.responsible.trim()) {
      showToast("Preencha título, valor, vencimento e responsável para salvar.", "warning");
      return;
    }
    setSaving(true);
    const client = clients.find((item) => item.id === form.client_id);
    const linkedProcess = processes.find((item) => item.id === form.process_id);
    const input: FinancialRecordInput = {
      title,
      client_id: client?.id,
      client_name: client?.name,
      process_id: linkedProcess?.id,
      process_number: linkedProcess?.number,
      type: form.type,
      direction: form.direction,
      status: form.status,
      amount,
      due_at: dueAt,
      responsible: form.responsible.trim(),
      payment_method: form.payment_method,
      category: form.category.trim() || "Recebível operacional",
      installment_number: form.installment_number ? Number(form.installment_number) : undefined,
      installment_total: form.installment_total ? Number(form.installment_total) : undefined,
      description: form.description.trim(),
      next_action: form.next_action.trim(),
      notes: form.notes.trim(),
    };

    window.setTimeout(async () => {
      try {
        if (formMode === "edit" && selected) {
          const updated = await updateFinancialRecordAsync(selected.id, input, workspaceId);
          if (updated) setSelected(enrichFinancialRecords([updated], clients, processes)[0]);
          showToast("Lançamento financeiro atualizado com sucesso.");
        } else {
          const created = await createFinancialRecordAsync(input, workspaceId);
          setSelected(enrichFinancialRecords([created], clients, processes)[0]);
          showToast("Lançamento financeiro cadastrado com sucesso.");
        }
        await refreshRecords(workspaceId, clients, processes);
        setFormMode(null);
      } catch (error) {
        if (process.env.NODE_ENV === "development") console.error("[LEX.OS] Financeiro: erro ao salvar lançamento real", error);
        showToast("Não foi possível salvar o lançamento financeiro. Verifique o escritório ou tente novamente.", "warning");
      } finally {
        setSaving(false);
      }
    }, 250);
  }

  async function paid(record: FinancialRecord) {
    const updated = await markFinancialRecordAsPaidAsync(record.id, undefined, new Date().toISOString(), workspaceId);
    if (updated) setSelected(enrichFinancialRecords([updated], clients, processes)[0]);
    await refreshRecords(workspaceId, clients, processes);
    showToast("Pagamento marcado como confirmado no controle interno. Revisão humana registrada.");
  }

  async function reopen(record: FinancialRecord) {
    const updated = await reopenFinancialRecordAsync(record.id, workspaceId);
    if (updated) setSelected(enrichFinancialRecords([updated], clients, processes)[0]);
    await refreshRecords(workspaceId, clients, processes);
    showToast("Cobrança reaberta no modo de dados atual.");
  }

  async function confirmReschedule() {
    if (!reschedule || !newDueAt) return;
    const updated = await rescheduleFinancialRecordAsync(reschedule.id, normalizeDateInput(newDueAt), workspaceId);
    if (updated) setSelected(enrichFinancialRecords([updated], clients, processes)[0]);
    await refreshRecords(workspaceId, clients, processes);
    setReschedule(null);
    showToast("Vencimento remarcado no modo de dados atual.");
  }

  async function confirmArchiveOrCancel() {
    if (!confirmAction) return;
    const updated = confirmAction.action === "arquivar" ? await archiveFinancialRecordAsync(confirmAction.record.id, workspaceId) : await cancelFinancialRecordAsync(confirmAction.record.id, workspaceId);
    if (updated) setSelected(enrichFinancialRecords([updated], clients, processes)[0]);
    await refreshRecords(workspaceId, clients, processes);
    setConfirmAction(null);
    showToast(confirmAction.action === "arquivar" ? "Registro financeiro arquivado no modo de dados atual." : "Registro financeiro cancelado no modo de dados atual.");
  }

  return (
    <AppLayout>
      <RestrictedAccess module="financeiro">
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
        <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Financeiro • acompanhamento interno</p>
              <h1 className="mt-1.5 max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white">Financeiro executivo do escritório.</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-lexos-muted">Controle interno de recebíveis, vencidos, repasses e previsibilidade de caixa em uma leitura serena para revisão humana.</p>
              <p className="mt-3 inline-flex rounded-full border border-lexos-gold/20 bg-lexos-gold/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lexos-goldSoft">Controle interno • sem gateway, PIX, boleto ou contabilidade oficial</p>
              {FINANCE_REAL_DATA_MODE_LABEL ? <p className="mt-2 text-xs leading-5 text-lexos-muted">Dados de demonstração/local • seguro para testar. {FINANCE_REAL_DATA_MODE_LABEL}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button className="calm-primary-action" onClick={() => openCreateForm()} type="button">+ Nova cobrança</button>
              <button className="calm-secondary-action" onClick={() => setView("vencidos")} type="button">Ver vencidos</button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => <Shortcut active={activeView === stat.view} detail={stat.detail} key={`${stat.label}-${index}`} label={stat.label} onClick={() => setView(stat.view)} tone={stat.tone} value={stat.value} />)}
        </section>

        <SectionCard eyebrow="Prioridade financeira" title="O que pede revisão humana agora">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {priorities.map((item) => <PriorityCard item={item} key={item.title} onOpen={() => setSelected(item.record ?? null)} />)}
          </div>
        </SectionCard>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <SectionCard eyebrow="Carteira financeira" title={viewLabels[activeView]} action={<span className="rounded-full border border-lexos-gold/35 px-3 py-1 text-xs font-semibold text-lexos-gold">{filtered.length} registros • {formatCurrency(visibleTotal)}</span>}>
            <div className="mb-3 flex flex-wrap gap-2">
              {([['principal', 'Todos'], ['vencidos', 'Vencidos'], ['proximas', 'A vencer'], ['pendentes', 'Pendentes'], ['arquivados', 'Arquivados']] as Array<[FinanceView, string]>).map(([view, label]) => <button className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", activeView === view && status === "todos" ? "border-lexos-cyan/45 bg-lexos-cyan/10 text-lexos-cyan" : "border-lexos-line/55 bg-white/[0.026] text-lexos-muted hover:border-lexos-cyan/25 hover:text-lexos-silver")} key={view} onClick={() => setView(view)} type="button">{label}</button>)}
              <button className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", activeView === "principal" && status === "pago" ? "border-lexos-cyan/45 bg-lexos-cyan/10 text-lexos-cyan" : "border-lexos-line/55 bg-white/[0.026] text-lexos-muted hover:border-lexos-cyan/25 hover:text-lexos-silver")} onClick={showPaidRecords} type="button">Pagos</button>
            </div>
            {activeView === "receber" && hasActiveFilters ? <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full border border-lexos-gold/40 bg-lexos-gold/10 px-3 py-1 text-xs font-semibold text-lexos-gold">Total aberto: {formatCurrency(totalOpenAmount)}</span>{activeFilterLabels.map((label) => <span className="rounded-full border border-lexos-line bg-lexos-ink/85 px-3 py-1 text-xs text-lexos-silver" key={label}>{label}</span>)}</div> : null}
            <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
              <input className="operational-control-compact w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-cyan" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, processo ou cobrança..." value={query} />
              <FilterSelect label="Status" labels={statusLabels} onChange={(value) => setStatus(value as FinanceStatus | "todos")} options={statusOptions} value={status} />
              <FilterSelect label="Responsável" onChange={(value) => setResponsible(value)} options={["todos", ...responsibles]} value={responsible} />
              <FilterSelect label="Período" onChange={(value) => setPeriod(value as typeof period)} options={["todos", "vencidos", "proximos_7", "proximos_15", "proximos_30", "mes_atual"]} labels={{ todos: "Todos", vencidos: "Vencidos", proximos_7: "7 dias", proximos_15: "15 dias", proximos_30: "30 dias", mes_atual: "Mês atual" }} value={period} />
            </div>
            <details className="mb-3 rounded-2xl border border-lexos-line/45 bg-white/[0.022] px-3 py-2 text-xs text-lexos-muted"><summary className="cursor-pointer font-semibold text-lexos-silver">Filtros avançados</summary><div className="mt-3 grid gap-2 md:grid-cols-3"><FilterSelect label="Tipo" onChange={(value) => setType(value as FinanceRecordType | "todos")} options={typeOptions} value={type} /><FilterSelect label="Direção" onChange={(value) => setDirection(value as FinanceDirection | "todos")} options={directionOptions} value={direction} /><FilterSelect label="Cliente" onChange={(value) => setClientId(value)} options={["todos", ...clients.map((client) => client.id)]} labels={{ todos: "Todos", ...Object.fromEntries(clients.map((client) => [client.id, client.name])) }} value={clientId} /></div></details>
            {activeView === "inadimplentes" ? <DelinquentList clients={delinquentClients} onOpen={(record) => setSelected(record)} /> : <RecordTable onArchive={(record) => setConfirmAction({ action: "arquivar", record })} onOpen={(record) => setSelected(record)} onOpenCreate={() => openCreateForm()} onPaid={paid} onReschedule={(record) => { setReschedule(record); setNewDueAt(record.due_at); }} records={filtered} />}
          </SectionCard>

          <SectionCard className="h-fit" eyebrow="Leitura executiva" title="Decisão da semana">
            <div className="space-y-3 text-xs leading-5 text-lexos-muted">
              <ExecutiveNote label="Risco de caixa" text={executiveReading.cashRisk} tone="warning" />
              <ExecutiveNote label="Principal gargalo" text={executiveReading.bottleneck} />
              <ExecutiveNote label="Recomendação" text={executiveReading.recommendation} tone="positive" />
              <p className="rounded-xl border border-lexos-cyan/25 bg-lexos-cyan/8 p-3 text-lexos-silver">Financeiro é controle interno do escritório. Não executa cobrança bancária, pagamento, PIX, boleto ou contabilidade oficial.</p>
              <p className="text-[11px] text-lexos-muted">Toda atualização depende de registro e revisão humana da equipe.</p>
            </div>
          </SectionCard>
        </section>
      </div>

      {selected ? <DetailModal onArchive={(record) => setConfirmAction({ action: "arquivar", record })} onCancel={(record) => setConfirmAction({ action: "cancelar", record })} onClose={() => setSelected(null)} onEdit={openEditForm} onPaid={paid} onReopen={reopen} onReschedule={(record) => { setReschedule(record); setNewDueAt(record.due_at); }} record={selected} /> : null}
      {formMode ? <FormModal clients={clients} form={form} mode={formMode} onCancel={() => setFormMode(null)} onChange={setForm} onSave={saveForm} processes={processes} saving={saving} /> : null}
      {reschedule ? <RescheduleModal dueAt={newDueAt} onChange={setNewDueAt} onClose={() => setReschedule(null)} onSave={confirmReschedule} record={reschedule} /> : null}
      {confirmAction ? <ConfirmModal action={confirmAction.action} onClose={() => setConfirmAction(null)} onConfirm={confirmArchiveOrCancel} record={confirmAction.record} /> : null}
      {toast ? <ToastBox toast={toast} /> : null}
      </RestrictedAccess>
    </AppLayout>
  );
}

function Shortcut({ active, detail, label, onClick, tone, value }: { active: boolean; detail: string; label: string; onClick: () => void; tone: string; value: string }) {
  const tones: Record<string, string> = { neutral: "text-lexos-silver", urgent: "text-lexos-goldSoft", warning: "text-lexos-goldSoft", positive: "text-lexos-green", premium: "text-lexos-cyan" };
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
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", tones[tone])}>{detail}</p>
        <span className="shrink-0 text-xs font-semibold text-lexos-cyan/80">{active ? "Ativo" : "Abrir"}</span>
      </div>
    </button>
  );
}

function PriorityCard({ item, onOpen }: { item: PriorityItem; onOpen: () => void }) {
  const toneClass = item.tone === "critical" ? "border-lexos-gold/28 bg-lexos-gold/[0.055]" : item.tone === "warning" ? "border-lexos-gold/22 bg-white/[0.032]" : "border-lexos-line/45 bg-white/[0.025]";
  return (
    <article className={cn("calm-priority-card flex min-h-44 flex-col justify-between border", toneClass)}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", item.tone === "neutral" ? "text-lexos-cyan" : "text-lexos-goldSoft")}>{item.title}</p>
          <span className="rounded-full border border-lexos-line/45 bg-white/[0.026] px-2.5 py-0.5 text-[11px] font-semibold text-lexos-silver">{item.status}</span>
        </div>
        <p className="mt-2 text-sm font-semibold leading-5 text-white">{item.client}</p>
        <p className="mt-1 text-lg font-semibold text-lexos-goldSoft">{item.value}</p>
        <p className="mt-2 text-xs leading-5 text-lexos-muted"><strong className="text-lexos-silver">Próxima ação:</strong> {item.nextStep}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-lexos-line/45 pt-2.5">
        <span className="text-[11px] text-lexos-muted">Responsável: {item.responsible}</span>
        {item.record ? <button className="text-xs font-semibold text-lexos-cyan transition hover:text-white" onClick={onOpen} type="button">Abrir →</button> : null}
      </div>
    </article>
  );
}

function ExecutiveNote({ label, text, tone = "neutral" }: { label: string; text: string; tone?: "neutral" | "warning" | "positive" }) {
  const classes = tone === "warning" ? "border-lexos-gold/22 bg-lexos-gold/[0.055]" : tone === "positive" ? "border-lexos-green/22 bg-lexos-green/8" : "border-lexos-line/45 bg-white/[0.026]";
  return <div className={cn("rounded-2xl border p-3", classes)}><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">{label}</p><p className="mt-1 text-xs leading-5 text-lexos-silver">{text}</p></div>;
}

function FilterSelect({ label, labels = {}, onChange, options, value }: { label: string; labels?: Record<string, string>; onChange: (value: string) => void; options: string[]; value: string }) {
  return <label className="sr-only">{label}<select aria-label={label} className="not-sr-only operational-control-compact w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white outline-none transition focus:border-lexos-cyan" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option className="bg-lexos-ink text-white" key={option} value={option}>{labels[option] ?? option.replaceAll("_", " ")}</option>)}</select></label>;
}

function RecordTable({ onArchive, onOpen, onOpenCreate, onPaid, onReschedule, records }: { onArchive: (record: FinancialRecord) => void; onOpen: (record: FinancialRecord) => void; onOpenCreate: () => void; onPaid: (record: FinancialRecord) => void; onReschedule: (record: FinancialRecord) => void; records: FinancialRecord[] }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [records.length]);

  if (!records.length) return <EmptyState title="Nenhum lançamento financeiro cadastrado." description="Cadastre recebíveis, vencimentos ou cobranças para acompanhar a previsibilidade de caixa do escritório." actionLabel="Criar cobrança interna" onAction={onOpenCreate} />;

  const visibleRecords = records.slice((page - 1) * FINANCE_PAGE_SIZE, page * FINANCE_PAGE_SIZE);

  return (
    <div className="space-y-2.5">
      <PaginationControls currentPage={page} onPageChange={setPage} pageSize={FINANCE_PAGE_SIZE} totalItems={records.length} />
      {visibleRecords.map((row) => {
        const overdue = isPastDate(row.due_at) && !["pago", "cancelado", "arquivado"].includes(row.status);
        return (
          <article className={cn("calm-record-card border border-lexos-line/48", overdue ? "border-lexos-gold/28 bg-lexos-gold/[0.045]" : "")} key={row.id}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(row)} type="button">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">{getRecordOrigin(row)} <span className="text-lexos-muted">• venc. {formatDate(row.due_at)}</span></p>
                    <h3 className="mt-1.5 text-base font-semibold leading-5 tracking-[-0.015em] text-white">{row.client_name ?? row.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-lexos-muted">{row.title}{row.process_number ? ` • ${row.process_number}` : ""}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-semibold text-lexos-goldSoft">{formatCurrency(row.amount)}</p>
                    <StatusBadge status={statusLabels[row.status]} />
                  </div>
                </div>
                <div className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                  <p className="text-lexos-muted"><span className="font-semibold text-lexos-silver">Responsável:</span> {row.responsible}</p>
                  <p className="text-lexos-muted"><span className="font-semibold text-lexos-silver">Origem:</span> {getRecordOrigin(row)}</p>
                  <p className={cn("text-lexos-muted", overdue ? "text-lexos-goldSoft" : "")}><span className="font-semibold text-lexos-silver">Risco financeiro:</span> {getFinancialRisk(row)}</p>
                </div>
                <p className={cn("mt-3 rounded-2xl border p-3 text-xs leading-5", overdue ? "border-lexos-gold/18 bg-lexos-gold/[0.055] text-lexos-goldSoft" : "border-lexos-cyan/12 bg-white/[0.026] text-lexos-silver")}><span className="font-semibold uppercase tracking-[0.12em] text-lexos-cyan">Próxima ação:</span> {row.next_action || "Revisar e registrar próxima ação."}</p>
              </button>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-lexos-line/45 pt-3 text-xs font-semibold xl:w-[18rem] xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                <button className="rounded-full border border-lexos-cyan/40 bg-lexos-cyan/10 px-3 py-1.5 text-lexos-cyan transition hover:bg-lexos-cyan/16" onClick={() => onOpen(row)} type="button">Abrir</button>
                {row.status !== "pago" ? <QuickFinanceAction onClick={() => onPaid(row)}>Marcar pago</QuickFinanceAction> : null}
                <QuickFinanceAction onClick={() => onReschedule(row)}>Reagendar</QuickFinanceAction>
                <QuickFinanceAction onClick={() => onArchive(row)}>Arquivar</QuickFinanceAction>
              </div>
            </div>
          </article>
        );
      })}
      <PaginationControls currentPage={page} onPageChange={setPage} pageSize={FINANCE_PAGE_SIZE} totalItems={records.length} />
    </div>
  );
}

function QuickFinanceAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="rounded-full border border-transparent px-3 py-1.5 text-lexos-muted transition hover:border-lexos-line hover:text-lexos-silver" onClick={onClick} type="button">{children}</button>;
}

function DelinquentList({ clients, onOpen }: { clients: ReturnType<typeof getDelinquentClients>; onOpen: (record: FinancialRecord) => void }) {
  if (!clients.length) return <EmptyState title="Nenhum cliente inadimplente" description="Não há cliente com registro vencido neste recorte." />;
  const visibleClients = clients.slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-lexos-line/45 bg-white/[0.022] px-3 py-2 text-xs text-lexos-muted">Exibindo {visibleClients.length} de {clients.length} cliente(s) inadimplente(s) mais relevantes.</div>
      <div className="grid gap-4 md:grid-cols-2">
      {visibleClients.map((client) => (
        <div className="executive-panel-compact rounded-[1.35rem] border border-lexos-gold/24 bg-white/[0.026]" key={client.client_id ?? client.client_name}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-white">{client.client_name}</p>
              <p className="mt-1 text-sm text-lexos-muted">{client.count} cobrança(s) vencida(s)</p>
            </div>
            <p className="text-xl font-semibold text-lexos-goldSoft">{formatCurrency(client.total)}</p>
          </div>
          <div className="mt-4 space-y-2">
            {client.records.map((record) => (
              <button className="w-full rounded-2xl border border-lexos-line/45 bg-white/[0.026] p-3 text-left transition hover:border-lexos-cyan/25 hover:bg-white/[0.045]" key={record.id} onClick={() => onOpen(record)} type="button">
                <p className="text-sm font-semibold text-white">{record.title}</p>
                <p className="mt-1 text-xs text-lexos-muted">Venc. {formatDate(record.due_at)} • {record.process_number ?? "sem processo"} • {getFinancialRisk(record)}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function DetailModal({ onArchive, onCancel, onClose, onEdit, onPaid, onReopen, onReschedule, record }: { onArchive: (record: FinancialRecord) => void; onCancel: (record: FinancialRecord) => void; onClose: () => void; onEdit: (record: FinancialRecord) => void; onPaid: (record: FinancialRecord) => void; onReopen: (record: FinancialRecord) => void; onReschedule: (record: FinancialRecord) => void; record: FinancialRecord }) {
  const fields = [["Cliente", record.client_name ?? "—"], ["Processo", record.process_number ?? "—"], ["Valor", formatCurrency(record.amount)], ["Status", statusLabels[record.status]], ["Vencimento", formatDate(record.due_at)], ["Pagamento", record.paid_at ? `${formatDate(record.paid_at)} • ${formatCurrency(record.paid_amount ?? record.amount)}` : "—"], ["Tipo", record.type], ["Categoria", record.category], ["Responsável", record.responsible], ["Parcela", record.installment_number ? `${record.installment_number}/${record.installment_total ?? "?"}` : "—"], ["Forma", record.payment_method ?? "nao_definido"]];
  return <ModalShell onClose={onClose} title={record.title} eyebrow="Detalhe financeiro"><div className="grid gap-3 md:grid-cols-2">{fields.map(([label, value]) => <div className="rounded-2xl border border-lexos-line bg-lexos-ink/65 p-4" key={label}><p className="text-xs uppercase tracking-[0.16em] text-lexos-muted">{label}</p><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>)}</div><div className="mt-5 space-y-3 text-sm leading-5 text-lexos-muted"><p><strong className="text-lexos-silver">Descrição:</strong> {record.description || "—"}</p><p><strong className="text-lexos-silver">Próxima ação:</strong> {record.next_action || "—"}</p><p><strong className="text-lexos-silver">Observações:</strong> {record.notes || "—"}</p></div><div className="mt-6 flex flex-wrap gap-3 border-t border-lexos-line pt-4"><ActionButton onClick={() => onEdit(record)}>Editar</ActionButton>{record.status === "pago" ? <ActionButton onClick={() => onReopen(record)}>Reabrir cobrança</ActionButton> : <ActionButton onClick={() => onPaid(record)}>Marcar como pago</ActionButton>}<ActionButton onClick={() => onReschedule(record)}>Remarcar vencimento</ActionButton><ActionButton onClick={() => onCancel(record)} tone="warning">Cancelar</ActionButton><ActionButton onClick={() => onArchive(record)} tone="warning">Arquivar</ActionButton></div></ModalShell>;
}

function FormModal({ clients, form, mode, onCancel, onChange, onSave, processes, saving }: { clients: Client[]; form: FinanceFormState; mode: FormMode; onCancel: () => void; onChange: (form: FinanceFormState) => void; onSave: () => void; processes: Process[]; saving: boolean }) {
  const scopedProcesses = form.client_id ? processes.filter((process) => process.client_id === form.client_id) : processes;
  function patch(update: Partial<FinanceFormState>) { onChange({ ...form, ...update }); }
  return <ModalShell onClose={onCancel} title={mode === "create" ? "Novo lançamento financeiro" : "Editar lançamento financeiro"} eyebrow="CRUD financeiro"><div className="grid gap-4 md:grid-cols-2"><Input label="Título" onChange={(title) => patch({ title })} value={form.title} /><Select label="Cliente vinculado" onChange={(client_id) => patch({ client_id, process_id: "" })} options={["", ...clients.map((client) => client.id)]} labels={{ "": "Sem cliente", ...Object.fromEntries(clients.map((client) => [client.id, client.name])) }} value={form.client_id} /><Select label="Processo vinculado" onChange={(process_id) => patch({ process_id })} options={["", ...scopedProcesses.map((process) => process.id)]} labels={{ "": "Sem processo", ...Object.fromEntries(scopedProcesses.map((process) => [process.id, process.number])) }} value={form.process_id} /><Select label="Tipo" onChange={(type) => patch({ type: type as FinanceRecordType })} options={typeOptions.filter((item) => item !== "todos")} value={form.type} /><Select label="Direção" onChange={(direction) => patch({ direction: direction as FinanceDirection })} options={["entrada", "saida"]} value={form.direction} /><Select label="Status" labels={statusLabels} onChange={(status) => patch({ status: status as FinanceStatus })} options={statusOptions.filter((item) => item !== "todos")} value={form.status} /><Input label="Valor" onChange={(amount) => patch({ amount })} value={form.amount} /><Input label="Data de vencimento" onChange={(due_at) => patch({ due_at })} type="date" value={form.due_at} /><Input label="Responsável" onChange={(responsible) => patch({ responsible })} value={form.responsible} /><Select label="Referência informada (controle interno)" onChange={(payment_method) => patch({ payment_method: payment_method as PaymentMethod })} options={paymentOptions} value={form.payment_method} /><Input label="Categoria" onChange={(category) => patch({ category })} value={form.category} /><Input label="Número da parcela" onChange={(installment_number) => patch({ installment_number })} type="number" value={form.installment_number} /><Input label="Total de parcelas" onChange={(installment_total) => patch({ installment_total })} type="number" value={form.installment_total} /></div><p className="mt-3 rounded-xl border border-lexos-cyan/25 bg-lexos-cyan/8 px-3 py-2 text-xs leading-5 text-lexos-silver">Registro interno/local: a referência informada não gera pagamento, cobrança externa, PIX, boleto ou conciliação automática.</p>{!clients.length ? <p className="mt-3 rounded-2xl border border-lexos-gold/25 bg-lexos-gold/10 px-4 py-3 text-sm text-lexos-goldSoft">Nenhum cliente cadastrado neste escritório.</p> : null}{!processes.length ? <p className="mt-3 rounded-2xl border border-lexos-gold/25 bg-lexos-gold/10 px-4 py-3 text-sm text-lexos-goldSoft">Nenhum processo cadastrado neste escritório.</p> : null}<Textarea label="Descrição" onChange={(description) => patch({ description })} value={form.description} /><Textarea label="Próxima ação" onChange={(next_action) => patch({ next_action })} value={form.next_action} /><Textarea label="Observações" onChange={(notes) => patch({ notes })} value={form.notes} /><div className="mt-6 flex justify-end gap-3 border-t border-lexos-line pt-4"><ActionButton onClick={onCancel} tone="neutral">Cancelar</ActionButton><ActionButton onClick={onSave}>{saving ? "Salvando..." : "Salvar lançamento"}</ActionButton></div></ModalShell>;
}

function RescheduleModal({ dueAt, onChange, onClose, onSave, record }: { dueAt: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void; record: FinancialRecord }) {
  return <ModalShell onClose={onClose} title="Remarcar vencimento" eyebrow={record.title}><Input label="Nova data de vencimento" onChange={onChange} type="date" value={dueAt} /><p className="mt-3 text-sm text-lexos-muted">Se a nova data for futura, o lançamento sai automaticamente da visão de valores vencidos.</p><div className="mt-6 flex justify-end gap-3"><ActionButton onClick={onClose} tone="neutral">Cancelar</ActionButton><ActionButton onClick={onSave}>Salvar nova data</ActionButton></div></ModalShell>;
}

function ConfirmModal({ action, onClose, onConfirm, record }: { action: ConfirmAction; onClose: () => void; onConfirm: () => void; record: FinancialRecord }) {
  return <ModalShell onClose={onClose} title={action === "arquivar" ? "Arquivar registro financeiro" : "Cancelar registro financeiro"} eyebrow="Sem exclusão destrutiva"><p className="text-sm leading-5 text-lexos-muted">O lançamento <strong className="text-white">{record.title}</strong> não será excluído. Ele sairá da visão operacional principal e ficará disponível apenas em Arquivados/Cancelados.</p><div className="mt-6 flex justify-end gap-3"><ActionButton onClick={onClose} tone="neutral">Voltar</ActionButton><ActionButton onClick={onConfirm} tone="warning">{action === "arquivar" ? "Arquivar registro" : "Cancelar registro"}</ActionButton></div></ModalShell>;
}

function ModalShell({ children, eyebrow, onClose, title }: { children: ReactNode; eyebrow: string; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-lexos-ink/82 p-4 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-lexos-gold/28 bg-[#0a1424] shadow-[0_30px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5 max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-lexos-line bg-[#0a1424]/[0.99] p-5 pb-4 lg:p-6 lg:pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lexos-gold">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          </div>
          <button className="shrink-0 rounded-full border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onClose} type="button">Fechar</button>
        </div>
        <div className="max-h-[calc(100dvh-8.5rem)] overflow-y-auto p-5 premium-scrollbar lg:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, tone = "gold" }: { children: ReactNode; onClick: () => void; tone?: "gold" | "warning" | "neutral" }) {
  const classes = tone === "warning" ? "border-lexos-wine/55 bg-lexos-wine/16 text-lexos-red hover:border-lexos-red" : tone === "neutral" ? "border-lexos-line bg-lexos-ink/70 text-lexos-silver hover:border-lexos-gold hover:text-white" : "border-lexos-gold/45 bg-lexos-gold/12 text-lexos-gold hover:bg-lexos-gold/18";
  return <button className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-glow", classes)} onClick={onClick} type="button">{children}</button>;
}

function Input({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="text-sm text-lexos-muted">{label}<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Select({ label, labels = {}, onChange, options, value }: { label: string; labels?: Record<string, string>; onChange: (value: string) => void; options: string[]; value: string }) {
  return <label className="text-sm text-lexos-muted">{label}<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option || "empty"} value={option}>{labels[option] ?? option.replaceAll("_", " ")}</option>)}</select></label>;
}

function Textarea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="mt-4 block text-sm text-lexos-muted">{label}<textarea className="mt-2 min-h-24 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function ToastBox({ toast }: { toast: Toast }) {
  return <div className={cn("fixed right-4 top-24 z-[140] max-w-sm rounded-2xl border px-4 py-3 text-sm font-semibold shadow-premium ring-1 ring-white/5", toast.tone === "warning" ? "border-lexos-wine/50 bg-lexos-panel text-lexos-red" : "border-lexos-gold/40 bg-lexos-panel text-lexos-gold")}>{toast.message}</div>;
}

function recordToForm(record: FinancialRecord): FinanceFormState {
  return { title: record.title, client_id: record.client_id ?? "", process_id: record.process_id ?? "", type: record.type, direction: record.direction, status: record.status, amount: String(record.amount), due_at: record.due_at, responsible: record.responsible, payment_method: record.payment_method ?? "nao_definido", category: record.category, installment_number: record.installment_number ? String(record.installment_number) : "", installment_total: record.installment_total ? String(record.installment_total) : "", description: record.description, next_action: record.next_action, notes: record.notes };
}
