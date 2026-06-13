import { financeRows } from "@/data/mock";
import { FALLBACK_WORKSPACE_ID, getInitialClients } from "./clients";
import { getInitialProcesses } from "./processes";

export type FinanceRecordType =
  | "honorarios"
  | "sucumbencia"
  | "consultoria"
  | "mensalidade"
  | "parcela"
  | "custas"
  | "acordo"
  | "reembolso"
  | "despesa"
  | "repasse_parceria"
  | "outro";
export type FinanceDirection = "entrada" | "saida";
export type FinanceStatus = "previsto" | "pendente" | "aguardando" | "pago" | "vencido" | "cancelado" | "arquivado";
export type PaymentMethod = "pix" | "boleto" | "transferencia" | "dinheiro" | "cartao" | "outro" | "nao_definido";
export type FinanceView = "receber" | "vencidos" | "inadimplentes" | "prevista" | "proximas" | "pendentes" | "recebidos" | "arquivados" | "principal";
export type FinanceDataMode = "demo_local" | "supabase_ready" | "external_ready";

export type FinancialRecord = {
  id: string;
  workspace_id: string;
  client_id?: string;
  client_name?: string;
  process_id?: string;
  process_number?: string;
  task_id?: string;
  agenda_event_id?: string;
  partnership_id?: string;
  title: string;
  description: string;
  type: FinanceRecordType;
  direction: FinanceDirection;
  status: FinanceStatus;
  amount: number;
  paid_amount?: number;
  due_at: string;
  paid_at?: string;
  installment_number?: number;
  installment_total?: number;
  responsible: string;
  payment_method?: PaymentMethod;
  category: string;
  next_action: string;
  notes: string;
  created_at: string;
  updated_at: string;
  canceled_at?: string;
  archived_at?: string;
};

export type FinancialRecordInput = Omit<FinancialRecord, "id" | "workspace_id" | "created_at" | "updated_at" | "canceled_at" | "archived_at"> & {
  canceled_at?: string;
  archived_at?: string;
};

export type FinanceFilters = {
  view?: FinanceView;
  status?: FinanceStatus | "todos";
  type?: FinanceRecordType | "todos";
  direction?: FinanceDirection | "todos";
  responsible?: string | "todos";
  clientId?: string | "todos";
  period?: "todos" | "vencidos" | "proximos_7" | "proximos_15" | "proximos_30" | "mes_atual";
  query?: string;
  includeArchived?: boolean;
};

const DEMO_FINANCE_STORAGE_PREFIX = "lexos.control.demo.finance";
export const FINANCE_DATA_MODE: FinanceDataMode = "demo_local";
export const FINANCE_DATA_MODE_LABEL =
  "Modo demonstração: financeiro salvo localmente no navegador, sem PIX, boleto, banco, gateway ou sincronização externa.";
export const FINANCE_UPDATED_EVENT = "lexos:finance-updated";

const statusMap: Record<string, FinanceStatus> = {
  vencido: "vencido",
  pago: "pago",
  "em aberto": "pendente",
  "parcialmente pago": "aguardando",
  renegociado: "aguardando",
};

function moneyToNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return Number(digits || 0) / 100;
}

