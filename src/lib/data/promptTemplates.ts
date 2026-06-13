import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { shouldUseWorkspaceSupabase, warnSupabaseOperationalError } from "@/lib/data/source";
import { logPromptActivity } from "@/lib/data/activityLogs";
import { promptTemplates as demoCentralPromptTemplates } from "./centralOperations";
import { FALLBACK_WORKSPACE_ID } from "./clients";

export type PromptTemplateStatus = "active" | "draft" | "archived";
export type PromptTemplateVisibility = "workspace" | "global" | "private";

export type PromptTemplate = {
  id: string;
  workspace_id: string | null;
  created_by?: string | null;
  title: string;
  slug?: string | null;
  description?: string | null;
  category: string;
  legal_area?: string | null;
  prompt_type: string;
  audience?: string | null;
  status: PromptTemplateStatus;
  visibility: PromptTemplateVisibility;
  current_version: number;
  prompt_body: string;
  variables: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptTemplateVersion = {
  id: string;
  prompt_template_id: string;
  workspace_id: string | null;
  created_by?: string | null;
  version_number: number;
  title: string;
  prompt_body: string;
  variables: string[];
  change_summary?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PromptTemplateFilters = {
  category?: string;
  legalArea?: string;
  promptType?: string;
  status?: PromptTemplateStatus | "all";
  search?: string;
  includeArchived?: boolean;
};

export type PromptTemplatePayload = {
  workspace_id: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  category: string;
  legal_area?: string | null;
  prompt_type: string;
  audience?: string | null;
  status?: PromptTemplateStatus;
  visibility?: Exclude<PromptTemplateVisibility, "global">;
  prompt_body: string;
  variables?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  change_summary?: string | null;
};

export type PromptTemplateUpdatePayload = Partial<Omit<PromptTemplatePayload, "workspace_id">> & {
  workspace_id: string;
  createVersion?: boolean;
};

type PromptTemplateRow = Omit<PromptTemplate, "variables" | "tags" | "metadata" | "status" | "visibility"> & {
  status: string;
  visibility: string;
  variables: unknown;
  tags: unknown;
  metadata: Record<string, unknown> | null;
};

type PromptTemplateVersionRow = Omit<PromptTemplateVersion, "variables" | "metadata"> & {
  variables: unknown;
  metadata: Record<string, unknown> | null;
};

const PROMPT_TEMPLATE_SELECT = "id, workspace_id, created_by, title, slug, description, category, legal_area, prompt_type, audience, status, visibility, current_version, prompt_body, variables, tags, metadata, archived_at, created_at, updated_at";
const PROMPT_TEMPLATE_VERSION_SELECT = "id, prompt_template_id, workspace_id, created_by, version_number, title, prompt_body, variables, change_summary, metadata, created_at";
export const PROMPT_TEMPLATES_UPDATED_EVENT = "lexos:prompt-templates-updated";
const LOCAL_PROMPT_TEMPLATES_STORAGE_PREFIX = "lexos.control.demo.prompt-templates.v1";

function isBrowser() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : String(item))).map((item) => item.trim()).filter(Boolean);
}

function normalizeStatus(value: unknown): PromptTemplateStatus {
  if (value === "draft" || value === "rascunho") return "draft";
  if (value === "archived" || value === "arquivado") return "archived";
  return "active";
}

function normalizeVisibility(value: unknown): PromptTemplateVisibility {
  if (value === "global") return "global";
  if (value === "private" || value === "privado") return "private";
  return "workspace";
}

function dispatchUpdated(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(PROMPT_TEMPLATES_UPDATED_EVENT, { detail: { workspaceId } }));
}

function fromSupabasePrompt(row: PromptTemplateRow): PromptTemplate {
  return {
    ...row,
    status: normalizeStatus(row.status),
    visibility: normalizeVisibility(row.visibility),
    variables: normalizeStringArray(row.variables),
    tags: normalizeStringArray(row.tags),
    metadata: row.metadata || {},
  };
}

