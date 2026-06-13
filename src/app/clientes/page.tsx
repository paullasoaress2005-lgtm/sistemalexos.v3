"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, PaginationControls, SectionCard, StatusBadge } from "@/components/ui";
import {
  archiveClientAsync,
  CLIENT_DATA_MODE_LABEL,
  Client,
  ClientInput,
  ClientStatus,
  ClientType,
  createClientAsync,
  listClientsAsync,
  updateClientAsync,
  getClientByIdAsync,
} from "@/lib/data/clients";
import { getCurrentSessionOrFallback, setPendingToast } from "@/lib/auth";
import type { LexosSession } from "@/lib/auth";
import { listProcessesByClientIdAsync, Process } from "@/lib/data/processes";
import { listTasksByClientIdAsync, resolveEffectiveTaskStatus, Task } from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

const CLIENT_PAGE_SIZE = 8;
const statuses: Array<ClientStatus | "todos"> = ["todos", "ativo", "atenção", "prospect", "inativo"];
const clientListTitles: Record<ClientStatus | "todos", string> = {
  todos: "Carteira operacional de clientes",
  ativo: "Carteira ativa",
  atenção: "Clientes em atenção",
  prospect: "Prospects",
  inativo: "Clientes inativos",
};


const emptyForm: ClientInput = {
  name: "",
  type: "pessoa_juridica",
  document: "",
  email: "",
  phone: "",
  status: "ativo",
  owner: "",
  segment: "",
  main_pending: "",
  next_action: "",
  notes: "",
};

function formatClientType(type: ClientType) {
  return type === "pessoa_juridica" ? "Pessoa jurídica" : "Pessoa física";
}

function formatDate(value: string) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}



function isDemoLikeClient(client: Client) {
  return /(qa cliente automatizado|teste automatizado|\[demo_seed_lexos\]|^demo\s*-|@exemplo\.demo)/i.test(
    `${client.name} ${client.email} ${client.notes} ${client.main_pending}`
  );
}

function toForm(client: Client): ClientInput {
  return {
    name: client.name,
    type: client.type,
    document: client.document,
    email: client.email,
    phone: client.phone,
    status: client.status,
    owner: client.owner,
    segment: client.segment,
    main_pending: client.main_pending,
    last_contact_at: client.last_contact_at,
    next_action: client.next_action,
    notes: client.notes,
  };
}

type PanelMode = "details" | "create" | "edit";

