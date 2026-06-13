import { clientPortfolio } from "@/data/mock";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { getDataSource, shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logClientActivity } from "@/lib/data/activityLogs";

export type ClientType = "pessoa_fisica" | "pessoa_juridica";
export type ClientStatus = "ativo" | "atenção" | "inativo" | "prospect";
export type ClientDataMode = "demo_local" | "supabase_ready" | "hybrid";

export type Client = {
  id: string;
  workspace_id: string;
  name: string;
  type: ClientType;
  document: string;
  email: string;
  phone: string;
  status: ClientStatus;
  owner: string;
  segment: string;
  main_pending: string;
  last_contact_at: string;
  next_action: string;
  notes: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientInput = Omit<
  Client,
  "id" | "workspace_id" | "created_at" | "updated_at" | "last_contact_at"
> & {
  last_contact_at?: string;
};

export type ClientFilters = {
  status?: ClientStatus | "todos";
  query?: string;
  includeArchived?: boolean;
};

const DEMO_CLIENTS_STORAGE_PREFIX = "lexos.control.demo.clients";
export const CLIENT_DATA_MODE: ClientDataMode = getDataSource() === "supabase" ? "supabase_ready" : getDataSource() === "hybrid" ? "hybrid" : "demo_local";
export const CLIENT_DATA_MODE_LABEL =
  getDataSource() === "supabase"
    ? "Ambiente conectado: clientes carregados exclusivamente do escritório; demonstração local separada."
    : getDataSource() === "hybrid"
      ? "Ambiente assistido: usa dados do escritório quando disponíveis e mantém demonstração local separada."
      : "Modo demonstração: clientes salvos localmente no navegador, sem sincronização real.";
export const FALLBACK_WORKSPACE_ID = "workspace-demo-moraes-brito";
export const CLIENTS_UPDATED_EVENT = "lexos:clients-updated";

const initialClients: Client[] = clientPortfolio.map((client, index) => {
  const isCompany = ["empresa", "prospect"].includes(client.type);
  const now = `2026-05-${String(8 - index).padStart(2, "0")}T12:00:00.000Z`;

  return {
    id: `client-demo-${index + 1}`,
    workspace_id: FALLBACK_WORKSPACE_ID,
    name: client.name,
    type: isCompany ? "pessoa_juridica" : "pessoa_fisica",
    document: isCompany
      ? [`12.345.678/0001-90`, `34.210.987/0001-55`, `45.901.222/0001-13`][index % 3]
      : [`123.456.789-10`, `987.654.321-00`][index % 2],
    email: `${client.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")}@exemplo.demo`,
    phone: ["(11) 98888-0101", "(21) 97777-0202", "(31) 96666-0303"][index % 3],
    status: mapLegacyStatus(client.status),
    owner: client.owner,
    segment: isCompany ? client.linkedCase : "Pessoa física / consultivo",
    main_pending: client.pending,
    last_contact_at: now,
    next_action: client.suggestedAction,
    notes: `Registro demonstrativo importado do mock premium. Processo/contrato vinculado: ${client.linkedCase}.`,
    archived_at: null,
    created_at: `2026-05-${String(1 + index).padStart(2, "0")}T09:00:00.000Z`,
    updated_at: now,
  };
});

function mapLegacyStatus(status: string): ClientStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes("triagem")) return "prospect";
  if (normalized.includes("documento") || normalized.includes("prioritário")) {
    return "atenção";
  }
  if (normalized.includes("inativo")) return "inativo";
  return "ativo";
}

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${DEMO_CLIENTS_STORAGE_PREFIX}.${workspaceId}`;
}

function safeParseClients(raw: string | null): Client[] | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isClient);
  } catch {
    return null;
  }
}

function isClient(value: unknown): value is Client {
  if (!value || typeof value !== "object") return false;
  const client = value as Partial<Client>;
  return Boolean(client.id && client.workspace_id && client.name && client.status);
}

function persistClients(clients: Client[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(clients));
  window.dispatchEvent(new CustomEvent(CLIENTS_UPDATED_EVENT, { detail: { workspaceId } }));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getInitialClients(workspaceId = FALLBACK_WORKSPACE_ID): Client[] {
  return initialClients.map((client) => ({ ...client, workspace_id: workspaceId }));
}

function getClientSource(workspaceId = FALLBACK_WORKSPACE_ID) {
  const stored = isBrowser() ? safeParseClients(window.localStorage.getItem(storageKey(workspaceId))) : null;
  return stored ?? getInitialClients(workspaceId);
}

export function listClients(workspaceId = FALLBACK_WORKSPACE_ID, filters: ClientFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  const source = getClientSource(workspaceId);
  const query = filters.query?.trim().toLowerCase();

  return source
    .filter((client) => (filters.includeArchived ? true : !client.archived_at && client.status !== "inativo"))
    .filter((client: Client) => {
      if (filters.status === "inativo") return client.status === "inativo" || Boolean(client.archived_at);
      return filters.status && filters.status !== "todos" ? client.status === filters.status && !client.archived_at : true;
    })
    .filter((client) => {
      if (!query) return true;
      return [client.name, client.document, client.owner, client.main_pending, client.segment]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getClientById(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listClients(workspaceId, { includeArchived: true }).find((client) => client.id === id) ?? null;
}

export function createClient(input: ClientInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (shouldUseWorkspaceSupabase()) throw new Error("Clientes reais devem ser criados via Supabase.");
  const timestamp = nowIso();
  const client: Client = {
    ...input,
    id: makeId(),
    workspace_id: workspaceId,
    last_contact_at: input.last_contact_at || timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const nextClients = [client, ...getClientSource(workspaceId)];
  persistClients(nextClients, workspaceId);
  return client;
}

export function updateClient(id: string, input: Partial<ClientInput>, workspaceId = FALLBACK_WORKSPACE_ID): Client | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let updated: Client | null = null;
  const nextClients = getClientSource(workspaceId).map((client) => {
    if (client.id !== id) return client;
    updated = {
      ...client,
      ...input,
      last_contact_at: input.last_contact_at ?? client.last_contact_at,
      updated_at: nowIso(),
    };
    return updated;
  });
  persistClients(nextClients, workspaceId);
  return updated;
}

export function archiveClient(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Client | null {
  if (shouldUseWorkspaceSupabase()) return null;
  let archived: Client | null = null;
  const timestamp = nowIso();
  const nextClients = getClientSource(workspaceId).map((client) => {
    if (client.id !== id) return client;
    archived = { ...client, status: "inativo", archived_at: timestamp, updated_at: timestamp };
    return archived;
  });
  persistClients(nextClients, workspaceId);
  return archived;
}

export function removeClient(id: string, workspaceId = FALLBACK_WORKSPACE_ID): Client | null {
  return archiveClient(id, workspaceId);
}

export function getClientStats(workspaceId = FALLBACK_WORKSPACE_ID) {
  const clients = listClients(workspaceId);
  const allClients = listClients(workspaceId, { includeArchived: true });
  const totalActive = clients.filter((client) => client.status === "ativo").length;
  const attention = clients.filter((client) => client.status === "atenção").length;
  const prospects = clients.filter((client) => client.status === "prospect").length;
  const inactive = allClients.filter((client) => client.status === "inativo" || Boolean(client.archived_at)).length;

  return [
    { label: "Clientes ativos", value: String(totalActive), detail: "carteira em acompanhamento", tone: "positive" },
    { label: "Em atenção", value: String(attention), detail: "pendências bloqueando avanço", tone: "warning" },
    { label: "Prospects", value: String(prospects), detail: "triagem comercial/jurídica", tone: "premium" },
    { label: "Inativos", value: String(inactive), detail: "arquivados na demonstração", tone: "neutral" },
  ];
}

export async function getClients() {
  return getInitialClients();
}

export function getLocalClientSearchResults(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listClients(workspaceId).map((client) => ({
    type: "Clientes",
    title: client.name,
    description: `${client.status} • ${client.main_pending} • responsável ${client.owner}`,
    route: `/clientes?clientId=${client.id}`,
    action: "Abrir cliente",
  }));
}


type SupabaseClientRow = {
  id: string;
  workspace_id: string;
  name: string;
  type: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  owner: string | null;
  segment: string | null;
  pending: string | null;
  next_action: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeClientType(type: string | null | undefined): ClientType {
  return type === "pessoa_fisica" ? "pessoa_fisica" : "pessoa_juridica";
}

function normalizeClientStatus(status: string | null | undefined): ClientStatus {
  if (status === "ativo" || status === "atenção" || status === "inativo" || status === "prospect") return status;
  if (status === "active") return "ativo";
  return "ativo";
}

function fromSupabaseClient(row: SupabaseClientRow): Client {
  const timestamp = row.updated_at || row.created_at || nowIso();
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    type: normalizeClientType(row.type),
    document: row.document || "",
    email: row.email || "",
    phone: row.phone || "",
    status: normalizeClientStatus(row.status),
    owner: row.owner || "",
    segment: row.segment || "",
    main_pending: row.pending || "",
    last_contact_at: timestamp,
    next_action: row.next_action || "",
    notes: row.notes || "",
    archived_at: row.archived_at,
    created_at: row.created_at || timestamp,
    updated_at: timestamp,
  };
}

function toSupabaseClient(input: ClientInput, workspaceId: string) {
  return {
    workspace_id: workspaceId,
    name: input.name,
    type: input.type,
    document: input.document,
    email: input.email,
    phone: input.phone,
    status: input.status,
    owner: input.owner,
    segment: input.segment,
    pending: input.main_pending,
    next_action: input.next_action,
    notes: input.notes,
    archived_at: null,
  };
}

function shouldTrySupabaseClients() {
  return shouldUseWorkspaceSupabase();
}

function warnClientFallback(error: unknown) {
  warnSupabaseOperationalError("Clientes", error);
}

export async function listClientsAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: ClientFilters = {}) {
  if (!shouldTrySupabaseClients()) return listClients(workspaceId, filters);

  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("clients")
      .select("id, workspace_id, name, type, document, email, phone, status, owner, segment, pending, next_action, notes, archived_at, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    const rows: Client[] = ((data || []) as SupabaseClientRow[]).map((row) => fromSupabaseClient(row));
    const query = filters.query?.trim().toLowerCase();
    return rows
      .filter((client) => (filters.includeArchived ? true : !client.archived_at && client.status !== "inativo"))
      .filter((client) => {
        if (filters.status === "inativo") return client.status === "inativo" || Boolean(client.archived_at);
        return filters.status && filters.status !== "todos" ? client.status === filters.status && !client.archived_at : true;
      })
      .filter((client: Client) => {
        if (!query) return true;
        return [client.name, client.document, client.owner, client.main_pending, client.segment]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  } catch (error) {
    warnClientFallback(error);
    return [];
  }
}

export async function getClientByIdAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldTrySupabaseClients()) return getClientById(id, workspaceId);

  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("clients")
      .select("id, workspace_id, name, type, document, email, phone, status, owner, segment, pending, next_action, notes, archived_at, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? fromSupabaseClient(data) : null;
  } catch (error) {
    warnClientFallback(error);
    return null;
  }
}

export async function createClientAsync(input: ClientInput, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldTrySupabaseClients()) return createClient(input, workspaceId);

  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para criar cliente real.");

  try {
    const { data, error } = await (supabase as any)
      .from("clients")
      .insert(toSupabaseClient(input, workspaceId))
      .select("id, workspace_id, name, type, document, email, phone, status, owner, segment, pending, next_action, notes, archived_at, created_at, updated_at")
      .single();

    if (error) throw error;
    const client = fromSupabaseClient(data);
    await logClientActivity({
      workspaceId,
      action: "client_created",
      entityId: client.id,
      title: client.name,
      description: `Cliente ${client.name} criado.`,
    });
    return client;
  } catch (error) {
    warnClientFallback(error);
    throw error;
  }
}

export async function updateClientAsync(id: string, input: Partial<ClientInput>, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldTrySupabaseClients()) return updateClient(id, input, workspaceId);

  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para atualizar cliente real.");

  try {
    const { data, error } = await (supabase as any)
      .from("clients")
      .update({
        name: input.name,
        type: input.type,
        document: input.document,
        email: input.email,
        phone: input.phone,
        status: input.status,
        owner: input.owner,
        segment: input.segment,
        pending: input.main_pending,
        next_action: input.next_action,
        notes: input.notes,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select("id, workspace_id, name, type, document, email, phone, status, owner, segment, pending, next_action, notes, archived_at, created_at, updated_at")
      .single();

    if (error) throw error;
    const client = fromSupabaseClient(data);
    await logClientActivity({
      workspaceId,
      action: client.status === "inativo" && client.archived_at ? "client_archived" : "client_updated",
      entityId: client.id,
      title: client.name,
      description: `Cliente ${client.name} atualizado.`,
    });
    return client;
  } catch (error) {
    warnClientFallback(error);
    throw error;
  }
}

export async function archiveClientAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldTrySupabaseClients()) return archiveClient(id, workspaceId);

  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase não disponível para arquivar cliente real.");

  try {
    const { data, error } = await (supabase as any)
      .from("clients")
      .update({ archived_at: nowIso(), status: "inativo" })
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select("id, workspace_id, name, type, document, email, phone, status, owner, segment, pending, next_action, notes, archived_at, created_at, updated_at")
      .single();

    if (error) throw error;
    const client = fromSupabaseClient(data);
    await logClientActivity({
      workspaceId,
      action: "client_archived",
      entityId: client.id,
      title: client.name,
      description: `Cliente ${client.name} arquivado.`,
    });
    return client;
  } catch (error) {
    warnClientFallback(error);
    throw error;
  }
}