function brToIso(value: string) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function buildInitialRecords(workspaceId = FALLBACK_WORKSPACE_ID): FinancialRecord[] {
  const clients = getInitialClients(workspaceId);
  const processes = getInitialProcesses(workspaceId);
  const mapped = financeRows.map((row, index) => {
    const client = clients.find((item) => item.name === row.client) ?? clients[index % clients.length];
    const process = processes.find((item) => item.client_id === client?.id || item.client_name === row.client) ?? processes[index % processes.length];
    const status = statusMap[row.status] ?? "pendente";
    const amount = moneyToNumber(row.contracted);
    const paidAmount = moneyToNumber(row.paid);
    const pendingAmount = moneyToNumber(row.pending);
    const timestamp = `2026-05-${String(7 + index).padStart(2, "0")}T10:30:00.000Z`;

    return {
      id: `finance-demo-${index + 1}`,
      workspace_id: workspaceId,
      client_id: client?.id,
      client_name: row.client,
      process_id: process?.id,
      process_number: process?.number ?? row.contract,
      title: row.contract,
      description: `Recebível demonstrativo vinculado a ${row.contract}.`,
      type: status === "vencido" ? "honorarios" : index % 2 === 0 ? "mensalidade" : "parcela",
      direction: "entrada",
      status,
      amount: pendingAmount > 0 ? pendingAmount : amount,
      paid_amount: paidAmount || undefined,
      due_at: brToIso(row.due),
      paid_at: status === "pago" ? `2026-05-${String(2 + index).padStart(2, "0")}T14:00:00.000Z` : undefined,
      installment_number: index + 1,
      installment_total: 4,
      responsible: ["Carla Nogueira", "Lívia Ramos", "Dra. Helena"][index % 3],
      payment_method: "nao_definido",
      category: status === "vencido" ? "Cobrança consultiva" : "Recebível operacional",
      next_action:
        status === "vencido"
          ? "Executar cobrança consultiva e registrar retorno."
          : status === "pago"
            ? "Validar comprovante demonstrativo e manter histórico."
            : "Acompanhar recebimento e atualizar previsão.",
      notes: "Registro financeiro demonstrativo sem integração bancária, boleto ou PIX real.",
      created_at: `2026-05-${String(1 + index).padStart(2, "0")}T09:00:00.000Z`,
      updated_at: timestamp,
    } satisfies FinancialRecord;
  });

  return [
    ...mapped,
    {
      id: "finance-demo-extra-1",
      workspace_id: workspaceId,
      client_id: clients[0]?.id,
      client_name: clients[0]?.name,
      process_id: processes[0]?.id,
      process_number: processes[0]?.number,
      title: "Parcela 2/4 — acordo estratégico",
      description: "Parcela futura de acordo demonstrativo para previsão de caixa.",
      type: "acordo",
      direction: "entrada",
      status: "previsto",
      amount: 18500,
      due_at: "2026-05-22",
      installment_number: 2,
      installment_total: 4,
      responsible: "Carla Nogueira",
      payment_method: "transferencia",
      category: "Acordo",
      next_action: "Confirmar disponibilidade de pagamento com o cliente.",
      notes: "Previsão demonstrativa futura, sem cobrança externa.",
      created_at: "2026-05-08T09:00:00.000Z",
      updated_at: "2026-05-08T09:00:00.000Z",
    },
    {
      id: "finance-demo-extra-2",
      workspace_id: workspaceId,
      title: "Custas administrativas — protocolo",
      description: "Saída demonstrativa para manter estrutura preparada a despesas.",
      type: "custas",
      direction: "saida",
      status: "pendente",
      amount: 1240,
      due_at: "2026-05-18",
      responsible: "Lívia Ramos",
      payment_method: "nao_definido",
      category: "Custas",
      next_action: "Validar autorização interna antes do pagamento.",
      notes: "Despesa demonstrativa, sem rotina contábil complexa.",
      created_at: "2026-05-09T09:00:00.000Z",
      updated_at: "2026-05-09T09:00:00.000Z",
    },
  ];
}

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${DEMO_FINANCE_STORAGE_PREFIX}.${workspaceId}`;
}

function isFinancialRecord(value: unknown): value is FinancialRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<FinancialRecord>;
  return Boolean(record.id && record.workspace_id && record.title && record.direction && record.status && typeof record.amount === "number");
}

function safeParseRecords(raw: string | null): FinancialRecord[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isFinancialRecord);
  } catch {
    return null;
  }
}

function persistRecords(records: FinancialRecord[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(FINANCE_UPDATED_EVENT, { detail: { workspaceId } }));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `finance-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getInitialFinancialRecords(workspaceId = FALLBACK_WORKSPACE_ID) {
  return buildInitialRecords(workspaceId);
}

function getFinancialRecordSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParseRecords(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getInitialFinancialRecords(workspaceId);
}

export function resolveEffectiveFinanceStatus(record: FinancialRecord): FinanceStatus {
  if (["pago", "cancelado", "arquivado", "vencido"].includes(record.status)) return record.status;
  return isPastDate(record.due_at) ? "vencido" : record.status;
}

function withEffectiveFinanceStatus(record: FinancialRecord): FinancialRecord {
  const status = resolveEffectiveFinanceStatus(record);
  return status === record.status ? record : { ...record, status };
}