function fromSupabaseVersion(row: PromptTemplateVersionRow): PromptTemplateVersion {
  return {
    ...row,
    variables: normalizeStringArray(row.variables),
    metadata: row.metadata || {},
  };
}

async function resolveCreatedBy(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function toInsertRow(payload: PromptTemplatePayload, createdBy: string | null) {
  return {
    workspace_id: payload.workspace_id,
    created_by: createdBy,
    title: payload.title.trim(),
    slug: payload.slug || slugify(payload.title),
    description: payload.description?.trim() || null,
    category: payload.category || "geral",
    legal_area: payload.legal_area?.trim() || null,
    prompt_type: payload.prompt_type || "operacional",
    audience: payload.audience?.trim() || null,
    status: payload.status ?? "active",
    visibility: payload.visibility ?? "workspace",
    current_version: 1,
    prompt_body: payload.prompt_body,
    variables: payload.variables ?? [],
    tags: payload.tags ?? [],
    metadata: payload.metadata ?? {},
    archived_at: payload.status === "archived" ? nowIso() : null,
  };
}

function localStorageKey(workspaceId = FALLBACK_WORKSPACE_ID) {
  return `${LOCAL_PROMPT_TEMPLATES_STORAGE_PREFIX}.${workspaceId}`;
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  if (!value || typeof value !== "object") return false;
  const prompt = value as Partial<PromptTemplate>;
  return Boolean(prompt.id && prompt.title && prompt.prompt_body && prompt.category && prompt.prompt_type);
}

function readLocalPrompts(workspaceId = FALLBACK_WORKSPACE_ID): PromptTemplate[] {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localStorageKey(workspaceId)) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPromptTemplate).map((prompt) => ({ ...prompt, status: normalizeStatus(prompt.status), visibility: normalizeVisibility(prompt.visibility), variables: normalizeStringArray(prompt.variables), tags: normalizeStringArray(prompt.tags), metadata: prompt.metadata || {} })) : [];
  } catch {
    return [];
  }
}

function writeLocalPrompts(prompts: PromptTemplate[], workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!isBrowser()) return;
  window.localStorage.setItem(localStorageKey(workspaceId), JSON.stringify(prompts));
  dispatchUpdated(workspaceId);
}

