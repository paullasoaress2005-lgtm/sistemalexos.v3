import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { FALLBACK_WORKSPACE_ID, getInitialClients, listClients, listClientsAsync } from "./clients";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "./source";
import { logPartnershipActivity } from "@/lib/data/activityLogs";
import { getInitialProcesses, listProcesses, listProcessesAsync } from "./processes";

export type PartnershipType =
  | "indicacao_recebida"
  | "indicacao_enviada"
  | "atuacao_conjunta"
  | "correspondente"
  | "substabelecimento"
  | "exito_compartilhado"
  | "apoio_audiencia"
  | "producao_peca"
  | "outro";

export type PartnershipStatus =
  | "em_negociacao"
  | "ativa"
  | "aguardando_documento"
  | "aguardando_repasse"
  | "em_execucao"
  | "concluida"
  | "suspensa"
  | "encerrada"
  | "arquivada";

export type PartnershipFeeModel = "percentual" | "valor_fixo" | "exito" | "mensal" | "sem_repasse_definido" | "outro";
export type PartnershipRepasseStatus = "sem_repasse_definido" | "sem_repasse_registrado" | "repasse_pendente" | "repasse_parcial" | "repasse_pago";
export type PartnershipDataMode = "demo_local" | "supabase_ready";

export type ProcessPartnership = {
  id: string;
  workspace_id: string;
  partner_name: string;
  partner_firm: string;
  partner_email?: string;
  partner_phone?: string;
  partner_oab?: string;
  client_id?: string;
  client_name?: string;
  process_id?: string;
  process_number?: string;
  partnership_type: PartnershipType;
  status: PartnershipStatus;
  fee_model: PartnershipFeeModel;
  fee_percentage?: number;
  fixed_amount?: number;
  expected_amount?: number;
  paid_amount?: number;
  repasse_status: PartnershipRepasseStatus;
  internal_responsible: string;
  external_responsible: string;
  start_date?: string;
  expected_end_date?: string;
  next_action: string;
  main_pending: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
};

export type PartnershipInput = Omit<ProcessPartnership, "id" | "workspace_id" | "created_at" | "updated_at" | "archived_at">;

export type PartnershipFilters = {
  status?: PartnershipStatus | "todos";
  type?: PartnershipType | "todos";
  partner?: string;
  clientId?: string;
  processId?: string;
  internalResponsible?: string | "todos";
  feeModel?: PartnershipFeeModel | "todos";
  query?: string;
  includeArchived?: boolean;
};