export function listFinancialRecords(workspaceId = FALLBACK_WORKSPACE_ID, filters: FinanceFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  return filterFinancialRecords(getFinancialRecordSource(workspaceId), filters);
}

export function filterFinancialRecords(records: FinancialRecord[], filters: FinanceFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return records
    .map(withEffectiveFinanceStatus)
    .filter((record) => (filters.includeArchived ? true : !["cancelado", "arquivado"].includes(record.status)))
    .filter((record) => (filters.view ? financeMatchesView(record, filters.view) : true))
    .filter((record) => (filters.status && filters.status !== "todos" ? record.status === filters.status : true))
    .filter((record) => (filters.type && filters.type !== "todos" ? record.type === filters.type : true))
    .filter((record) => (filters.direction && filters.direction !== "todos" ? record.direction === filters.direction : true))
    .filter((record) => (filters.responsible && filters.responsible !== "todos" ? record.responsible === filters.responsible : true))
    .filter((record) => (filters.clientId && filters.clientId !== "todos" ? record.client_id === filters.clientId : true))
    .filter((record) => matchesPeriod(record, filters.period ?? "todos"))
    .filter((record) => {
      if (!query) return true;
      return [
        record.title,
        record.description,
        record.client_name,
        record.process_number,
        record.responsible,
        record.status,
        record.type,
        record.category,
        record.next_action,
        record.notes,
        String(record.amount),
        formatCurrency(record.amount),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getFinancialRecordById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }).find((record) => record.id === id) ?? null;
}

export function createFinancialRecord(input: FinancialRecordInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Lançamentos financeiros reais ainda não possuem tabela ativa neste estágio.");
  const timestamp = nowIso();
  const record: FinancialRecord = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
    canceled_at: input.status === "cancelado" ? timestamp : input.canceled_at,
    archived_at: input.status === "arquivado" ? timestamp : input.archived_at,
  };
  persistRecords([record, ...getFinancialRecordSource(workspaceId)], workspaceId);
  return record;
}

export function updateFinancialRecord(id: string, input: Partial<FinancialRecordInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: FinancialRecord | null = null;
  const next = getFinancialRecordSource(workspaceId).map((record) => {
    if (record.id !== id) return record;
    const status = input.status ?? record.status;
    updated = {
      ...record,
      ...input,
      updated_at: nowIso(),
      canceled_at: status === "cancelado" ? record.canceled_at ?? input.canceled_at ?? nowIso() : input.canceled_at,
      archived_at: status === "arquivado" ? record.archived_at ?? input.archived_at ?? nowIso() : input.archived_at,
    };
    return updated;
  });
  persistRecords(next, workspaceId);
  return updated;
}

export function markFinancialRecordAsPaid(id: string, paidAmount?: number, paidAt = nowIso(), workspaceId = FALLBACK_WORKSPACE_ID) {
  const record = getFinancialRecordById(id, workspaceId);
  if (!record) return null;
  return updateFinancialRecord(id, { status: "pago", paid_at: paidAt, paid_amount: paidAmount ?? record.amount }, workspaceId);
}

export function reopenFinancialRecord(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateFinancialRecord(id, { status: "pendente", paid_at: undefined, paid_amount: undefined }, workspaceId);
}

export function rescheduleFinancialRecord(id: string, dueAt: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const nextStatus = isPastDate(dueAt) ? "vencido" : "pendente";
  return updateFinancialRecord(id, { due_at: dueAt, status: nextStatus }, workspaceId);
}

export function cancelFinancialRecord(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateFinancialRecord(id, { status: "cancelado", canceled_at: nowIso() }, workspaceId);
}

export function archiveFinancialRecord(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateFinancialRecord(id, { status: "arquivado", archived_at: nowIso() }, workspaceId);
}

export function listFinancialRecordsByClientId(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }).filter((record) => record.client_id === clientId);
}

export function listFinancialRecordsByProcessId(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }).filter((record) => record.process_id === processId);
}

