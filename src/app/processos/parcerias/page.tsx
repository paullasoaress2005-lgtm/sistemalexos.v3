"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import {
  archivePartnershipAsync,
  calculateRepasseStatus,
  createPartnershipAsync,
  getPartnershipByIdAsync,
  listPartnershipsAsync,
  PARTNERSHIP_REAL_DATA_MODE_LABEL,
  PartnershipFeeModel,
  PartnershipInput,
  PartnershipStatus,
  PartnershipType,
  ProcessPartnership,
  registerPartnershipTransferAsync,
  updatePartnershipAsync,
} from "@/lib/data/partnerships";
import { Client, listClientsAsync } from "@/lib/data/clients";
import { listProcessesAsync, Process } from "@/lib/data/processes";
import { cn } from "@/lib/utils";

const statusOptions: Array<PartnershipStatus | "todos"> = ["todos", "em_negociacao", "ativa", "aguardando_documento", "aguardando_repasse", "em_execucao", "concluida", "suspensa", "encerrada", "arquivada"];
const typeOptions: Array<PartnershipType | "todos"> = ["todos", "indicacao_recebida", "indicacao_enviada", "atuacao_conjunta", "correspondente", "substabelecimento", "exito_compartilhado", "apoio_audiencia", "producao_peca", "outro"];
const feeOptions: Array<PartnershipFeeModel | "todos"> = ["todos", "percentual", "valor_fixo", "exito", "mensal", "sem_repasse_definido", "outro"];
const formStatusOptions: PartnershipStatus[] = ["em_negociacao", "ativa", "aguardando_documento", "aguardando_repasse", "em_execucao", "concluida", "suspensa", "encerrada", "arquivada"];
const formTypeOptions: PartnershipType[] = ["indicacao_recebida", "indicacao_enviada", "atuacao_conjunta", "correspondente", "substabelecimento", "exito_compartilhado", "apoio_audiencia", "producao_peca", "outro"];
const formFeeOptions: PartnershipFeeModel[] = ["percentual", "valor_fixo", "exito", "mensal", "sem_repasse_definido", "outro"];

type View = "ativas" | "em_negociacao" | "aguardando_documento" | "aguardando_repasse" | "concluidas" | "arquivadas" | "todas";
type PanelMode = "create" | "edit" | "details" | null;

const emptyForm: PartnershipInput = {
  partner_name: "",
  partner_firm: "",
  partner_email: "",
  partner_phone: "",
  partner_oab: "",
  client_id: "",
  client_name: "",
  process_id: "",
  process_number: "",
  partnership_type: "atuacao_conjunta",
  status: "em_negociacao",
  fee_model: "sem_repasse_definido",
  fee_percentage: undefined,
  fixed_amount: undefined,
  expected_amount: undefined,
  paid_amount: 0,
  repasse_status: "sem_repasse_definido",
  internal_responsible: "",
  external_responsible: "",
  start_date: "",
  expected_end_date: "",
  next_action: "",
  main_pending: "",
  notes: "",
};

function label(value: string) {
  const labels: Record<string, string> = {
    todos: "Todos",
    ativas: "Parcerias ativas",
    em_negociacao: "Em negociação",
    aguardando_documento: "Aguardando documento",
    aguardando_repasse: "Aguardando repasse",
    concluidas: "Concluídas",
    arquivadas: "Arquivadas",
    ativa: "Ativa",
    em_execucao: "Em execução",
    concluida: "Concluída",
    suspensa: "Suspensa",
    encerrada: "Encerrada",
    arquivada: "Arquivada",
    indicacao_recebida: "Indicação recebida",
    indicacao_enviada: "Indicação enviada",
    atuacao_conjunta: "Atuação conjunta",
    correspondente: "Correspondente",
    substabelecimento: "Substabelecimento",
    exito_compartilhado: "Êxito compartilhado",
    apoio_audiencia: "Apoio em audiência",
    producao_peca: "Produção de peça",
    outro: "Outro",
    sem_repasse_registrado: "Sem repasse registrado",
    repasse_pendente: "Repasse pendente",
    repasse_parcial: "Repasse parcial",
    repasse_pago: "Repasse pago",
    percentual: "Percentual",
    valor_fixo: "Valor fixo",
    exito: "Êxito",
    mensal: "Mensal",
    sem_repasse_definido: "Sem repasse definido",
  };
  return labels[value] ?? value;
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);
}