const PARTNERSHIPS_STORAGE_PREFIX = "lexos.control.demo.partnerships";
export const PARTNERSHIPS_UPDATED_EVENT = "lexos:partnerships-updated";
export const PARTNERSHIP_DATA_MODE: PartnershipDataMode = "demo_local";
export const PARTNERSHIP_DATA_MODE_LABEL =
  "Modo demonstração: parcerias salvas localmente no navegador, sem pagamento real ou sincronização externa.";

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${PARTNERSHIPS_STORAGE_PREFIX}.${workspaceId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `partnership-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPartnership(value: unknown): value is ProcessPartnership {
  if (!value || typeof value !== "object") return false;
  const partnership = value as Partial<ProcessPartnership>;
  return Boolean(partnership.id && partnership.workspace_id && partnership.partner_name && partnership.partner_firm && partnership.status);
}

function resolveRepasseStatus(partnership: Pick<ProcessPartnership, "fee_model" | "expected_amount" | "paid_amount"> & { repasse_status?: PartnershipRepasseStatus }): PartnershipRepasseStatus {
  if (partnership.repasse_status) return partnership.repasse_status;
  if (partnership.fee_model === "sem_repasse_definido" || !partnership.expected_amount) return "sem_repasse_definido";
  const paid = partnership.paid_amount ?? 0;
  if (paid <= 0) return "sem_repasse_registrado";
  if (paid >= partnership.expected_amount) return "repasse_pago";
  return "repasse_parcial";
}

export function calculateRepasseStatus(input: Pick<ProcessPartnership, "fee_model" | "expected_amount" | "paid_amount">): PartnershipRepasseStatus {
  if (input.fee_model === "sem_repasse_definido" || !input.expected_amount) return "sem_repasse_definido";
  const paid = input.paid_amount ?? 0;
  if (paid <= 0) return "sem_repasse_registrado";
  if (paid >= input.expected_amount) return "repasse_pago";
  return "repasse_parcial";
}

function normalizePartnership(partnership: ProcessPartnership): ProcessPartnership {
  return { ...partnership, repasse_status: resolveRepasseStatus(partnership) };
}

function safeParsePartnerships(raw: string | null): ProcessPartnership[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isPartnership).map(normalizePartnership);
  } catch {
    return null;
  }
}

function persistPartnerships(partnerships: ProcessPartnership[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(partnerships));
  window.dispatchEvent(new CustomEvent(PARTNERSHIPS_UPDATED_EVENT, { detail: { workspaceId } }));
}

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

export function getInitialPartnerships(workspaceId = FALLBACK_WORKSPACE_ID): ProcessPartnership[] {
  const clients = getInitialClients(workspaceId);
  const processes = getInitialProcesses(workspaceId);
  const apex = clients[0];
  const villa = clients[1] ?? clients[0];
  const delta = clients[3] ?? clients[0];
  const apexProcess = processes.find((process) => process.client_id === apex?.id) ?? processes[0];
  const villaProcess = processes.find((process) => process.client_id === villa?.id) ?? processes[1];
  const deltaProcess = processes.find((process) => process.client_id === delta?.id) ?? processes[3] ?? processes[0];

  return [
    {
      id: "partnership-demo-1",
      workspace_id: workspaceId,
      partner_name: "Dra. Marina Duarte",
      partner_firm: "Duarte & Pinheiro Correspondência Jurídica Demo",
      partner_email: "marina.demo@exemplo.test",
      partner_phone: "+55 11 90000-0001",
      partner_oab: "OAB/SP 000.111-D",
      client_id: apex?.id,
      client_name: apex?.name,
      process_id: apexProcess?.id,
      process_number: apexProcess?.number,
      partnership_type: "apoio_audiencia",
      status: "ativa",
      fee_model: "valor_fixo",
      fixed_amount: 2800,
      expected_amount: 2800,
      paid_amount: 900,
      repasse_status: "repasse_parcial",
      internal_responsible: "Dra. Helena Moraes",
      external_responsible: "Dra. Marina Duarte",
      start_date: "2026-05-03",
      expected_end_date: "2026-05-22",
      next_action: "Confirmar pauta e documentos de audiência com a correspondente.",
      main_pending: "Checklist de documentos do preposto demonstrativo.",
      notes: "Registro fictício para demonstrar controle de correspondente em audiência, sem contratação real.",
      created_at: "2026-05-03T10:00:00.000Z",
      updated_at: "2026-05-10T11:00:00.000Z",
    },
    {
      id: "partnership-demo-2",
      workspace_id: workspaceId,
      partner_name: "Dr. Renato Salles",
      partner_firm: "Salles Advocacia Empresarial Demo",
      partner_email: "renato.demo@exemplo.test",
      partner_phone: "+55 11 90000-0002",
      partner_oab: "OAB/SP 000.222-D",
      client_id: villa?.id,
      client_name: villa?.name,
      process_id: villaProcess?.id,
      process_number: villaProcess?.number,
      partnership_type: "atuacao_conjunta",
      status: "em_negociacao",
      fee_model: "percentual",
      fee_percentage: 20,
      expected_amount: 18000,
      paid_amount: 0,
      repasse_status: "sem_repasse_registrado",
      internal_responsible: "Dr. Bruno Brito",
      external_responsible: "Dr. Renato Salles",
      start_date: "2026-05-06",
      expected_end_date: "2026-06-20",
      next_action: "Validar minuta de divisão de responsabilidades antes do aceite.",
      main_pending: "Formalização da proposta de atuação conjunta.",
      notes: "Cenário demonstrativo de parceria com divisão percentual futura, sem repasse financeiro real.",
      created_at: "2026-05-06T14:20:00.000Z",
      updated_at: "2026-05-12T09:20:00.000Z",
    },
    {
      id: "partnership-demo-3",
      workspace_id: workspaceId,
      partner_name: "Dra. Camila Nogueira",
      partner_firm: "Nogueira Pareceres Demo",
      partner_email: "camila.demo@exemplo.test",
      partner_phone: "+55 11 90000-0003",
      partner_oab: "OAB/RJ 000.333-D",
      client_id: delta?.id,
      client_name: delta?.name,
      process_id: deltaProcess?.id,
      process_number: deltaProcess?.number,
      partnership_type: "producao_peca",
      status: "aguardando_repasse",
      fee_model: "valor_fixo",
      fixed_amount: 5200,
      expected_amount: 5200,
      paid_amount: 2600,
      repasse_status: "repasse_parcial",
      internal_responsible: "Dra. Camila Rocha",
      external_responsible: "Dra. Camila Nogueira",
      start_date: "2026-04-28",
      expected_end_date: "2026-05-18",
      next_action: "Registrar repasse demonstrativo após validação interna.",
      main_pending: "Repasse parcial pendente de conferência.",
      notes: "Controle local de apoio em peça regulatória. Não gera recibo, pagamento ou obrigação real.",
      created_at: "2026-04-28T16:00:00.000Z",
      updated_at: "2026-05-13T15:40:00.000Z",
    },
  ];
}

export function listPartnerships(workspaceId = FALLBACK_WORKSPACE_ID, filters: PartnershipFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  const stored = isBrowser() ? safeParsePartnerships(window.localStorage.getItem(storageKey(workspaceId))) : null;
  const source = stored?.length ? stored : getInitialPartnerships(workspaceId);
  const query = normalize(filters.query);
  const partner = normalize(filters.partner);

  return source
    .filter((partnership) => {
      if (filters.status && filters.status !== "todos") {
        if (filters.status === "aguardando_repasse") return partnership.status === "aguardando_repasse" || ["repasse_pendente", "repasse_parcial"].includes(partnership.repasse_status);
        if (filters.status === "ativa") return ["ativa", "em_execucao"].includes(partnership.status);
        return partnership.status === filters.status;
      }
      return filters.includeArchived ? true : partnership.status !== "arquivada";
    })
    .filter((partnership) => (filters.type && filters.type !== "todos" ? partnership.partnership_type === filters.type : true))
    .filter((partnership) => (filters.clientId ? partnership.client_id === filters.clientId : true))
    .filter((partnership) => (filters.processId ? partnership.process_id === filters.processId : true))
    .filter((partnership) => (filters.internalResponsible && filters.internalResponsible !== "todos" ? partnership.internal_responsible === filters.internalResponsible : true))
    .filter((partnership) => (filters.feeModel && filters.feeModel !== "todos" ? partnership.fee_model === filters.feeModel : true))
    .filter((partnership) => (partner ? normalize(`${partnership.partner_name} ${partnership.partner_firm}`).includes(partner) : true))
    .filter((partnership) => {
      if (!query) return true;
      return [
        partnership.partner_name,
        partnership.partner_firm,
        partnership.client_name,
        partnership.process_number,
        partnership.status,
        partnership.partnership_type,
        partnership.internal_responsible,
        partnership.external_responsible,
        partnership.main_pending,
        partnership.next_action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getPartnershipById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPartnerships(workspaceId, { includeArchived: true }).find((partnership) => partnership.id === id) ?? null;
}

export function createPartnership(input: PartnershipInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Parcerias reais ainda não possuem tabela ativa neste estágio.");
  const timestamp = nowIso();
  const partnership: ProcessPartnership = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    paid_amount: input.paid_amount ?? 0,
    repasse_status: calculateRepasseStatus(input),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: input.status === "arquivada" ? timestamp : undefined,
  };
  persistPartnerships([partnership, ...listPartnerships(workspaceId, { includeArchived: true })], workspaceId);
  return partnership;
}

export function updatePartnership(id: string, input: Partial<PartnershipInput>, workspaceId = FALLBACK_WORKSPACE_ID): ProcessPartnership | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: ProcessPartnership | null = null;
  const timestamp = nowIso();
  const next = listPartnerships(workspaceId, { includeArchived: true }).map((partnership) => {
    if (partnership.id !== id) return partnership;
    const status = input.status ?? partnership.status;
    updated = {
      ...partnership,
      ...input,
      updated_at: timestamp,
      archived_at: status === "arquivada" ? partnership.archived_at ?? timestamp : undefined,
    };
    return updated;
  });
  persistPartnerships(next, workspaceId);
  return updated;
}

export function archivePartnership(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updatePartnership(id, { status: "arquivada" }, workspaceId);
}

export function registerDemoPartnershipTransfer(id: string, amount: number, workspaceId = FALLBACK_WORKSPACE_ID) {
  const current = getPartnershipById(id, workspaceId);
  if (!current) return null;
  const paidAmount = Math.max(0, amount);
  return updatePartnership(id, { paid_amount: paidAmount, repasse_status: calculateRepasseStatus({ ...current, paid_amount: paidAmount }) }, workspaceId);
}

export function listPartnershipsByClientId(clientId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPartnerships(workspaceId, { includeArchived: true, clientId });
}

export function listPartnershipsByProcessId(processId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPartnerships(workspaceId, { includeArchived: true, processId });
}

export function getPartnershipStats(workspaceId = FALLBACK_WORKSPACE_ID) {
  const partnerships = listPartnerships(workspaceId, { includeArchived: true });
  return {
    ativa: partnerships.filter((item) => ["ativa", "em_execucao"].includes(item.status)).length,
    em_negociacao: partnerships.filter((item) => item.status === "em_negociacao").length,
    aguardando_documento: partnerships.filter((item) => item.status === "aguardando_documento").length,
    aguardando_repasse: partnerships.filter((item) => item.status === "aguardando_repasse" || ["repasse_pendente", "repasse_parcial"].includes(item.repasse_status)).length,
    concluida: partnerships.filter((item) => item.status === "concluida").length,
    arquivada: partnerships.filter((item) => item.status === "arquivada").length,
  };
}

export function getPartnershipClientOptions(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) return [];
  return listClients(workspaceId).map((client) => ({ id: client.id, name: client.name }));
}

export function getPartnershipProcessOptions(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) return [];
  return listProcesses(workspaceId, { includeArchived: true }).map((process) => ({ id: process.id, number: process.number, client_id: process.client_id, client_name: process.client_name, title: process.title }));
}

export function getLocalPartnershipSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPartnerships(workspaceId, { includeArchived: true }).map((partnership) => ({
    type: "Parcerias",
    title: `${partnership.partner_name} • ${partnership.partner_firm}`,
    description: `${partnership.client_name ?? "Sem cliente"} • ${partnership.process_number ?? "Sem processo"} • ${partnership.status} • repasse ${partnership.repasse_status} • ${partnership.next_action}`,
    route: `/processos/parcerias?partnershipId=${partnership.id}`,
    action: "Abrir parceria",
  }));
}


export const PARTNERSHIP_REAL_DATA_MODE_LABEL =
  shouldUseWorkspaceSupabase()
    ? "Ambiente conectado: parcerias processuais carregadas exclusivamente do escritório."
    : PARTNERSHIP_DATA_MODE_LABEL;

type SupabasePartnershipRow = {
  id: string;
  workspace_id: string;
  process_id: string | null;
  partner_name: string;
  partner_type: string | null;
  status: string | null;
  fee_model: string | null;
  fee_percentage: number | null;
  expected_transfer_value: number | null;
  transferred_value: number | null;
  transfer_status: string | null;
  responsible: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  processes?: { process_number?: string | null; client_id?: string | null; clients?: { name?: string | null } | Array<{ name?: string | null }> | null } | Array<{ process_number?: string | null; client_id?: string | null; clients?: { name?: string | null } | Array<{ name?: string | null }> | null }> | null;
};

const PARTNERSHIP_SELECT = "id, workspace_id, process_id, partner_name, partner_type, status, fee_model, fee_percentage, expected_transfer_value, transferred_value, transfer_status, responsible, notes, metadata, created_at, updated_at, archived_at, processes(process_number, client_id, clients(name))";

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function normalizePartnershipType(value: string | null | undefined): PartnershipType {
  const allowed = new Set<PartnershipType>(["indicacao_recebida", "indicacao_enviada", "atuacao_conjunta", "correspondente", "substabelecimento", "exito_compartilhado", "apoio_audiencia", "producao_peca", "outro"]);
  return allowed.has((value || "") as PartnershipType) ? (value as PartnershipType) : "atuacao_conjunta";
}

function normalizePartnershipStatus(value: string | null | undefined, archivedAt?: string | null): PartnershipStatus {
  if (archivedAt) return "arquivada";
  if (value === "negotiation") return "em_negociacao";
  if (value === "active") return "ativa";
  const allowed = new Set<PartnershipStatus>(["em_negociacao", "ativa", "aguardando_documento", "aguardando_repasse", "em_execucao", "concluida", "suspensa", "encerrada", "arquivada"]);
  return allowed.has((value || "") as PartnershipStatus) ? (value as PartnershipStatus) : "em_negociacao";
}

function normalizeFeeModel(value: string | null | undefined): PartnershipFeeModel {
  const allowed = new Set<PartnershipFeeModel>(["percentual", "valor_fixo", "exito", "mensal", "sem_repasse_definido", "outro"]);
  return allowed.has((value || "") as PartnershipFeeModel) ? (value as PartnershipFeeModel) : "sem_repasse_definido";
}

function normalizeRepasseStatus(value: string | null | undefined): PartnershipRepasseStatus {
  const allowed = new Set<PartnershipRepasseStatus>(["sem_repasse_definido", "sem_repasse_registrado", "repasse_pendente", "repasse_parcial", "repasse_pago"]);
  return allowed.has((value || "") as PartnershipRepasseStatus) ? (value as PartnershipRepasseStatus) : "sem_repasse_definido";
}

function relatedProcess(row: SupabasePartnershipRow) {
  return Array.isArray(row.processes) ? row.processes[0] : row.processes;
}

function relatedProcessClientName(row: SupabasePartnershipRow) {
  const process = relatedProcess(row);
  const related = Array.isArray(process?.clients) ? process?.clients[0] : process?.clients;
  return related?.name || metadataText(row.metadata, "client_name");
}

function fromSupabasePartnership(row: SupabasePartnershipRow): ProcessPartnership {
  const metadata = row.metadata || {};
  const timestamp = row.updated_at || row.created_at || nowIso();
  const process = relatedProcess(row);
  const item: ProcessPartnership = {
    id: row.id,
    workspace_id: row.workspace_id,
    partner_name: row.partner_name,
    partner_firm: metadataText(metadata, "partner_firm"),
    partner_email: metadataText(metadata, "partner_email"),
    partner_phone: metadataText(metadata, "partner_phone"),
    partner_oab: metadataText(metadata, "partner_oab"),
    client_id: process?.client_id || metadataText(metadata, "client_id"),
    client_name: relatedProcessClientName(row),
    process_id: row.process_id || "",
    process_number: process?.process_number || metadataText(metadata, "process_number"),
    partnership_type: normalizePartnershipType(row.partner_type),
    status: normalizePartnershipStatus(row.status, row.archived_at),
    fee_model: normalizeFeeModel(row.fee_model),
    fee_percentage: row.fee_percentage ?? undefined,
    fixed_amount: metadataNumber(metadata, "fixed_amount"),
    expected_amount: row.expected_transfer_value ?? undefined,
    paid_amount: row.transferred_value ?? 0,
    repasse_status: normalizeRepasseStatus(row.transfer_status),
    internal_responsible: row.responsible || "",
    external_responsible: metadataText(metadata, "external_responsible"),
    start_date: metadataText(metadata, "start_date"),
    expected_end_date: metadataText(metadata, "expected_end_date"),
    next_action: metadataText(metadata, "next_action"),
    main_pending: metadataText(metadata, "main_pending"),
    notes: row.notes || "",
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
    archived_at: row.archived_at || undefined,
  };
  return normalizePartnership(item);
}

function toSupabasePartnership(input: Partial<PartnershipInput>, workspaceId: string) {
  return {
    workspace_id: workspaceId,
    process_id: input.process_id || null,
    partner_name: input.partner_name || "",
    partner_type: input.partnership_type || null,
    status: input.status || "em_negociacao",
    fee_model: input.fee_model || null,
    fee_percentage: input.fee_percentage ?? null,
    expected_transfer_value: input.expected_amount ?? null,
    transferred_value: input.paid_amount ?? 0,
    transfer_status: input.repasse_status || calculateRepasseStatus({ fee_model: input.fee_model || "sem_repasse_definido", expected_amount: input.expected_amount, paid_amount: input.paid_amount }),
    responsible: input.internal_responsible || null,
    notes: input.notes || null,
    archived_at: input.status === "arquivada" ? nowIso() : null,
    metadata: {
      partner_firm: input.partner_firm || "",
      partner_email: input.partner_email || "",
      partner_phone: input.partner_phone || "",
      partner_oab: input.partner_oab || "",
      client_id: input.client_id || "",
      client_name: input.client_name || "",
      process_number: input.process_number || "",
      fixed_amount: input.fixed_amount,
      external_responsible: input.external_responsible || "",
      start_date: input.start_date || "",
      expected_end_date: input.expected_end_date || "",
      next_action: input.next_action || "",
      main_pending: input.main_pending || "",
    },
  };
}

function filterPartnershipRows(rows: ProcessPartnership[], filters: PartnershipFilters = {}) {
  const query = normalize(filters.query);
  const partner = normalize(filters.partner);
  return rows
    .filter((partnership) => {
      if (filters.status && filters.status !== "todos") return partnership.status === filters.status;
      return filters.includeArchived ? true : partnership.status !== "arquivada";
    })
    .filter((partnership) => (filters.type && filters.type !== "todos" ? partnership.partnership_type === filters.type : true))
    .filter((partnership) => (filters.clientId ? partnership.client_id === filters.clientId : true))
    .filter((partnership) => (filters.processId ? partnership.process_id === filters.processId : true))
    .filter((partnership) => (filters.internalResponsible && filters.internalResponsible !== "todos" ? partnership.internal_responsible === filters.internalResponsible : true))
    .filter((partnership) => (filters.feeModel && filters.feeModel !== "todos" ? partnership.fee_model === filters.feeModel : true))
    .filter((partnership) => (partner ? normalize(`${partnership.partner_name} ${partnership.partner_firm}`).includes(partner) : true))
    .filter((partnership) => {
      if (!query) return true;
      return [partnership.partner_name, partnership.partner_firm, partnership.client_name, partnership.process_number, partnership.status, partnership.partnership_type, partnership.internal_responsible, partnership.external_responsible, partnership.main_pending, partnership.next_action].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function recordPartnershipActivity(workspaceId: string, action: string, entityId: string, description: string) {
  await logPartnershipActivity({
    workspaceId,
    action,
    entityId,
    description,
  });
}

export async function listPartnershipsAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: PartnershipFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listPartnerships(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await (supabase as any).from("process_partnerships").select(PARTNERSHIP_SELECT).eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) throw error;
    return filterPartnershipRows(((data || []) as SupabasePartnershipRow[]).map(fromSupabasePartnership), filters);
  } catch (error) {
    warnSupabaseOperationalError("Parcerias processuais", error);
    return [];
  }
}

export async function getPartnershipByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getPartnershipById(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await (supabase as any).from("process_partnerships").select(PARTNERSHIP_SELECT).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromSupabasePartnership(data as SupabasePartnershipRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Parcerias processuais", error);
    return null;
  }
}

function emptyPartnershipInput(): PartnershipInput {
  return { partner_name: "", partner_firm: "", partner_email: "", partner_phone: "", partner_oab: "", client_id: "", client_name: "", process_id: "", process_number: "", partnership_type: "atuacao_conjunta", status: "em_negociacao", fee_model: "sem_repasse_definido", fee_percentage: undefined, fixed_amount: undefined, expected_amount: undefined, paid_amount: 0, repasse_status: "sem_repasse_definido", internal_responsible: "", external_responsible: "", start_date: "", expected_end_date: "", next_action: "", main_pending: "", notes: "" };
}

function toPartnershipInput(item: ProcessPartnership): PartnershipInput {
  const { id: _id, workspace_id: _workspaceId, created_at: _createdAt, updated_at: _updatedAt, archived_at: _archivedAt, ...input } = item;
  return input;
}

export async function createPartnershipAsync(input: PartnershipInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return createPartnership(input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar parceria real.");
  try {
    const { data, error } = await (supabase as any).from("process_partnerships").insert(toSupabasePartnership(input, workspaceId)).select(PARTNERSHIP_SELECT).single();
    if (error) throw error;
    const partnership = fromSupabasePartnership(data as SupabasePartnershipRow);
    await recordPartnershipActivity(workspaceId, "partnership_created", partnership.id, `Parceria ${partnership.partner_name} criada.`);
    return partnership;
  } catch (error) {
    warnSupabaseOperationalError("Parcerias processuais", error);
    throw error;
  }
}

export async function updatePartnershipAsync(id: string, input: Partial<PartnershipInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return updatePartnership(id, input, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar parceria real.");
  try {
    const current = await getPartnershipByIdAsync(id, workspaceId);
    const payload = toSupabasePartnership({ ...(current ? toPartnershipInput(current) : emptyPartnershipInput()), ...input }, workspaceId);
    const { data, error } = await (supabase as any).from("process_partnerships").update(payload).eq("workspace_id", workspaceId).eq("id", id).select(PARTNERSHIP_SELECT).single();
    if (error) throw error;
    const partnership = fromSupabasePartnership(data as SupabasePartnershipRow);
    await recordPartnershipActivity(workspaceId, partnership.status === "arquivada" ? "partnership_archived" : current && current.repasse_status !== partnership.repasse_status ? "partnership_transfer_updated" : "partnership_updated", partnership.id, `Parceria ${partnership.partner_name} atualizada.`);
    return partnership;
  } catch (error) {
    warnSupabaseOperationalError("Parcerias processuais", error);
    throw error;
  }
}

export async function archivePartnershipAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updatePartnershipAsync(id, { status: "arquivada" }, workspaceId);
}

export async function registerPartnershipTransferAsync(id: string, amount: number, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return registerDemoPartnershipTransfer(id, amount, workspaceId);
  const current = await getPartnershipByIdAsync(id, workspaceId);
  if (!current) return null;
  const paidAmount = Math.max(0, amount);
  return updatePartnershipAsync(id, { paid_amount: paidAmount, repasse_status: calculateRepasseStatus({ ...current, paid_amount: paidAmount }) }, workspaceId);
}

export async function getPartnershipClientOptionsAsync(workspaceId = FALLBACK_WORKSPACE_ID) {
  const clients = await listClientsAsync(workspaceId);
  return clients.map((client) => ({ id: client.id, name: client.name }));
}

export async function getPartnershipProcessOptionsAsync(workspaceId = FALLBACK_WORKSPACE_ID) {
  const processes = await listProcessesAsync(workspaceId, { includeArchived: true });
  return processes.map((process) => ({ id: process.id, number: process.number, client_id: process.client_id, client_name: process.client_name, title: process.title }));
}