export function isPastDate(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${date}T00:00:00`) < today;
}

export function isUpcomingRecord(record: FinancialRecord, days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  const due = new Date(`${record.due_at}T00:00:00`);
  return due >= today && due <= limit && !["pago", "cancelado", "arquivado"].includes(record.status);
}

export function isReceivedThisMonth(record: FinancialRecord) {
  if (record.status !== "pago" || !record.paid_at) return false;
  const paid = new Date(record.paid_at);
  const today = new Date();
  return paid.getMonth() === today.getMonth() && paid.getFullYear() === today.getFullYear();
}

export function financeMatchesView(record: FinancialRecord, view: FinanceView): boolean {
  if (view === "principal") return record.direction === "entrada" && ["previsto", "pendente", "aguardando", "vencido"].includes(record.status);
  if (view === "receber") return record.direction === "entrada" && ["previsto", "pendente", "aguardando"].includes(record.status);
  if (view === "vencidos") return isPastDate(record.due_at) && !["pago", "cancelado", "arquivado"].includes(record.status);
  if (view === "inadimplentes") return Boolean(record.client_id || record.client_name) && financeMatchesView(record, "vencidos");
  if (view === "prevista") return record.direction === "entrada" && record.status === "previsto" && !isPastDate(record.due_at);
  if (view === "proximas") return isUpcomingRecord(record, 30);
  if (view === "pendentes") return record.direction === "entrada" && record.status === "pendente";
  if (view === "recebidos") return isReceivedThisMonth(record);
  if (view === "arquivados") return ["cancelado", "arquivado"].includes(record.status) || Boolean(record.canceled_at || record.archived_at);
  return true;
}

function matchesPeriod(record: FinancialRecord, period: NonNullable<FinanceFilters["period"]>) {
  if (period === "todos") return true;
  if (period === "vencidos") return financeMatchesView(record, "vencidos");
  if (period === "proximos_7") return isUpcomingRecord(record, 7);
  if (period === "proximos_15") return isUpcomingRecord(record, 15);
  if (period === "proximos_30") return isUpcomingRecord(record, 30);
  if (period === "mes_atual") return isReceivedThisMonth(record) || isDateThisMonth(record.due_at);
  return true;
}

function isDateThisMonth(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  return target.getMonth() === today.getMonth() && target.getFullYear() === today.getFullYear();
}

export function sumFinancialAmount(recordsToSum: FinancialRecord[]) {
  return recordsToSum.reduce((sum, record) => sum + record.amount, 0);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

export function formatDate(date?: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(date.includes("T") ? date : `${date}T12:00:00`));
}

export function getDelinquentClients(records: FinancialRecord[]) {
  const overdue = records.filter((record) => financeMatchesView(record, "vencidos"));
  const grouped = new Map<string, { client_id?: string; client_name: string; total: number; count: number; records: FinancialRecord[] }>();
  overdue.forEach((record) => {
    const key = record.client_id ?? record.client_name ?? "cliente-sem-vinculo";
    const current = grouped.get(key) ?? { client_id: record.client_id, client_name: record.client_name ?? "Cliente não vinculado", total: 0, count: 0, records: [] };
    current.total += record.amount;
    current.count += 1;
    current.records.push(record);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

export function getFinanceStats(workspaceId = FALLBACK_WORKSPACE_ID) {
  const all = listFinancialRecords(workspaceId, { includeArchived: true, view: undefined });
  return [
    { view: "receber" as const, label: "Valores a receber", value: formatCurrency(sumFinancialAmount(all.filter((record) => financeMatchesView(record, "receber")))), detail: "pendentes/previstos", tone: "premium" },
    { view: "vencidos" as const, label: "Valores vencidos", value: formatCurrency(sumFinancialAmount(all.filter((record) => financeMatchesView(record, "vencidos")))), detail: "cobrança ativa", tone: "urgent" },
    { view: "inadimplentes" as const, label: "Clientes inadimplentes", value: String(getDelinquentClients(all).length), detail: "com vencidos", tone: "warning" },
    { view: "prevista" as const, label: "Receita prevista", value: formatCurrency(sumFinancialAmount(all.filter((record) => financeMatchesView(record, "prevista")))), detail: "futura", tone: "positive" },
    { view: "proximas" as const, label: "Parcelas próximas", value: String(all.filter((record) => financeMatchesView(record, "proximas")).length), detail: "30 dias", tone: "neutral" },
    { view: "pendentes" as const, label: "Cobranças pendentes", value: String(all.filter((record) => financeMatchesView(record, "pendentes")).length), detail: "ação ativa", tone: "warning" },
    { view: "recebidos" as const, label: "Recebidos no mês", value: formatCurrency(sumFinancialAmount(all.filter((record) => financeMatchesView(record, "recebidos")))), detail: "pagos", tone: "positive" },
    { view: "arquivados" as const, label: "Arquivados/Cancelados", value: String(all.filter((record) => financeMatchesView(record, "arquivados")).length), detail: "fora da operação", tone: "neutral" },
  ];
}

export function getLocalFinanceSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listFinancialRecords(workspaceId, { includeArchived: true, view: undefined }).map((record) => ({
    type: "Financeiro",
    title: record.title,
    description: `${record.client_name ?? "Sem cliente"} • ${formatCurrency(record.amount)} • ${record.status} • venc. ${formatDate(record.due_at)}`,
    route: `/financeiro?financeId=${record.id}`,
    action: "Abrir lançamento",
  }));
}

export async function getFinancialRecords() {
  return getInitialFinancialRecords();
}

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { getDataSource, shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logFinanceActivity } from "@/lib/data/activityLogs";

export const FINANCE_REAL_DATA_MODE_LABEL =
  getDataSource() === "supabase"
    ? "Ambiente conectado: financeiro e vínculos carregados exclusivamente do escritório."
    : FINANCE_DATA_MODE_LABEL;

type SupabaseFinanceStatus = "planned" | "pending" | "waiting" | "paid" | "overdue" | "canceled" | "archived";

type SupabaseFinancialRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  process_id: string | null;
  task_id: string | null;
  agenda_event_id: string | null;
  partnership_id: string | null;
  title: string | null;
  description: string | null;
  record_type: string | null;
  direction: string | null;
  status: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  paid_at: string | null;
  installment_number: number | null;
  installment_total: number | null;
  responsible: string | null;
  payment_method: string | null;
  category: string | null;
  next_action: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  canceled_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  clients?: { name?: string | null } | Array<{ name?: string | null }> | null;
  processes?: { number?: string | null; title?: string | null } | Array<{ number?: string | null; title?: string | null }> | null;
};

const FINANCIAL_SELECT = "id, workspace_id, client_id, process_id, task_id, agenda_event_id, partnership_id, title, description, record_type, direction, status, amount, paid_amount, due_date, paid_at, installment_number, installment_total, responsible, payment_method, category, next_action, notes, metadata, canceled_at, archived_at, created_at, updated_at";

const financeTypeSet = new Set<FinanceRecordType>(["honorarios", "sucumbencia", "consultoria", "mensalidade", "parcela", "custas", "acordo", "reembolso", "despesa", "repasse_parceria", "outro"]);
const financeDirectionSet = new Set<FinanceDirection>(["entrada", "saida"]);
const financeStatusSet = new Set<FinanceStatus>(["previsto", "pendente", "aguardando", "pago", "vencido", "cancelado", "arquivado"]);
const paymentMethodSet = new Set<PaymentMethod>(["pix", "boleto", "transferencia", "dinheiro", "cartao", "outro", "nao_definido"]);

const uiToDbStatus: Record<FinanceStatus, SupabaseFinanceStatus> = {
  previsto: "planned",
  pendente: "pending",
  aguardando: "waiting",
  pago: "paid",
  vencido: "overdue",
  cancelado: "canceled",
  arquivado: "archived",
};

const dbToUiStatus: Record<string, FinanceStatus> = {
  planned: "previsto",
  pending: "pendente",
  waiting: "aguardando",
  paid: "pago",
  overdue: "vencido",
  canceled: "cancelado",
  archived: "arquivado",
  previsto: "previsto",
  pendente: "pendente",
  aguardando: "aguardando",
  pago: "pago",
  vencido: "vencido",
  cancelado: "cancelado",
  arquivado: "arquivado",
};

function firstFinanceRelation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function normalizeFinanceType(value: string | null | undefined): FinanceRecordType { return financeTypeSet.has((value || "") as FinanceRecordType) ? (value as FinanceRecordType) : "outro"; }
function normalizeFinanceDirection(value: string | null | undefined): FinanceDirection { return financeDirectionSet.has((value || "") as FinanceDirection) ? (value as FinanceDirection) : "entrada"; }
function normalizeFinanceStatus(value: string | null | undefined): FinanceStatus { return dbToUiStatus[value || ""] ?? (financeStatusSet.has((value || "") as FinanceStatus) ? (value as FinanceStatus) : "pendente"); }
function normalizePaymentMethod(value: string | null | undefined): PaymentMethod { return paymentMethodSet.has((value || "") as PaymentMethod) ? (value as PaymentMethod) : "nao_definido"; }

function fromSupabaseFinancial(row: SupabaseFinancialRow): FinancialRecord {
  const timestamp = row.updated_at || row.created_at || nowIso();
  const linkedProcess = firstFinanceRelation(row.processes);
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || undefined,
    client_name: firstFinanceRelation(row.clients)?.name || undefined,
    process_id: row.process_id || undefined,
    process_number: linkedProcess?.number || linkedProcess?.title || undefined,
    task_id: row.task_id || undefined,
    agenda_event_id: row.agenda_event_id || undefined,
    partnership_id: row.partnership_id || undefined,
    title: row.title || "Lançamento sem título",
    description: row.description || "",
    type: normalizeFinanceType(row.record_type),
    direction: normalizeFinanceDirection(row.direction),
    status: normalizeFinanceStatus(row.status),
    amount: Number(row.amount || 0),
    paid_amount: row.paid_amount === undefined || row.paid_amount === null ? undefined : Number(row.paid_amount),
    due_at: row.due_date || "",
    paid_at: row.paid_at || undefined,
    installment_number: row.installment_number || undefined,
    installment_total: row.installment_total || undefined,
    responsible: row.responsible || "",
    payment_method: normalizePaymentMethod(row.payment_method),
    category: row.category || "",
    next_action: row.next_action || "",
    notes: row.notes || "",
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
    canceled_at: row.canceled_at || undefined,
    archived_at: row.archived_at || undefined,
  };
}

function toSupabaseFinancial(input: Partial<FinancialRecordInput>, workspaceId: string) {
  const status = input.status;
  const has = (key: keyof FinancialRecordInput) => Object.prototype.hasOwnProperty.call(input, key);
  return {
    workspace_id: workspaceId,
    client_id: has("client_id") ? input.client_id || null : undefined,
    process_id: has("process_id") ? input.process_id || null : undefined,
    task_id: has("task_id") ? input.task_id || null : undefined,
    agenda_event_id: has("agenda_event_id") ? input.agenda_event_id || null : undefined,
    partnership_id: has("partnership_id") ? input.partnership_id || null : undefined,
    title: input.title,
    description: has("description") ? input.description ?? null : undefined,
    record_type: input.type,
    direction: input.direction,
    status: status ? uiToDbStatus[status] : undefined,
    amount: input.amount,
    paid_amount: has("paid_amount") ? input.paid_amount ?? null : undefined,
    due_date: has("due_at") ? input.due_at || null : undefined,
    paid_at: has("paid_at") ? input.paid_at || null : undefined,
    installment_number: has("installment_number") ? input.installment_number ?? null : undefined,
    installment_total: has("installment_total") ? input.installment_total ?? null : undefined,
    responsible: has("responsible") ? input.responsible ?? null : undefined,
    payment_method: has("payment_method") ? input.payment_method || "nao_definido" : undefined,
    category: has("category") ? input.category ?? null : undefined,
    next_action: has("next_action") ? input.next_action ?? null : undefined,
    notes: has("notes") ? input.notes ?? null : undefined,
    canceled_at: status === "cancelado" ? input.canceled_at || nowIso() : has("canceled_at") ? input.canceled_at ?? null : undefined,
    archived_at: status === "arquivado" ? input.archived_at || nowIso() : has("archived_at") ? input.archived_at ?? null : undefined,
  };
}

function compactSupabasePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function recordFinanceActivity(workspaceId: string, action: string, entityId: string, description: string) {
  await logFinanceActivity({
    workspaceId,
    action,
    entityId,
    description,
  });
}

export async function listFinancialRecordsAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: FinanceFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listFinancialRecords(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("financial_records")
      .select(FINANCIAL_SELECT)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return filterFinancialRecords(((data || []) as SupabaseFinancialRow[]).map(fromSupabaseFinancial), filters);
  } catch (error) {
    warnSupabaseOperationalError("Financeiro", error);
    return [];
  }
}

export async function getFinancialRecordByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getFinancialRecordById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("financial_records")
      .select(FINANCIAL_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseFinancial(data as SupabaseFinancialRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Financeiro", error);
    return null;
  }
}

export async function createFinancialRecordAsync(input: FinancialRecordInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createFinancialRecord(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar lançamento financeiro real.");

  try {
    const { data, error } = await (supabase as any)
      .from("financial_records")
      .insert(compactSupabasePayload(toSupabaseFinancial(input, workspaceId)))
      .select(FINANCIAL_SELECT)
      .single();
    if (error) throw error;
    const record = fromSupabaseFinancial(data as SupabaseFinancialRow);
    await recordFinanceActivity(workspaceId, "financial_record_created", record.id, `Lançamento financeiro ${record.title} criado.`);
    return record;
  } catch (error) {
    warnSupabaseOperationalError("Financeiro", error);
    throw error;
  }
}

export async function updateFinancialRecordAsync(id: string, input: Partial<FinancialRecordInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return updateFinancialRecord(id, input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar lançamento financeiro real.");

  try {
    const { data, error } = await (supabase as any)
      .from("financial_records")
      .update(compactSupabasePayload(toSupabaseFinancial(input, workspaceId)))
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(FINANCIAL_SELECT)
      .single();
    if (error) throw error;
    const record = fromSupabaseFinancial(data as SupabaseFinancialRow);
    await recordFinanceActivity(workspaceId, record.status === "arquivado" ? "financial_record_archived" : record.status === "cancelado" ? "financial_record_canceled" : "financial_record_updated", record.id, `Lançamento financeiro ${record.title} atualizado.`);
    return record;
  } catch (error) {
    warnSupabaseOperationalError("Financeiro", error);
    throw error;
  }
}

export async function markFinancialRecordAsPaidAsync(id: string, paidAmount?: number, paidAt = nowIso(), workspaceId = FALLBACK_WORKSPACE_ID) {
  const record = await getFinancialRecordByIdAsync(id, workspaceId);
  if (!record) return null;
  const updated = await updateFinancialRecordAsync(id, { status: "pago", paid_at: paidAt, paid_amount: paidAmount ?? record.amount, canceled_at: undefined, archived_at: undefined }, workspaceId);
  if (shouldUseWorkspaceSupabase() && updated) await recordFinanceActivity(workspaceId, "financial_record_paid", updated.id, `Pagamento registrado para ${updated.title}.`);
  return updated;
}

export async function reopenFinancialRecordAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const updated = await updateFinancialRecordAsync(id, { status: "pendente", paid_at: undefined, paid_amount: undefined, canceled_at: undefined, archived_at: undefined }, workspaceId);
  if (shouldUseWorkspaceSupabase() && updated) await recordFinanceActivity(workspaceId, "financial_record_reopened", updated.id, `Cobrança ${updated.title} reaberta.`);
  return updated;
}

export async function rescheduleFinancialRecordAsync(id: string, dueAt: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  const nextStatus = isPastDate(dueAt) ? "vencido" : "pendente";
  const updated = await updateFinancialRecordAsync(id, { due_at: dueAt, status: nextStatus }, workspaceId);
  if (shouldUseWorkspaceSupabase() && updated) await recordFinanceActivity(workspaceId, "financial_record_due_date_changed", updated.id, `Vencimento atualizado para ${updated.title}.`);
  return updated;
}

export async function cancelFinancialRecordAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateFinancialRecordAsync(id, { status: "cancelado", canceled_at: nowIso() }, workspaceId);
}

export async function archiveFinancialRecordAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updateFinancialRecordAsync(id, { status: "arquivado", archived_at: nowIso() }, workspaceId);
}

export async function listFinancialRecordsByClientIdAsync(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return (await listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined })).filter((record) => record.client_id === clientId);
}

export async function listFinancialRecordsByProcessIdAsync(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return (await listFinancialRecordsAsync(workspaceId, { includeArchived: true, view: undefined })).filter((record) => record.process_id === processId);
}