export default function ClientesPage() {
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [sessionMode, setSessionMode] = useState<LexosSession["mode"]>("fallback");
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientStatus | "todos">("todos");
  const [typeFilter, setTypeFilter] = useState<"todos" | ClientType>("todos");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [noReplyOnly, setNoReplyOnly] = useState(false);
  const [pendingBillingOnly, setPendingBillingOnly] = useState(false);
  const [withProcessOnly, setWithProcessOnly] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [form, setForm] = useState<ClientInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [archiveCandidate, setArchiveCandidate] = useState<Client | null>(null);
  const [linkedProcesses, setLinkedProcesses] = useState<Process[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function loadClients() {
    const session = getCurrentSessionOrFallback();
    const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    const params = new URLSearchParams(window.location.search);
    setWorkspaceId(sessionWorkspaceId);
    setSessionMode(session.mode);
    const nextClients = await listClientsAsync(sessionWorkspaceId, { includeArchived: true });
    const sanitizedClients = session.mode === "supabase" ? nextClients.filter((client) => !isDemoLikeClient(client)) : nextClients;
    if (!active) return;
    setClients(sanitizedClients);

    const clientId = params.get("clientId");
    const statusParam = params.get("status") as ClientStatus | null;
    const action = params.get("action");
    if (statusParam && statuses.includes(statusParam)) setStatus(statusParam);
    if (clientId) {
      const client = await getClientByIdAsync(clientId, sessionWorkspaceId);
      if (!active) return;
      if (client) {
        setSelectedClient(client);
        setForm(toForm(client));
        setPanelMode("details");
      }
    }
    if (action === "novo") {
      setSelectedClient(null);
      setForm(emptyForm);
      setPanelMode("create");
    }
    setLoading(false);
    }
    loadClients();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const ownerOptions = useMemo(
    () => ["todos", ...Array.from(new Set(clients.map((client) => client.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [clients],
  );

  const clientSignals = useMemo(() => {
    const now = Date.now();
    return new Map(
      clients.map((client) => {
        const updated = new Date(client.last_contact_at || client.updated_at).getTime();
        const daysWithoutReply = Number.isFinite(updated) ? Math.floor((now - updated) / (1000 * 60 * 60 * 24)) : 999;
        const noReply = daysWithoutReply >= 15;
        const hasBillingPending = /(cobran|fatura|financeir|boleto|inadimpl|vencid|pagamento)/i.test(
          `${client.main_pending} ${client.next_action} ${client.notes}`,
        );
        const hasActiveProcess = /(proc\.?|n[ºo]|tribunal|ação|aud[ií]ência)/i.test(`${client.segment} ${client.notes} ${client.main_pending}`);
        const inAttention = client.status === "atenção" || noReply || hasBillingPending;
        return [client.id, { noReply, hasBillingPending, hasActiveProcess, inAttention, daysWithoutReply }] as const;
      }),
    );
  }, [clients]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return clients
      .filter((client) => {
        if (status === "todos") return !client.archived_at && client.status !== "inativo";
        if (status === "inativo") return client.status === "inativo" || Boolean(client.archived_at);
        return client.status === status && !client.archived_at;
      })
      .filter((client) => {
        if (!normalizedQuery) return true;
        return [client.name, client.document, client.owner, client.main_pending, client.segment]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .filter((client) => (typeFilter === "todos" ? true : client.type === typeFilter))
      .filter((client) => (ownerFilter === "todos" ? true : client.owner === ownerFilter))
      .filter((client) => (attentionOnly ? clientSignals.get(client.id)?.inAttention : true))
      .filter((client) => (noReplyOnly ? clientSignals.get(client.id)?.noReply : true))
      .filter((client) => (pendingBillingOnly ? clientSignals.get(client.id)?.hasBillingPending : true))
      .filter((client) => (withProcessOnly ? clientSignals.get(client.id)?.hasActiveProcess : true))
      .sort((a, b) => {
        const aSignal = clientSignals.get(a.id);
        const bSignal = clientSignals.get(b.id);
        const aScore = (aSignal?.inAttention ? 3 : 0) + (aSignal?.noReply ? 2 : 0) + (aSignal?.hasBillingPending ? 2 : 0);
        const bScore = (bSignal?.inAttention ? 3 : 0) + (bSignal?.noReply ? 2 : 0) + (bSignal?.hasBillingPending ? 2 : 0);
        return bScore - aScore || b.updated_at.localeCompare(a.updated_at);
      });
  }, [clients, query, status, typeFilter, ownerFilter, attentionOnly, noReplyOnly, pendingBillingOnly, withProcessOnly, clientSignals]);

  useEffect(() => {
    setPage(1);
  }, [query, status, typeFilter, ownerFilter, attentionOnly, noReplyOnly, pendingBillingOnly, withProcessOnly]);

  const visibleClients = useMemo(() => filteredClients.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE), [filteredClients, page]);

  const stats = useMemo(() => {
    const active = clients.filter((client) => client.status === "ativo" && !client.archived_at).length;
    const attention = clients.filter((client) => clientSignals.get(client.id)?.inAttention && !client.archived_at).length;
    const noReply = clients.filter((client) => clientSignals.get(client.id)?.noReply && !client.archived_at).length;
    const withProcess = clients.filter((client) => clientSignals.get(client.id)?.hasActiveProcess && !client.archived_at).length;
    const pendingBilling = clients.filter((client) => clientSignals.get(client.id)?.hasBillingPending && !client.archived_at).length;
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const newInMonth = clients.filter((client) => {
      const d = new Date(client.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;

    return [
      { status: "ativo" as const, label: "Carteira ativa", value: String(active), detail: "clientes em acompanhamento", tone: "positive", filterKey: "status" as const },
      { status: "atenção" as const, label: "Clientes em atenção", value: String(attention), detail: "clientes com risco operacional", tone: attention > 0 ? "urgent" : "warning", filterKey: "attention" as const },
      { status: "todos" as const, label: "Sem retorno há 15+ dias", value: String(noReply), detail: "sem contato recente", tone: noReply > 0 ? "urgent" : "neutral", filterKey: "noReply" as const },
      { status: "todos" as const, label: "Com processo ativo", value: String(withProcess), detail: "processos vinculados", tone: "premium", filterKey: "process" as const },
      { status: "todos" as const, label: "Cobrança pendente", value: String(pendingBilling), detail: "financeiro requer ação", tone: pendingBilling > 0 ? "warning" : "neutral", filterKey: "billing" as const },
      { status: "prospect" as const, label: "Novos relacionamentos", value: String(newInMonth), detail: "entradas no mês", tone: "positive", filterKey: "prospect" as const },
    ];
  }, [clients, clientSignals]);

  useEffect(() => {
    let active = true;
    async function loadLinks() {
      if (!selectedClient) {
        setLinkedProcesses([]);
        setLinkedTasks([]);
        return;
      }
      const [processes, tasks] = await Promise.all([
        listProcessesByClientIdAsync(selectedClient.id, workspaceId),
        listTasksByClientIdAsync(selectedClient.id, workspaceId),
      ]);
      if (!active) return;
      setLinkedProcesses(processes);
      setLinkedTasks(tasks);
    }
    loadLinks();
    return () => { active = false; };
  }, [selectedClient, workspaceId]);

  async function refresh(message?: string) {
    const nextClients = await listClientsAsync(workspaceId, { includeArchived: true });
    setClients(sessionMode === "supabase" ? nextClients.filter((client) => !isDemoLikeClient(client)) : nextClients);
    if (message) {
      setToast(message);
      setPendingToast(message);
    }
  }

  function openCreatePanel() {
    setSelectedClient(null);
    setForm(emptyForm);
    setFormError(null);
    setPanelMode("create");
  }

  function openDetails(client: Client) {
    setSelectedClient(client);
    setForm(toForm(client));
    setFormError(null);
    setPanelMode("details");
  }

  function openEdit(client: Client) {
    setSelectedClient(client);
    setForm(toForm(client));
    setFormError(null);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedClient(null);
    setFormError(null);
  }

  function validateForm() {
    if (!form.name.trim()) return "Informe Nome/Razão social.";
    if (!form.document.trim()) return "Informe CPF/CNPJ ou documento.";
    if (!form.owner.trim()) return "Informe o responsável pelo relacionamento.";
    if (!form.main_pending.trim()) return "Informe a pendência principal ou registre que não há pendência.";
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
    window.setTimeout(async () => {
      if (panelMode === "edit" && selectedClient) {
        const updated = await updateClientAsync(selectedClient.id, form, workspaceId);
        if (updated) setSelectedClient(updated);
        await refresh("Cliente atualizado no ambiente atual.");
        setPanelMode("details");
      } else {
        const created = await createClientAsync(form, workspaceId);
        setSelectedClient(created);
        await refresh("Cliente cadastrado no ambiente atual.");
        setPanelMode("details");
      }
      setSaving(false);
    }, 320);
  }

  function requestArchive(client: Client) {
    setArchiveCandidate(client);
  }

  function cancelArchive() {
    setArchiveCandidate(null);
  }

  async function confirmArchive() {
    if (!archiveCandidate) return;

    const archived = await archiveClientAsync(archiveCandidate.id, workspaceId);
    if (archived) {
      setSelectedClient((current) => (current?.id === archived.id ? archived : current));
      setForm(toForm(archived));
      await refresh("Cliente arquivado no ambiente atual.");
    }
    setArchiveCandidate(null);
  }

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-7 pb-4">
        {toast ? (
          <div className="fixed right-4 top-24 z-[90] max-w-sm rounded-2xl border border-lexos-gold/40 bg-[#0b1728]/95 p-4 text-sm font-semibold text-lexos-gold shadow-premium ring-1 ring-white/5">
            {toast}
          </div>
        ) : null}

        <section className="calm-hero operational-hero-compact">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Clientes • relacionamento operacional</p>
              <h1 className="mt-1.5 max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-white">Clientes</h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-5 text-lexos-muted">
                Acompanhe a carteira do escritório, identifique clientes em atenção e mantenha o relacionamento sob controle. {CLIENT_DATA_MODE_LABEL}
              </p>
            </div>
            <button
              data-testid="new-client-button"
              className="calm-primary-action"
              onClick={openCreatePanel}
              type="button"
            >
              Cadastrar cliente
            </button>
          </div>
        </section>

        <section className="operational-metrics-grid-compact grid md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => <ClientShortcutCard active={(stat.filterKey === "attention" && attentionOnly) || (stat.filterKey === "noReply" && noReplyOnly) || (stat.filterKey === "billing" && pendingBillingOnly) || (stat.filterKey === "process" && withProcessOnly) || (stat.filterKey === "status" && status === "ativo") || (stat.filterKey === "prospect" && status === "prospect")} key={stat.label} onClick={() => { if (stat.filterKey === "attention") setAttentionOnly((v) => !v); else if (stat.filterKey === "noReply") setNoReplyOnly((v) => !v); else if (stat.filterKey === "billing") setPendingBillingOnly((v) => !v); else if (stat.filterKey === "process") setWithProcessOnly((v) => !v); else if (stat.filterKey === "prospect") setStatus((v) => (v === "prospect" ? "todos" : "prospect")); else setStatus((v) => (v === "ativo" ? "todos" : "ativo")); }} {...stat} />)}
        </section>

        <SectionCard className="operational-panel-compact" eyebrow="Operação" title="Busca e filtros">
          <div className="grid gap-2.5 xl:grid-cols-[minmax(320px,1fr)_auto] xl:items-center">
            <input data-testid="client-search-input"
              className="operational-control-compact w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, documento, responsável ou pendência..."
              value={query}
            />
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((item) => (
                <button
                  className={cn(
                    "operational-chip-compact rounded-full border text-xs font-semibold capitalize transition hover:border-lexos-gold hover:text-lexos-gold",
                    status === item
                      ? "border-lexos-gold bg-lexos-gold/14 text-lexos-gold"
                      : "border-lexos-line bg-lexos-card/70 text-lexos-muted",
                  )}
                  key={item}
                  onClick={() => setStatus(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,0.65fr)_minmax(0,0.85fr)_minmax(0,2fr)] xl:items-end">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">Tipo
              <select className="operational-control-compact mt-1.5 w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "todos" | ClientType)}>
                <option value="todos">Todos</option><option value="pessoa_fisica">Pessoa física</option><option value="pessoa_juridica">Pessoa jurídica</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">Responsável
              <select className="operational-control-compact mt-1.5 w-full border border-lexos-line bg-lexos-ink/92 text-sm text-white" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner === "todos" ? "Todos" : owner}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              <ToggleFilter label="Em atenção" enabled={attentionOnly} onChange={setAttentionOnly} />
              <ToggleFilter label="Sem retorno" enabled={noReplyOnly} onChange={setNoReplyOnly} />
              <ToggleFilter label="Cobrança pendente" enabled={pendingBillingOnly} onChange={setPendingBillingOnly} />
              <ToggleFilter label="Com processo ativo" enabled={withProcessOnly} onChange={setWithProcessOnly} />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-lexos-muted">Filtros ativos: {[status !== "todos", typeFilter !== "todos", ownerFilter !== "todos", attentionOnly, noReplyOnly, pendingBillingOnly, withProcessOnly].filter(Boolean).length}</p>
            <button type="button" className="operational-action border-transparent text-lexos-muted hover:bg-white/[0.045] hover:text-white" onClick={() => { setStatus("todos"); setTypeFilter("todos"); setOwnerFilter("todos"); setAttentionOnly(false); setNoReplyOnly(false); setPendingBillingOnly(false); setWithProcessOnly(false); setQuery(""); }}>Limpar filtros</button>
          </div>
        </SectionCard>

        <SectionCard className="operational-panel-compact" eyebrow="Carteira" title={clientListTitles[status]} action={!loading ? <span className="rounded-full border border-lexos-cyan/35 px-3 py-1 text-xs font-semibold text-lexos-cyan">{filteredClients.length} cliente(s)</span> : null}>
          {loading ? (
            <EmptyState title="Carregando carteira do escritório..." description="Preparando os registros do escritório com segurança." />
          ) : filteredClients.length ? (
            <div className="space-y-3">
              <PaginationControls currentPage={page} onPageChange={setPage} pageSize={CLIENT_PAGE_SIZE} totalItems={filteredClients.length} />
              <div className="operational-list-grid-compact grid xl:grid-cols-2">
              {visibleClients.map((client) => (
                <article data-testid="client-card-item" className="calm-record-card operational-record-card interactive-card" key={client.id}>
                  <button className="w-full text-left" onClick={() => openDetails(client)} type="button">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.20em] text-lexos-cyan">{formatClientType(client.type)} • {client.segment}</p>
                        <h2 className="mt-1 text-lg font-semibold text-white">{client.name}</h2>
                        <p className="mt-1 text-sm text-lexos-muted">Responsável: {client.owner}</p>
                      </div>
                      <div className="operational-badges-compact flex flex-wrap gap-1 sm:justify-end">
                        <StatusBadge status={client.status} />
                        {clientSignals.get(client.id)?.inAttention ? <StatusBadge status="Em atenção" /> : null}
                      </div>
                    </div>
                    <div className="mt-2.5 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      <p className="text-lexos-silver"><span className="text-lexos-muted">Status operacional:</span> {client.status}</p>
                      <p className="text-lexos-silver"><span className="text-lexos-muted">Último contato:</span> {formatDate(client.last_contact_at)}</p>
                      <p className="text-lexos-silver sm:col-span-2"><span className="text-lexos-muted">Pendência principal:</span> {client.main_pending}</p>
                      <p className="text-lexos-cyan sm:col-span-2"><span className="text-lexos-muted">Próxima ação:</span> {client.next_action || "Registrar retorno"}</p>
                    </div>
                    {(clientSignals.get(client.id)?.noReply || clientSignals.get(client.id)?.hasBillingPending || clientSignals.get(client.id)?.hasActiveProcess) ? (
                      <p className="mt-2 text-xs leading-5 text-lexos-muted">
                        {[clientSignals.get(client.id)?.noReply ? "sem retorno recente" : null, clientSignals.get(client.id)?.hasBillingPending ? "cobrança pendente" : null, clientSignals.get(client.id)?.hasActiveProcess ? "processo ativo" : null].filter(Boolean).join(" • ")}
                      </p>
                    ) : null}
                  </button>
                  <div className="operational-action-row">
                    <button className="operational-action border-transparent bg-white/[0.055] text-lexos-cyan hover:bg-white/[0.09]" onClick={() => openDetails(client)} type="button">Abrir detalhes</button>
                                        <Link href={`/processos?action=novo&clientId=${client.id}`} className="operational-action border-transparent text-lexos-muted hover:bg-white/[0.045] hover:text-white">Criar processo</Link>
                    <Link href={`/tarefas?action=novo&clientId=${client.id}`} className="operational-action border-transparent text-lexos-muted hover:bg-white/[0.045] hover:text-white">Criar tarefa</Link>
                    <Link href={`/financeiro?clientId=${client.id}`} className="operational-action border-transparent text-lexos-muted hover:bg-white/[0.045] hover:text-white">Ver financeiro</Link>
                    <button className="operational-action border-lexos-wine/50 text-lexos-red hover:bg-lexos-wine/15" onClick={() => requestArchive(client)} type="button">Arquivar cliente</button>
                  </div>
                </article>
              ))}
              </div>
              <PaginationControls currentPage={page} onPageChange={setPage} pageSize={CLIENT_PAGE_SIZE} totalItems={filteredClients.length} />
            </div>
          ) : (
            <div className="space-y-4">
              <EmptyState title="Nenhum cliente cadastrado ainda." description="Cadastre o primeiro cliente para começar a acompanhar pendências, contatos, processos e financeiro." />
              <button className="mx-auto block rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft" onClick={openCreatePanel} type="button">Cadastrar cliente</button>
            </div>
          )}
        </SectionCard>
      </div>

      {panelMode ? (
        <ClientPanel
          client={selectedClient}
          form={form}
          formError={formError}
          linkedProcesses={linkedProcesses}
          linkedTasks={linkedTasks}
          mode={panelMode}
          onArchive={requestArchive}
          onClose={closePanel}
          onEdit={() => selectedClient && openEdit(selectedClient)}
          onFormChange={setForm}
          onSubmit={submitForm}
          saving={saving}
        />
      ) : null}

      {archiveCandidate ? (
        <ArchiveClientModal
          client={archiveCandidate}
          onCancel={cancelArchive}
          onConfirm={confirmArchive}
        />
      ) : null}
    </AppLayout>
  );
}

function ArchiveClientModal({
  client,
  onCancel,
  onConfirm,
}: {
  client: Client;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5">
        <div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Confirmação</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Arquivar cliente</h2>
          <p className="mt-3 text-sm leading-5 text-lexos-muted">
            Este cliente será marcado como inativo no ambiente atual. O registro não será excluído.
          </p>
          <div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Cliente selecionado</p>
            <p className="mt-2 text-lg font-semibold text-white">{client.name}</p>
            <p className="mt-1 text-sm text-lexos-muted">Responsável: {client.owner}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-2xl border border-lexos-wine/65 bg-lexos-wine/18 px-5 py-3 text-sm font-semibold text-lexos-red transition hover:-translate-y-0.5 hover:bg-lexos-wine/26 hover:shadow-[0_18px_48px_rgba(122,27,54,0.22)]"
            onClick={onConfirm}
            type="button"
          >
            Arquivar cliente
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientPanel({
  client,
  form,
  formError,
  linkedProcesses,
  linkedTasks,
  mode,
  onArchive,
  onClose,
  onEdit,
  onFormChange,
  onSubmit,
  saving,
}: {
  client: Client | null;
  form: ClientInput;
  formError: string | null;
  linkedProcesses: Process[];
  linkedTasks: Task[];
  mode: PanelMode;
  onArchive: (client: Client) => void;
  onClose: () => void;
  onEdit: () => void;
  onFormChange: (form: ClientInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const isForm = mode === "create" || mode === "edit";

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-lexos-ink/78 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-5xl rounded-[1.8rem] border border-lexos-gold/30 bg-[#0b1728] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5 lg:p-7">
        <div className="mb-5 flex flex-col gap-3 border-b border-lexos-line/80 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{isForm ? "Ficha operacional" : "Detalhes do cliente"}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{mode === "create" ? "Novo cliente" : client?.name}</h2>
            <p className="mt-2 text-sm leading-5 text-lexos-muted">Vínculos e persistência respeitam o ambiente atual, mantendo a demonstração separada.</p>
          </div>
          <button className="rounded-full border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Fechar</button>
        </div>

        {isForm ? (
          <form className="space-y-5" onSubmit={onSubmit}>
            {formError ? <div className="rounded-2xl border border-lexos-wine/55 bg-lexos-wine/12 p-3 text-sm text-lexos-red">{formError}</div> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome/Razão social" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} placeholder="Ex.: Grupo Auri Legal" />
              <label className="text-sm text-lexos-muted">Tipo de cliente
                <select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none focus:border-lexos-gold" onChange={(event) => onFormChange({ ...form, type: event.target.value as ClientType })} value={form.type}>
                  <option value="pessoa_juridica">Pessoa jurídica</option>
                  <option value="pessoa_fisica">Pessoa física</option>
                </select>
              </label>
              <Field label="CPF/CNPJ ou documento" value={form.document} onChange={(value) => onFormChange({ ...form, document: value })} placeholder="Documento de referência" />
              <Field label="E-mail" value={form.email} onChange={(value) => onFormChange({ ...form, email: value })} placeholder="contato@cliente.com.br" />
              <Field label="Telefone/WhatsApp" value={form.phone} onChange={(value) => onFormChange({ ...form, phone: value })} placeholder="(00) 00000-0000" />
              <label className="text-sm text-lexos-muted">Status
                <select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none focus:border-lexos-gold" onChange={(event) => onFormChange({ ...form, status: event.target.value as ClientStatus })} value={form.status}>
                  <option value="ativo">Ativo</option>
                  <option value="atenção">Atenção</option>
                  <option value="prospect">Prospect</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <Field label="Responsável" value={form.owner} onChange={(value) => onFormChange({ ...form, owner: value })} placeholder="Dra. Marina Almeida" />
              <Field label="Segmento" value={form.segment} onChange={(value) => onFormChange({ ...form, segment: value })} placeholder="Societário, trabalhista, família..." />
              <Field label="Pendência principal" value={form.main_pending} onChange={(value) => onFormChange({ ...form, main_pending: value })} placeholder="Documento, retorno, assinatura..." />
              <Field label="Próxima ação" value={form.next_action} onChange={(value) => onFormChange({ ...form, next_action: value })} placeholder="Agendar reunião, enviar checklist..." />
            </div>
            <label className="block text-sm text-lexos-muted">Observações
              <textarea className="mt-2 min-h-24 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" onChange={(event) => onFormChange({ ...form, notes: event.target.value })} placeholder="Contexto jurídico, combinados, riscos de relacionamento..." value={form.notes} />
            </label>
            <div className="flex flex-wrap justify-end gap-3 border-t border-lexos-line/80 pt-5">
              <button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onClose} type="button">Cancelar</button>
              <button data-testid="save-client-button" className="rounded-2xl border border-lexos-gold/60 bg-lexos-gold px-5 py-3 text-sm font-semibold text-lexos-ink transition hover:bg-lexos-goldSoft disabled:cursor-not-allowed disabled:opacity-70" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar cliente"}</button>
            </div>
          </form>
        ) : client ? (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-lexos-cyan">{formatClientType(client.type)} • {client.segment}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{client.name}</h3>
                    <p className="mt-1 text-sm text-lexos-muted">{client.document} • {client.email || "sem e-mail"} • {client.phone || "sem telefone"}</p>
                  </div>
                  <StatusBadge status={client.status} />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Responsável" value={client.owner} />
                  <Info label="Último contato" value={formatDate(client.last_contact_at)} />
                  <Info label="Pendência principal" value={client.main_pending} />
                  <Info label="Próxima ação" value={client.next_action || "Definir próximo passo"} />
                </div>
                <div className="mt-4 rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4">
                  <p className="text-sm text-lexos-muted">Observações</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{client.notes || "Sem observações registradas."}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/18" onClick={onEdit} type="button">Editar dados</button>
                <button className="rounded-2xl border border-lexos-wine/55 px-4 py-3 text-sm font-semibold text-lexos-red transition hover:bg-lexos-wine/14" onClick={() => onArchive(client)} type="button">Arquivar cliente</button>
              </div>
            </div>
            <div className="space-y-4">
              <LinkedSection title="Processos vinculados" empty="Nenhum processo vinculado a este cliente ainda." items={linkedProcesses.map((process) => `${process.number} • ${process.area} • ${process.next_action}`)} />
              <LinkedTasksSection tasks={linkedTasks} />
              <p className="rounded-2xl border border-lexos-gold/20 bg-lexos-gold/8 p-4 text-xs leading-5 text-lexos-goldSoft">Vínculos carregados conforme a sessão atual.</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClientShortcutCard({ active, detail, label, onClick, tone, value }: { active: boolean; detail: string; label: string; onClick: () => void; tone: string; value: string }) {
  const tones: Record<string, string> = {
    neutral: "text-lexos-silver",
    urgent: "text-lexos-red",
    warning: "text-lexos-goldSoft",
    positive: "text-lexos-green",
    premium: "text-lexos-cyan",
  };
  return (
    <button aria-pressed={active} className={cn("calm-metric-card text-left", tones[tone], active ? "bg-lexos-cyan/[0.09] ring-1 ring-lexos-cyan/45" : "")} onClick={onClick} type="button">
      <p className="text-xs text-lexos-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em]">
        {detail}{active ? <span className="text-lexos-cyan">• filtro ativo</span> : null}
      </p>
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="text-sm text-lexos-muted">{label}
      <input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}

function ToggleFilter({
  enabled,
  label,
  onChange,
}: {
  enabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "operational-toggle-compact rounded-xl border text-left text-[11px] font-semibold uppercase tracking-[0.11em] transition",
        enabled ? "border-lexos-gold bg-lexos-gold/14 text-lexos-gold" : "border-lexos-line bg-lexos-ink/70 text-lexos-muted hover:border-lexos-gold/45",
      )}
      onClick={() => onChange(!enabled)}
      type="button"
    >
      {label}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-lexos-line/70 bg-lexos-ink/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function LinkedTasksSection({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5">
      <p className="font-semibold text-white">Tarefas vinculadas</p>
      <div className="mt-3 space-y-2">
        {tasks.length ? tasks.map((task) => (
          <Link className="block rounded-2xl border border-lexos-line/65 bg-lexos-ink/55 p-3 text-sm leading-6 text-lexos-silver transition hover:border-lexos-gold/45 hover:text-white" href={`/tarefas?taskId=${task.id}`} key={task.id}>
            <span className="font-semibold text-white">{task.title}</span><br />
            {resolveEffectiveTaskStatus(task)} • {task.priority} • {task.responsible} • prazo {formatShortDate(task.due_at)}
            {task.process_number ? <span className="block text-xs text-lexos-muted">Processo: {task.process_number}</span> : null}
          </Link>
        )) : <p className="rounded-2xl border border-dashed border-lexos-gold/25 bg-lexos-ink/45 p-4 text-sm leading-5 text-lexos-muted">Nenhuma tarefa vinculada a este cliente ainda.</p>}
      </div>
    </div>
  );
}

function formatShortDate(value: string) {
  if (!value) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function LinkedSection({ title, empty, items }: { title: string; empty: string; items: string[] }) {
  return (
    <div className="rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5">
      <p className="font-semibold text-white">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => <p className="rounded-2xl border border-lexos-line/65 bg-lexos-ink/55 p-3 text-sm leading-6 text-lexos-silver" key={item}>{item}</p>) : <p className="text-sm text-lexos-muted">{empty}</p>}
      </div>
    </div>
  );
}