function demoPrompts(workspaceId = FALLBACK_WORKSPACE_ID): PromptTemplate[] {
  const timestamp = nowIso();
  return demoCentralPromptTemplates.map((template, index) => ({
    id: `demo-prompt-${template.id}`,
    workspace_id: workspaceId,
    created_by: null,
    title: template.title,
    slug: `demo-${template.id}`,
    description: template.description,
    category: ["dossie", "atendimento", "relatorio", "processo", "gestao"][index % 5],
    legal_area: "geral",
    prompt_type: index % 2 === 0 ? "dossie" : "operacional",
    audience: "Equipe demo",
    status: "active",
    visibility: "global",
    current_version: 1,
    prompt_body: `Modelo demonstrativo controlado: ${template.title}\n\nUse os dados selecionados no workspace demo para estruturar uma resposta revisável pela equipe.`,
    variables: ["cliente", "processo", "objetivo"],
    tags: ["demo", template.sourceModule.toLowerCase()],
    metadata: { demo: true, sourceTemplateId: template.id, sourceModule: template.sourceModule, purposeOptions: template.purposeOptions },
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

function applyFilters(prompts: PromptTemplate[], filters: PromptTemplateFilters = {}) {
  const search = filters.search?.trim().toLowerCase();
  return prompts
    .filter((prompt) => (filters.includeArchived ? true : prompt.status !== "archived"))
    .filter((prompt) => (filters.status && filters.status !== "all" ? prompt.status === filters.status : true))
    .filter((prompt) => (filters.category ? prompt.category === filters.category : true))
    .filter((prompt) => (filters.legalArea ? (prompt.legal_area ?? "") === filters.legalArea : true))
    .filter((prompt) => (filters.promptType ? prompt.prompt_type === filters.promptType : true))
    .filter((prompt) => {
      if (!search) return true;
      return `${prompt.title} ${prompt.description ?? ""} ${prompt.category} ${prompt.legal_area ?? ""} ${prompt.prompt_type} ${prompt.tags.join(" ")}`.toLowerCase().includes(search);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function listPromptTemplates(workspaceId = FALLBACK_WORKSPACE_ID, filters: PromptTemplateFilters = {}) {
  if (shouldUseWorkspaceSupabase()) return [];
  return applyFilters([...readLocalPrompts(workspaceId), ...demoPrompts(workspaceId)], filters);
}

export function getPromptTemplate(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPromptTemplates(workspaceId, { includeArchived: true }).find((prompt) => prompt.id === id) ?? null;
}

function getLocalActivePromptTemplates(workspaceId = FALLBACK_WORKSPACE_ID) {
  return listPromptTemplates(workspaceId, { status: "active" });
}

export function listPromptTemplateVersions(promptId: string, workspaceId = FALLBACK_WORKSPACE_ID): PromptTemplateVersion[] {
  const prompt = getPromptTemplate(promptId, workspaceId);
  if (!prompt) return [];
  return [{
    id: `demo-version-${prompt.id}-1`,
    prompt_template_id: prompt.id,
    workspace_id: prompt.workspace_id,
    created_by: null,
    version_number: prompt.current_version,
    title: prompt.title,
    prompt_body: prompt.prompt_body,
    variables: prompt.variables,
    change_summary: "Versão demonstrativa local.",
    metadata: prompt.metadata,
    created_at: prompt.created_at,
  }];
}

export async function listPromptTemplatesAsync(workspaceId = FALLBACK_WORKSPACE_ID, filters: PromptTemplateFilters = {}) {
  if (!shouldUseWorkspaceSupabase()) return listPromptTemplates(workspaceId, filters);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    let query = (supabase as any)
      .from("prompt_templates")
      .select(PROMPT_TEMPLATE_SELECT)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (!filters.includeArchived && filters.status !== "archived") query = query.neq("status", "archived");
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.legalArea) query = query.eq("legal_area", filters.legalArea);
    if (filters.promptType) query = query.eq("prompt_type", filters.promptType);

    const { data, error } = await query;
    if (error) throw error;
    return applyFilters(((data || []) as PromptTemplateRow[]).map(fromSupabasePrompt), { search: filters.search, includeArchived: true });
  } catch (error) {
    warnSupabaseOperationalError("Biblioteca de Prompts", error);
    return [];
  }
}

export async function getPromptTemplateAsync(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getPromptTemplate(id, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("prompt_templates")
      .select(PROMPT_TEMPLATE_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? fromSupabasePrompt(data as PromptTemplateRow) : null;
  } catch (error) {
    warnSupabaseOperationalError("Biblioteca de Prompts", error);
    return null;
  }
}

export async function createPromptTemplate(payload: PromptTemplatePayload) {
  const supabase = createSupabaseClient();
  if (!supabase || !shouldUseWorkspaceSupabase()) {
    const timestamp = nowIso();
    const prompt: PromptTemplate = {
      id: makeId("prompt-template"),
      workspace_id: payload.workspace_id,
      created_by: null,
      title: payload.title.trim(),
      slug: payload.slug || slugify(payload.title),
      description: payload.description || null,
      category: payload.category || "geral",
      legal_area: payload.legal_area || null,
      prompt_type: payload.prompt_type || "operacional",
      audience: payload.audience || null,
      status: payload.status ?? "active",
      visibility: payload.visibility ?? "workspace",
      current_version: 1,
      prompt_body: payload.prompt_body,
      variables: payload.variables ?? [],
      tags: payload.tags ?? [],
      metadata: payload.metadata ?? {},
      archived_at: payload.status === "archived" ? timestamp : null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    writeLocalPrompts([prompt, ...readLocalPrompts(payload.workspace_id)], payload.workspace_id);
    return prompt;
  }

  try {
    const createdBy = await resolveCreatedBy(supabase);
    const { data, error } = await (supabase as any)
      .from("prompt_templates")
      .insert(toInsertRow(payload, createdBy))
      .select(PROMPT_TEMPLATE_SELECT)
      .single();
    if (error) throw error;
    const prompt = fromSupabasePrompt(data as PromptTemplateRow);
    await createPromptTemplateVersion(prompt.id, {
      workspace_id: payload.workspace_id,
      title: prompt.title,
      prompt_body: prompt.prompt_body,
      variables: prompt.variables,
      change_summary: payload.change_summary || "Versão inicial do prompt.",
      metadata: { ...prompt.metadata, initial: true },
      version_number: 1,
    });
    await logPromptActivity({ workspaceId: payload.workspace_id, action: "prompt_created", entityId: prompt.id, title: prompt.title, description: `Prompt ${prompt.title} criado.` });
    dispatchUpdated(payload.workspace_id);
    return prompt;
  } catch (error) {
    warnSupabaseOperationalError("Biblioteca de Prompts", error);
    throw error;
  }
}

export async function updatePromptTemplate(id: string, payload: PromptTemplateUpdatePayload) {
  const supabase = createSupabaseClient();
  if (!supabase || !shouldUseWorkspaceSupabase()) {
    const current = getPromptTemplate(id, payload.workspace_id);
    if (!current) throw new Error("Prompt não encontrado no modo demonstração.");
    const shouldVersion = payload.createVersion ?? (payload.prompt_body !== undefined && payload.prompt_body !== current.prompt_body);
    const timestamp = nowIso();
    const updated: PromptTemplate = {
      ...current,
      title: payload.title?.trim() ?? current.title,
      slug: payload.slug || current.slug || slugify(payload.title ?? current.title),
      description: payload.description ?? current.description,
      category: payload.category ?? current.category,
      legal_area: payload.legal_area ?? current.legal_area,
      prompt_type: payload.prompt_type ?? current.prompt_type,
      audience: payload.audience ?? current.audience,
      status: payload.status ?? current.status,
      visibility: payload.visibility ?? current.visibility,
      current_version: shouldVersion ? current.current_version + 1 : current.current_version,
      prompt_body: payload.prompt_body ?? current.prompt_body,
      variables: payload.variables ?? current.variables,
      tags: payload.tags ?? current.tags,
      metadata: payload.metadata ?? current.metadata,
      archived_at: (payload.status ?? current.status) === "archived" ? (current.archived_at ?? timestamp) : null,
      updated_at: timestamp,
    };
    const local = readLocalPrompts(payload.workspace_id);
    const existsLocal = local.some((prompt) => prompt.id === id);
    writeLocalPrompts(existsLocal ? local.map((prompt) => prompt.id === id ? updated : prompt) : [updated, ...local], payload.workspace_id);
    return updated;
  }

  try {
    const current = await getPromptTemplateAsync(id, payload.workspace_id);
    if (!current) throw new Error("Prompt não encontrado neste workspace.");
    const shouldVersion = payload.createVersion ?? (payload.prompt_body !== undefined && payload.prompt_body !== current.prompt_body);
    const nextVersion = shouldVersion ? current.current_version + 1 : current.current_version;
    const updateRow = {
      title: payload.title?.trim() ?? current.title,
      slug: payload.slug || current.slug || slugify(payload.title ?? current.title),
      description: payload.description?.trim() || null,
      category: payload.category ?? current.category,
      legal_area: payload.legal_area?.trim() || null,
      prompt_type: payload.prompt_type ?? current.prompt_type,
      audience: payload.audience?.trim() || null,
      status: payload.status ?? current.status,
      visibility: payload.visibility ?? (current.visibility === "global" ? "workspace" : current.visibility),
      current_version: nextVersion,
      prompt_body: payload.prompt_body ?? current.prompt_body,
      variables: payload.variables ?? current.variables,
      tags: payload.tags ?? current.tags,
      metadata: payload.metadata ?? current.metadata,
      archived_at: (payload.status ?? current.status) === "archived" ? (current.archived_at ?? nowIso()) : null,
    };

    const { data, error } = await (supabase as any)
      .from("prompt_templates")
      .update(updateRow)
      .eq("workspace_id", payload.workspace_id)
      .eq("id", id)
      .select(PROMPT_TEMPLATE_SELECT)
      .single();
    if (error) throw error;
    const prompt = fromSupabasePrompt(data as PromptTemplateRow);

    if (shouldVersion) {
      await createPromptTemplateVersion(id, {
        workspace_id: payload.workspace_id,
        title: prompt.title,
        prompt_body: prompt.prompt_body,
        variables: prompt.variables,
        change_summary: payload.change_summary || "Alteração registrada no prompt.",
        metadata: prompt.metadata,
        version_number: nextVersion,
      });
    }
    await logPromptActivity({
      workspaceId: payload.workspace_id,
      action: prompt.status === "archived" && current.status !== "archived" ? "prompt_archived" : "prompt_updated",
      entityId: prompt.id,
      title: prompt.title,
      description: `Prompt ${prompt.title} atualizado.`,
    });
    dispatchUpdated(payload.workspace_id);
    return prompt;
  } catch (error) {
    warnSupabaseOperationalError("Biblioteca de Prompts", error);
    throw error;
  }
}

export async function archivePromptTemplate(id: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  return updatePromptTemplate(id, { workspace_id: workspaceId, status: "archived", createVersion: false, change_summary: "Prompt arquivado sem exclusão definitiva." });
}

export async function createPromptTemplateVersion(promptId: string, payload: {
  workspace_id: string;
  version_number: number;
  title: string;
  prompt_body: string;
  variables?: string[];
  change_summary?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseClient();
  if (!supabase || !shouldUseWorkspaceSupabase()) throw new Error("Supabase não disponível para versionar prompt real.");

  const createdBy = await resolveCreatedBy(supabase);
  const { data, error } = await (supabase as any)
    .from("prompt_template_versions")
    .insert({
      prompt_template_id: promptId,
      workspace_id: payload.workspace_id,
      created_by: createdBy,
      version_number: payload.version_number,
      title: payload.title,
      prompt_body: payload.prompt_body,
      variables: payload.variables ?? [],
      change_summary: payload.change_summary ?? null,
      metadata: payload.metadata ?? {},
    })
    .select(PROMPT_TEMPLATE_VERSION_SELECT)
    .single();
  if (error) throw error;
  const version = fromSupabaseVersion(data as PromptTemplateVersionRow);
  await logPromptActivity({ workspaceId: payload.workspace_id, action: "prompt_version_created", entityId: promptId, title: payload.title, description: `Versão ${version.version_number} criada para o prompt ${payload.title}.` });
  return version;
}

export async function listPromptTemplateVersionsAsync(promptId: string, workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return listPromptTemplateVersions(promptId, workspaceId);
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("prompt_template_versions")
      .select(PROMPT_TEMPLATE_VERSION_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("prompt_template_id", promptId)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return ((data || []) as PromptTemplateVersionRow[]).map(fromSupabaseVersion);
  } catch (error) {
    warnSupabaseOperationalError("Biblioteca de Prompts", error);
    return [];
  }
}

export async function getActivePromptTemplates(workspaceId = FALLBACK_WORKSPACE_ID) {
  if (!shouldUseWorkspaceSupabase()) return getLocalActivePromptTemplates(workspaceId);
  return listPromptTemplatesAsync(workspaceId, { status: "active" });
}

export async function getPromptTemplateSearchResultsAsync(workspaceId = FALLBACK_WORKSPACE_ID) {
  const prompts = await listPromptTemplatesAsync(workspaceId, { includeArchived: false });
  return prompts.map((prompt) => ({
    type: "Prompts",
    title: prompt.title,
    description: `${prompt.category} • ${prompt.legal_area ?? "geral"} • ${prompt.prompt_type} • ${prompt.tags.join(", ") || "sem tags"}`,
    route: `/central-lexos/prompts?promptId=${prompt.id}`,
    action: "Abrir prompt",
  }));
}