function formatDate(value?: string) {
  if (!value) return "Não definida";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function toForm(partnership: ProcessPartnership): PartnershipInput {
  return {
    partner_name: partnership.partner_name,
    partner_firm: partnership.partner_firm,
    partner_email: partnership.partner_email ?? "",
    partner_phone: partnership.partner_phone ?? "",
    partner_oab: partnership.partner_oab ?? "",
    client_id: partnership.client_id ?? "",
    client_name: partnership.client_name ?? "",
    process_id: partnership.process_id ?? "",
    process_number: partnership.process_number ?? "",
    partnership_type: partnership.partnership_type,
    status: partnership.status,
    fee_model: partnership.fee_model,
    fee_percentage: partnership.fee_percentage,
    fixed_amount: partnership.fixed_amount,
    expected_amount: partnership.expected_amount,
    paid_amount: partnership.paid_amount ?? 0,
    repasse_status: partnership.repasse_status,
    internal_responsible: partnership.internal_responsible,
    external_responsible: partnership.external_responsible,
    start_date: partnership.start_date ?? "",
    expected_end_date: partnership.expected_end_date ?? "",
    next_action: partnership.next_action,
    main_pending: partnership.main_pending,
    notes: partnership.notes,
  };
}

function partnershipMatchesView(partnership: ProcessPartnership, view: View) {
  if (view === "ativas") return ["ativa", "em_execucao"].includes(partnership.status);
  if (view === "em_negociacao") return partnership.status === "em_negociacao";
  if (view === "aguardando_documento") return partnership.status === "aguardando_documento";
  if (view === "aguardando_repasse") return partnership.status === "aguardando_repasse" || ["repasse_pendente", "repasse_parcial"].includes(partnership.repasse_status);
  if (view === "concluidas") return partnership.status === "concluida";
  if (view === "arquivadas") return partnership.status === "arquivada";
  return partnership.status !== "arquivada";
}

function PartnershipsContent() {
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [partnerships, setPartnerships] = useState<ProcessPartnership[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<View>("ativas");
  const [status, setStatus] = useState<PartnershipStatus | "todos">("todos");
  const [type, setType] = useState<PartnershipType | "todos">("todos");
  const [responsible, setResponsible] = useState<string | "todos">("todos");
  const [feeModel, setFeeModel] = useState<PartnershipFeeModel | "todos">("todos");
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selected, setSelected] = useState<ProcessPartnership | null>(null);
  const [form, setForm] = useState<PartnershipInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<ProcessPartnership | null>(null);
  const [transferTarget, setTransferTarget] = useState<ProcessPartnership | null>(null);
  const [activationPrompt, setActivationPrompt] = useState<ProcessPartnership | null>(null);
  const [transferAmount, setTransferAmount] = useState("");

  const refresh = useCallback(async (id = workspaceId) => {
    const [nextPartnerships, nextClients, nextProcesses] = await Promise.all([
      listPartnershipsAsync(id, { includeArchived: true }),
      listClientsAsync(id),
      listProcessesAsync(id, { includeArchived: true }),
    ]);
    setPartnerships(nextPartnerships);
    setClients(nextClients);
    setProcesses(nextProcesses);
  }, [workspaceId]);

  useEffect(() => {
    const session = getCurrentSessionOrFallback();
    const id = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    setWorkspaceId(id);
    void refresh(id);
  }, [refresh]);

  useEffect(() => {
    const action = searchParams.get("action");
    const statusParam = searchParams.get("status") as View | null;
    const processId = searchParams.get("processId");
    if (statusParam && ["ativas", "em_negociacao", "aguardando_documento", "aguardando_repasse", "concluidas", "arquivadas", "todas"].includes(statusParam)) setActiveView(statusParam);
    if (action === "novo") openCreate();
    if (processId && processes.length) {
      const process = processes.find((item) => item.id === processId);
      if (process) setQuery(process.number);
    }
    const partnershipId = searchParams.get("partnershipId");
    if (!partnershipId) return;
    void getPartnershipByIdAsync(partnershipId, workspaceId).then((partnership) => {
      if (partnership) {
        setSelected(partnership);
        setPanelMode("details");
      }
    });
  }, [searchParams, workspaceId, partnerships.length, processes]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const indicators = useMemo(() => {
    const count = (view: View) => partnerships.filter((item) => partnershipMatchesView(item, view)).length;
    return [
      { view: "ativas" as View, label: "Parcerias ativas", value: count("ativas"), detail: "formalizadas/em execução" },
      { view: "em_negociacao" as View, label: "Em negociação", value: count("em_negociacao"), detail: "ainda não formalizadas" },
      { view: "aguardando_documento" as View, label: "Aguardando documento", value: count("aguardando_documento"), detail: "pendências formais" },
      { view: "aguardando_repasse" as View, label: "Aguardando repasse", value: count("aguardando_repasse"), detail: "pendente/parcial" },
      { view: "concluidas" as View, label: "Concluídas", value: count("concluidas"), detail: "encerradas com êxito" },
      { view: "arquivadas" as View, label: "Arquivadas", value: count("arquivadas"), detail: "sem exclusão" },
    ];
  }, [partnerships]);

  const responsibles = useMemo(() => Array.from(new Set(partnerships.map((item) => item.internal_responsible).filter(Boolean))).sort(), [partnerships]);

  const filtered = useMemo(() => {
    return partnerships
      .filter((item) => partnershipMatchesView(item, activeView))
      .filter((item) => {
        if (status === "todos") return true;
        if (status === "ativa") return ["ativa", "em_execucao"].includes(item.status);
        if (status === "aguardando_repasse") return item.status === "aguardando_repasse" || ["repasse_pendente", "repasse_parcial"].includes(item.repasse_status);
        return item.status === status;
      })
      .filter((item) => (type === "todos" ? true : item.partnership_type === type))
      .filter((item) => (responsible === "todos" ? true : item.internal_responsible === responsible))
      .filter((item) => (feeModel === "todos" ? true : item.fee_model === feeModel))
      .filter((item) => {
        const text = [item.partner_name, item.partner_firm, item.client_name, item.process_number, item.status, item.main_pending, item.next_action].join(" ").toLowerCase();
        return query.trim() ? text.includes(query.trim().toLowerCase()) : true;
      });
  }, [activeView, feeModel, partnerships, query, responsible, status, type]);

  function openCreate() {
    setForm(emptyForm);
    setSelected(null);
    setFormError(null);
    setPanelMode("create");
  }

  function openDetails(partnership: ProcessPartnership) {
    setSelected(partnership);
    setPanelMode("details");
  }

  function openEdit(partnership: ProcessPartnership) {
    setSelected(partnership);
    setForm(toForm(partnership));
    setFormError(null);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setSelected(null);
    setFormError(null);
  }

  function patchForm(patch: Partial<PartnershipInput>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function selectClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    patchForm({ client_id: clientId, client_name: client?.name ?? "" });
  }

  function selectProcess(processId: string) {
    const process = processes.find((item) => item.id === processId);
    patchForm({
      process_id: processId,
      process_number: process?.number ?? "",
      client_id: process?.client_id ?? form.client_id,
      client_name: process?.client_name ?? form.client_name,
    });
  }

  function validate() {
    if (!form.partner_name.trim()) return "Informe o nome do parceiro.";
    if (!form.partner_firm.trim()) return "Informe o escritório parceiro.";
    if (!form.internal_responsible.trim()) return "Informe o responsável interno.";
    if (!form.external_responsible.trim()) return "Informe o responsável externo.";
    if (!form.next_action.trim()) return "Informe a próxima ação.";
    if (!form.main_pending.trim()) return "Informe a pendência principal.";
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    const normalizedForm = { ...form, repasse_status: calculateRepasseStatus(form) };
    if (panelMode === "edit" && selected) {
      try {
        const updated = await updatePartnershipAsync(selected.id, normalizedForm, workspaceId);
        await refresh();
        if (updated) setSelected(updated);
        setPanelMode("details");
        setToast("Parceria atualizada no modo de dados atual.");
      } catch {
        setFormError("Não foi possível salvar a parceria agora. Verifique a implantação do módulo e tente novamente.");
      }
      return;
    }
    try {
      const created = await createPartnershipAsync(normalizedForm, workspaceId);
      await refresh();
      setSelected(created);
      setPanelMode("details");
      setToast("Parceria cadastrada no modo de dados atual.");
    } catch {
      setFormError("Não foi possível salvar a parceria agora. Verifique a implantação do módulo e tente novamente.");
    }
  }

  async function markCompleted(partnership: ProcessPartnership) {
    const updated = await updatePartnershipAsync(partnership.id, { status: "concluida" }, workspaceId);
    await refresh();
    if (updated) setSelected(updated);
    setToast("Parceria marcada como concluída no modo de dados atual.");
  }

  async function confirmTransfer() {
    if (!transferTarget) return;
    const amount = Number(transferAmount.replace(".", "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setToast("Informe um valor de repasse válido.");
      return;
    }
    const updated = await registerPartnershipTransferAsync(transferTarget.id, amount, workspaceId);
    await refresh();
    if (updated) {
      setSelected(updated);
      if (transferTarget.status === "em_negociacao") setActivationPrompt(updated);
    }
    setTransferTarget(null);
    setTransferAmount("");
    setToast("Repasse registrado no modo de dados atual.");
  }

  async function confirmArchive() {
    if (!archiveCandidate) return;
    const archived = await archivePartnershipAsync(archiveCandidate.id, workspaceId);
    await refresh();
    setArchiveCandidate(null);
    setPanelMode(null);
    setSelected(null);
    setActiveView("arquivadas");
    setStatus("todos");
    if (archived) setToast("Parceria arquivada no modo de dados atual.");
  }

  function keepNegotiatingAfterTransfer() {
    setActivationPrompt(null);
    setToast("Repasse registrado no modo de dados atual. Parceria mantida em negociação.");
  }

  async function activateAfterTransfer() {
    if (!activationPrompt) return;
    const updated = await updatePartnershipAsync(activationPrompt.id, { status: "ativa" }, workspaceId);
    await refresh();
    if (updated) setSelected(updated);
    setActivationPrompt(null);
    setActiveView("ativas");
    setToast("Parceria marcada como ativa no modo de dados atual.");
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <section className="rounded-[1.35rem] border border-lexos-gold/20 bg-gradient-to-br from-lexos-panel/95 via-lexos-navy/92 to-lexos-ink p-5 shadow-premium lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">Processos • Parcerias • Governança operacional</p>
              <h1 className="mt-3 max-w-5xl text-3xl font-semibold text-white lg:text-4xl">Parcerias jurídicas vinculadas a processos, clientes, honorários e responsabilidades.</h1>
              <p className="mt-2.5 max-w-4xl text-sm leading-5 text-lexos-muted">Controle de parcerias jurídicas vinculadas a clientes, processos, honorários e responsabilidades. {PARTNERSHIP_REAL_DATA_MODE_LABEL}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" href="/processos">Voltar para Processos</Link>
              <button className="rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft" onClick={openCreate} type="button">Nova parceria</button>
            </div>
          </div>
          <p className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-gold/8 p-4 text-xs leading-5 text-lexos-goldSoft">Condições de parceria, honorários, substabelecimento e divisão de valores devem ser formalizados e revisados pelos responsáveis.</p>
          <p className="mt-3 text-xs leading-5 text-lexos-muted">{PARTNERSHIP_REAL_DATA_MODE_LABEL}</p>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {indicators.map((indicator) => {
            const active = activeView === indicator.view;
            return (
              <button className={cn("rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-1 hover:border-lexos-gold/70 hover:bg-lexos-card/90", active ? "border-lexos-gold bg-lexos-gold/12 shadow-premium" : "border-lexos-line bg-lexos-card/72 shadow-glow")} key={indicator.view} onClick={() => { setActiveView(indicator.view); setStatus("todos"); }} type="button">
                <p className="text-xs uppercase tracking-[0.16em] text-lexos-muted">{indicator.label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{indicator.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-lexos-goldSoft">{active ? "Filtro ativo" : indicator.detail}</p>
              </button>
            );
          })}
        </div>

        <SectionCard eyebrow="Filtros" title="Busca e segmentação de parcerias">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_repeat(4,0.7fr)]">
            <label className="block text-sm text-lexos-muted">Buscar
              <input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => setQuery(event.target.value)} placeholder="Parceiro, escritório, cliente, processo, status ou pendência" value={query} />
            </label>
            <Select label="Status" onChange={(value) => setStatus(value as PartnershipStatus | "todos")} value={status} values={statusOptions} />
            <Select label="Tipo" onChange={(value) => setType(value as PartnershipType | "todos")} value={type} values={typeOptions} />
            <Select label="Responsável interno" onChange={(value) => setResponsible(value)} value={responsible} values={["todos", ...responsibles]} />
            <Select label="Honorários" onChange={(value) => setFeeModel(value as PartnershipFeeModel | "todos")} value={feeModel} values={feeOptions} />
          </div>
        </SectionCard>

        <SectionCard eyebrow="Carteira" title={`${label(activeView)} (${filtered.length})`} action={<button className="rounded-xl border border-lexos-gold/45 px-4 py-2 text-xs font-semibold text-lexos-gold transition hover:bg-lexos-gold/10" onClick={openCreate} type="button">Nova parceria</button>}>
          {filtered.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {filtered.map((partnership) => (
                <button className="rounded-[1.35rem] border border-lexos-line/80 bg-lexos-card/72 p-5 text-left shadow-glow transition hover:-translate-y-1 hover:border-lexos-gold/55 hover:bg-lexos-card/95" key={partnership.id} onClick={() => openDetails(partnership)} type="button">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">{label(partnership.partnership_type)}</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">{partnership.partner_name}</h2>
                      <p className="mt-1 text-sm text-lexos-muted">{partnership.partner_firm}</p>
                    </div>
                    <StatusBadge status={label(partnership.status)} />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Info label="Cliente" value={partnership.client_name || "Sem vínculo"} />
                    <Info label="Processo" value={partnership.process_number || "Sem vínculo"} />
                    <Info label="Responsável interno" value={partnership.internal_responsible} />
                    <Info label="Repasse/Honorários" value={`${formatCurrency(partnership.paid_amount)} / ${formatCurrency(partnership.expected_amount)} • ${label(partnership.repasse_status)}`} />
                  </div>
                  <p className="mt-4 rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4 text-sm leading-6 text-lexos-silver"><span className="font-semibold text-white">Pendência:</span> {partnership.main_pending}<br /><span className="font-semibold text-white">Próxima ação:</span> {partnership.next_action}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhuma parceria cadastrada neste escritório." description="Cadastre parcerias para acompanhar responsáveis, repasses, documentos e próximos passos." />
          )}
        </SectionCard>
      </div>

      {panelMode ? <PartnershipPanel clients={clients} form={form} formError={formError} mode={panelMode} onArchive={(item) => setArchiveCandidate(item)} onChange={patchForm} onClose={closePanel} onEdit={openEdit} onMarkCompleted={markCompleted} onRegisterTransfer={(item) => { setTransferTarget(item); setTransferAmount(String(item.paid_amount ?? 0)); }} onSelectClient={selectClient} onSelectProcess={selectProcess} onSubmit={submit} partnership={selected} processes={processes} /> : null}
      {archiveCandidate ? <ArchivePartnershipModal onCancel={() => setArchiveCandidate(null)} onConfirm={confirmArchive} partnership={archiveCandidate} /> : null}
      {transferTarget ? <TransferModal amount={transferAmount} onAmountChange={setTransferAmount} onCancel={() => setTransferTarget(null)} onConfirm={confirmTransfer} partnership={transferTarget} /> : null}
      {activationPrompt ? <ActivationPromptModal onKeep={keepNegotiatingAfterTransfer} onActivate={activateAfterTransfer} partnership={activationPrompt} /> : null}
      {toast ? <div className="fixed bottom-6 right-6 z-[150] max-w-sm rounded-2xl border border-lexos-gold/35 bg-lexos-panel px-5 py-4 text-sm font-semibold text-lexos-gold shadow-premium">{toast}</div> : null}
    </AppLayout>
  );
}

function Select({ label: selectLabel, onChange, value, values }: { label: string; onChange: (value: string) => void; value: string; values: string[] }) {
  return <label className="block text-sm text-lexos-muted">{selectLabel}<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} value={value}>{values.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>;
}

function Info({ label: infoLabel, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-line/70 bg-lexos-ink/55 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">{infoLabel}</p><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>;
}

function Field({ label: fieldLabel, onChange, placeholder, type = "text", value }: { label: string; onChange: (value: string) => void; placeholder?: string; type?: string; value: string | number | undefined }) {
  return <label className="block text-sm text-lexos-muted">{fieldLabel}<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value ?? ""} /></label>;
}

function PartnershipPanel({ clients, form, formError, mode, onArchive, onChange, onClose, onEdit, onMarkCompleted, onRegisterTransfer, onSelectClient, onSelectProcess, onSubmit, partnership, processes }: { clients: Client[]; form: PartnershipInput; formError: string | null; mode: Exclude<PanelMode, null>; onArchive: (partnership: ProcessPartnership) => void; onChange: (patch: Partial<PartnershipInput>) => void; onClose: () => void; onEdit: (partnership: ProcessPartnership) => void; onMarkCompleted: (partnership: ProcessPartnership) => void; onRegisterTransfer: (partnership: ProcessPartnership) => void; onSelectClient: (id: string) => void; onSelectProcess: (id: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; partnership: ProcessPartnership | null; processes: Process[] }) {
  const editing = mode === "create" || mode === "edit";
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center">
        <div className="w-full rounded-[1.75rem] border border-lexos-gold/25 bg-[#0b1728] shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5">
          <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 rounded-t-[1.75rem] border-b border-lexos-line/80 bg-[#0b1728]/95 p-5 backdrop-blur">
            <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{editing ? "Cadastro/edição" : "Detalhes"} de parceria</p><h2 className="mt-2 text-2xl font-semibold text-white">{editing ? (mode === "create" ? "Nova parceria" : "Editar parceria") : partnership?.partner_name}</h2></div>
            <button className="rounded-2xl border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Fechar</button>
          </div>

          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-5 premium-scrollbar lg:p-6">
            {editing ? (
              <form className="space-y-5" onSubmit={onSubmit}>
                {formError ? <p className="rounded-2xl border border-lexos-wine/55 bg-lexos-wine/12 p-3 text-sm text-lexos-red">{formError}</p> : null}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Nome do parceiro" onChange={(value) => onChange({ partner_name: value })} placeholder="Ex.: Dra. Parceira Demo" value={form.partner_name} />
                  <Field label="Escritório parceiro" onChange={(value) => onChange({ partner_firm: value })} placeholder="Escritório Demo" value={form.partner_firm} />
                  <Field label="E-mail" onChange={(value) => onChange({ partner_email: value })} placeholder="nome@exemplo.test" value={form.partner_email} />
                  <Field label="Telefone/WhatsApp" onChange={(value) => onChange({ partner_phone: value })} placeholder="+55 11 90000-0000" value={form.partner_phone} />
                  <Field label="OAB" onChange={(value) => onChange({ partner_oab: value })} placeholder="OAB/UF 000.000-D" value={form.partner_oab} />
                  <label className="block text-sm text-lexos-muted">Cliente vinculado<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold" onChange={(event) => onSelectClient(event.target.value)} value={form.client_id ?? ""}><option value="">Sem cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
                  <label className="block text-sm text-lexos-muted xl:col-span-2">Processo vinculado<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition focus:border-lexos-gold" onChange={(event) => onSelectProcess(event.target.value)} value={form.process_id ?? ""}><option value="">Sem processo</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.number} • {process.client_name}</option>)}</select></label>
                  <Select label="Tipo de parceria" onChange={(value) => onChange({ partnership_type: value as PartnershipType })} value={form.partnership_type} values={formTypeOptions} />
                  <div><Select label="Status da parceria" onChange={(value) => onChange({ status: value as PartnershipStatus })} value={form.status} values={formStatusOptions} /><p className="mt-2 text-xs leading-5 text-lexos-muted">Use ‘Ativa’ quando a parceria já estiver formalizada e em execução. Use ‘Em negociação’ quando ainda depender de aceite, documento ou definição de honorários.</p></div>
                  <Select label="Modelo de honorários" onChange={(value) => onChange({ fee_model: value as PartnershipFeeModel })} value={form.fee_model} values={formFeeOptions} />
                  <Field label="Percentual (%)" onChange={(value) => onChange({ fee_percentage: value ? Number(value) : undefined })} type="number" value={form.fee_percentage} />
                  <Field label="Valor fixo" onChange={(value) => onChange({ fixed_amount: value ? Number(value) : undefined })} type="number" value={form.fixed_amount} />
                  <Field label="Valor estimado" onChange={(value) => onChange({ expected_amount: value ? Number(value) : undefined })} type="number" value={form.expected_amount} />
                  <Field label="Valor pago/repassado" onChange={(value) => onChange({ paid_amount: value ? Number(value) : 0 })} type="number" value={form.paid_amount} />
                  <Field label="Responsável interno" onChange={(value) => onChange({ internal_responsible: value })} value={form.internal_responsible} />
                  <Field label="Responsável externo" onChange={(value) => onChange({ external_responsible: value })} value={form.external_responsible} />
                  <Field label="Data de início" onChange={(value) => onChange({ start_date: value })} type="date" value={form.start_date} />
                  <Field label="Previsão de conclusão" onChange={(value) => onChange({ expected_end_date: value })} type="date" value={form.expected_end_date} />
                  <Field label="Pendência principal" onChange={(value) => onChange({ main_pending: value })} value={form.main_pending} />
                  <Field label="Próxima ação" onChange={(value) => onChange({ next_action: value })} value={form.next_action} />
                  <label className="block text-sm text-lexos-muted md:col-span-2 xl:col-span-3">Observações<textarea className="mt-2 min-h-24 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" onChange={(event) => onChange({ notes: event.target.value })} value={form.notes} /></label>
                </div>
                <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-lexos-line/80 bg-[#0b1728]/95 pt-5"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft" type="submit">Salvar parceria</button></div>
              </form>
            ) : partnership ? (
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-lexos-gold">{label(partnership.partnership_type)} • {label(partnership.fee_model)}</p><h3 className="mt-2 text-xl font-semibold text-white">{partnership.partner_name}</h3><p className="mt-1 text-sm text-lexos-muted">{partnership.partner_firm}</p></div><StatusBadge status={label(partnership.status)} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Contato" value={[partnership.partner_email, partnership.partner_phone].filter(Boolean).join(" • ") || "Não informado"} /><Info label="OAB" value={partnership.partner_oab || "Não informada"} /><Info label="Cliente vinculado" value={partnership.client_name || "Sem vínculo"} /><Info label="Processo vinculado" value={partnership.process_number || "Sem vínculo"} /><Info label="Responsável interno" value={partnership.internal_responsible} /><Info label="Responsável externo" value={partnership.external_responsible} /><Info label="Início" value={formatDate(partnership.start_date)} /><Info label="Previsão" value={formatDate(partnership.expected_end_date)} /></div></div>
                  <SectionCard eyebrow="Bloco 1" title="Status da parceria">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Info label="Status operacional" value={label(partnership.status)} />
                      <Info label="Responsável interno" value={partnership.internal_responsible} />
                      <Info label="Responsável externo" value={partnership.external_responsible} />
                      <Info label="Próxima ação" value={partnership.next_action} />
                    </div>
                    <TextBlock title="Pendência principal" value={partnership.main_pending} />
                  </SectionCard>
                  <SectionCard eyebrow="Bloco 2" title="Repasse/Honorários">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Info label="Modelo de honorários" value={label(partnership.fee_model)} />
                      <Info label="Status do repasse" value={label(partnership.repasse_status)} />
                      <Info label="Valor esperado" value={formatCurrency(partnership.expected_amount)} />
                      <Info label="Valor pago/repassado" value={formatCurrency(partnership.paid_amount)} />
                      <Info label="Percentual" value={partnership.fee_percentage ? `${partnership.fee_percentage}%` : "Não definido"} />
                      <Info label="Valor fixo" value={formatCurrency(partnership.fixed_amount)} />
                    </div>
                  </SectionCard>
                  <TextBlock title="Observações" value={partnership.notes || "Sem observações."} />
                </div>
                <div className="space-y-4"><SectionCard eyebrow="Financeiro interno" title="Resumo de repasses"><div className="space-y-3"><p className="text-sm leading-5 text-lexos-muted">Controle interno: não cria pagamento, recibo, boleto ou integração bancária.</p><Info label="Progresso" value={`${formatCurrency(partnership.paid_amount)} de ${formatCurrency(partnership.expected_amount)} • ${label(partnership.repasse_status)}`} /><button className="w-full rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/18" onClick={() => onRegisterTransfer(partnership)} type="button">Registrar repasse interno</button></div></SectionCard><SectionCard eyebrow="Ações" title="Controle operacional"><div className="grid gap-3"><button className="rounded-2xl border border-lexos-gold/45 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/10" onClick={() => onEdit(partnership)} type="button">Editar</button><button className="rounded-2xl border border-lexos-green/45 px-4 py-3 text-sm font-semibold text-lexos-green transition hover:bg-lexos-green/10" onClick={() => onMarkCompleted(partnership)} type="button">Marcar como concluída</button><button className="rounded-2xl border border-lexos-wine/55 px-4 py-3 text-sm font-semibold text-lexos-red transition hover:bg-lexos-wine/14" onClick={() => onArchive(partnership)} type="button">Arquivar parceria</button></div></SectionCard><SectionCard eyebrow="Tarefas e agenda" title="Próximos vínculos"><p className="text-sm leading-5 text-lexos-muted">Próxima ação exibida para integração futura com Tarefas e Agenda sem quebrar os módulos existentes.</p><p className="mt-3 rounded-2xl border border-lexos-line/70 bg-lexos-ink/55 p-4 text-sm text-lexos-silver">{partnership.next_action}</p></SectionCard></div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4"><p className="text-sm text-lexos-muted">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{value}</p></div>;
}

function TransferModal({ amount, onAmountChange, onCancel, onConfirm, partnership }: { amount: string; onAmountChange: (value: string) => void; onCancel: () => void; onConfirm: () => void; partnership: ProcessPartnership }) {
  return <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Repasse interno</p><h2 className="mt-3 text-2xl font-semibold text-white">Registrar repasse</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Informe o valor pago/repassado nesta demonstração. Esta ação atualiza apenas o status financeiro/repasse; o status operacional da parceria não muda automaticamente.</p><Field label="Valor pago/repassado" onChange={onAmountChange} type="text" value={amount} /><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft" onClick={onConfirm} type="button">Registrar repasse interno</button></div></div></div>;
}

function ActivationPromptModal({ onActivate, onKeep, partnership }: { onActivate: () => void; onKeep: () => void; partnership: ProcessPartnership }) {
  return <div className="fixed inset-0 z-[145] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Status operacional</p><h2 className="mt-3 text-2xl font-semibold text-white">Repasse em parceria em negociação</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Esta parceria ainda está em negociação. Deseja também marcá-la como ativa?</p><div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Parceria</p><p className="mt-2 text-lg font-semibold text-white">{partnership.partner_name}</p><p className="mt-1 text-sm text-lexos-muted">Repasse: {label(partnership.repasse_status)} • Status atual: {label(partnership.status)}</p></div></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onKeep} type="button">Manter em negociação</button><button className="rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft" onClick={onActivate} type="button">Marcar como ativa</button></div></div></div>;
}

function ArchivePartnershipModal({ onCancel, onConfirm, partnership }: { onCancel: () => void; onConfirm: () => void; partnership: ProcessPartnership }) {
  return <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Confirmação operacional</p><h2 className="mt-3 text-2xl font-semibold text-white">Arquivar parceria</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Esta parceria será marcada como arquivada. O registro não será excluído.</p><div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Parceria selecionada</p><p className="mt-2 text-lg font-semibold text-white">{partnership.partner_name}</p><p className="mt-1 text-sm text-lexos-muted">{partnership.partner_firm}</p></div></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-wine/65 bg-lexos-wine/18 px-5 py-3 text-sm font-semibold text-lexos-red transition hover:-translate-y-0.5 hover:bg-lexos-wine/26 hover:shadow-[0_18px_48px_rgba(122,27,54,0.22)]" onClick={onConfirm} type="button">Arquivar parceria</button></div></div></div>;
}


export default function PartnershipsPage() {
  return (
    <Suspense fallback={<AppLayout><EmptyState title="Carregando parcerias..." description="Preparando a área de parcerias jurídicas." /></AppLayout>}>
      <PartnershipsContent />
    </Suspense>
  );
}
