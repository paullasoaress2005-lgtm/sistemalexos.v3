"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { RestrictedAccess } from "@/components/RestrictedAccess";
import { CentralHero, OutputPanel, SelectionPanel, Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { SimulationModal } from "@/components/SimulationModal";
import { SectionCard } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import { canManagePrompts } from "@/lib/permissions";
import { sanitizeSensitiveText } from "@/lib/security";
import { buildSelectionSummary, type CentralSelection } from "@/lib/data/centralOperations";
import { CENTRAL_REVIEW_NOTICE, type CentralExecution } from "@/lib/data/centralExecutions";
import {
  PROMPT_TEMPLATES_UPDATED_EVENT,
  archivePromptTemplate,
  createPromptTemplate,
  listPromptTemplateVersionsAsync,
  listPromptTemplatesAsync,
  updatePromptTemplate,
  type PromptTemplate,
  type PromptTemplateStatus,
  type PromptTemplateVersion,
} from "@/lib/data/promptTemplates";

const emptyFilter = "Todos";
const categories = ["geral", "atendimento", "processo", "dossie", "peca", "financeiro", "parceria", "relatorio", "audiencia", "cobranca", "gestao", "penal", "trabalhista", "previdenciario", "civel", "consumidor", "administrativo"];
const legalAreas = ["geral", "cível", "contratual", "empresarial", "penal", "trabalhista", "previdenciário", "consumidor", "administrativo", "família", "tributário"];
const promptTypes = ["operacional", "mensagem", "dossie", "peca_juridica", "checklist", "relatorio", "fluxo", "agente", "playbook", "auditoria"];
const statuses: Array<{ value: PromptTemplateStatus; label: string }> = [
  { value: "active", label: "ativo" },
  { value: "draft", label: "rascunho" },
  { value: "archived", label: "arquivado" },
];

const modelPresets = [
  { title: "Resumo executivo de processo", category: "processo", prompt_type: "relatorio", body: "Elabore um resumo executivo determinístico do processo selecionado, destacando status, próximos passos, riscos e pendências para revisão humana." },
  { title: "Follow-up humanizado para cliente", category: "atendimento", prompt_type: "mensagem", body: "Estruture uma mensagem humanizada ao cliente com contexto, pendências, próximo passo e aviso interno de revisão antes do envio." },
  { title: "Dossiê rápido de triagem", category: "dossie", prompt_type: "dossie", body: "Organize um dossiê de triagem com dados do cliente, processo, tarefas, agenda e financeiro disponíveis no escritório." },
  { title: "Checklist de parceria", category: "parceria", prompt_type: "checklist", body: "Monte um checklist operacional para parceria processual com documentos, repasse, responsáveis, riscos e próxima ação." },
  { title: "Relatório semanal para sócios", category: "relatorio", prompt_type: "relatorio", body: "Consolide leitura semanal para sócios com alertas, volume operacional, financeiro, prazos e ações prioritárias." },
  { title: "Cobrança de documentos", category: "cobranca", prompt_type: "mensagem", body: "Crie roteiro de cobrança de documentos com tom consultivo, prazos internos e revisão humana obrigatória antes do contato externo." },
  { title: "Roteiro de audiência", category: "audiencia", prompt_type: "checklist", body: "Estruture roteiro de audiência com pontos de atenção, documentos, perguntas, responsáveis e próximos passos." },
  { title: "Mensagem financeira humanizada", category: "financeiro", prompt_type: "mensagem", body: "Organize mensagem financeira humanizada sobre pendência, sem constrangimento, com contexto, valor, vencimento e próximo passo." },
];

type PromptFormState = {
  id?: string;
  title: string;
  description: string;
  category: string;
  legal_area: string;
  prompt_type: string;
  audience: string;
  status: PromptTemplateStatus;
  visibility: "workspace" | "private";
  tagsText: string;
  variablesText: string;
  prompt_body: string;
  change_summary: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseList(value: string) {
  return value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
}

function blankForm(): PromptFormState {
  return {
    title: "",
    description: "",
    category: "geral",
    legal_area: "geral",
    prompt_type: "operacional",
    audience: "Equipe do escritório",
    status: "active",
    visibility: "workspace",
    tagsText: "",
    variablesText: "",
    prompt_body: "",
    change_summary: "Versão inicial do prompt.",
  };
}

function formFromPrompt(prompt: PromptTemplate): PromptFormState {
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description ?? "",
    category: prompt.category,
    legal_area: prompt.legal_area ?? "geral",
    prompt_type: prompt.prompt_type,
    audience: prompt.audience ?? "",
    status: prompt.status,
    visibility: prompt.visibility === "private" ? "private" : "workspace",
    tagsText: prompt.tags.join(", "),
    variablesText: prompt.variables.join(", "),
    prompt_body: prompt.prompt_body,
    change_summary: "",
  };
}

function generateDeterministicOutput(prompt: PromptTemplate, purpose: string, variableValues: Record<string, string>, selectionSummary: string) {
  const variables = prompt.variables.length
    ? prompt.variables.map((variable) => `- ${variable}: ${sanitizeSensitiveText(variableValues[variable]?.trim() || "não informado")}`).join("\n")
    : "Nenhuma variável esperada foi cadastrada para este prompt.";
  const safePromptBody = sanitizeSensitiveText(prompt.prompt_body);

  return `${prompt.title}\nFinalidade: ${purpose || "Uso operacional"}\nVersão do prompt: ${prompt.current_version}\nCategoria: ${prompt.category}\nTipo: ${prompt.prompt_type}\n\nSaída controlada\nO LEX.OS Control organiza o prompt cadastrado no escritório, as variáveis preenchidas manualmente e o contexto selecionado para revisão humana.\n\nContexto selecionado\n${selectionSummary}\n\nVariáveis preenchidas\n${variables}\n\nCorpo do prompt usado\n${safePromptBody}\n\nResultado controlado\n1. Contexto: usar os dados selecionados e as variáveis acima como base interna.\n2. Estrutura sugerida: introdução objetiva, pontos relevantes, pendências, riscos e próxima ação.\n3. Próxima ação recomendada: revisar juridicamente o conteúdo, validar dados sensíveis e registrar encaminhamento no módulo de origem.\n\nAviso\n${CENTRAL_REVIEW_NOTICE}`;
}

export default function Page() {
  const { context, isLoadingContext, isSupabaseMode, workspaceId, toast, setToast, copyText, saveExecution } = useCentralWorkspace();
  const canManagePromptLibrary = canManagePrompts(getCurrentSessionOrFallback().user.profile);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [versions, setVersions] = useState<PromptTemplateVersion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [purpose, setPurpose] = useState("Uso operacional");
  const [selection, setSelection] = useState<CentralSelection>({});
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [execution, setExecution] = useState<CentralExecution | null>(null);
  const [form, setForm] = useState<PromptFormState | null>(null);
  const [versionPreview, setVersionPreview] = useState<PromptTemplateVersion | null>(null);
  const [pendingArchive, setPendingArchive] = useState<PromptTemplate | null>(null);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [filters, setFilters] = useState({ category: emptyFilter, legalArea: emptyFilter, promptType: emptyFilter, status: "active" as PromptTemplateStatus | "all", search: "" });

  const refreshPrompts = useCallback(async () => {
    setIsLoadingPrompts(true);
    const includeArchived = filters.status === "archived";
    const nextPrompts = await listPromptTemplatesAsync(workspaceId, {
      category: filters.category === emptyFilter ? undefined : filters.category,
      legalArea: filters.legalArea === emptyFilter ? undefined : filters.legalArea,
      promptType: filters.promptType === emptyFilter ? undefined : filters.promptType,
      status: filters.status,
      includeArchived,
      search: filters.search,
    });
    setPrompts(nextPrompts);
    setSelectedId((current) => (current && nextPrompts.some((prompt) => prompt.id === current) ? current : (nextPrompts[0]?.id ?? "")));
    setIsLoadingPrompts(false);
  }, [filters, workspaceId]);

  useEffect(() => { void refreshPrompts(); }, [refreshPrompts]);
  useEffect(() => {
    function onUpdate() { void refreshPrompts(); }
    window.addEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, onUpdate);
  }, [refreshPrompts]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("promptId");
    if (id) setSelectedId(id);
  }, []);

  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setVersions([]);
      return;
    }
    setPurpose(selected.audience || "Uso operacional");
    setVariableValues(Object.fromEntries(selected.variables.map((variable) => [variable, ""])));
    setOutput("");
    setExecution(null);
    void listPromptTemplateVersionsAsync(selected.id, workspaceId).then(setVersions);
  }, [selected, workspaceId]);

  async function saveForm(draft: PromptFormState) {
    if (!draft.title.trim() || !draft.category.trim() || !draft.prompt_type.trim() || !draft.prompt_body.trim()) {
      setToast("Preencha título, categoria, tipo e corpo do prompt.");
      return;
    }

    const payload = {
      workspace_id: workspaceId,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      legal_area: draft.legal_area,
      prompt_type: draft.prompt_type,
      audience: draft.audience,
      status: draft.status,
      visibility: draft.visibility,
      prompt_body: draft.prompt_body,
      variables: parseList(draft.variablesText),
      tags: parseList(draft.tagsText),
      metadata: { source: isSupabaseMode ? "supabase-workspace" : "demo-local" },
      change_summary: draft.change_summary,
    };

    try {
      const saved = draft.id
        ? await updatePromptTemplate(draft.id, { ...payload, createVersion: true })
        : await createPromptTemplate(payload);
      setForm(null);
      setSelectedId(saved.id);
      setToast(draft.id ? "Prompt atualizado e nova versão registrada." : "Prompt cadastrado com sucesso.");
      await refreshPrompts();
      setVersions(await listPromptTemplateVersionsAsync(saved.id, workspaceId));
    } catch {
      setToast("Não foi possível salvar o prompt. Verifique as permissões do escritório e tente novamente.");
    }
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    try {
      await archivePromptTemplate(pendingArchive.id, workspaceId);
      setPendingArchive(null);
      setToast("Prompt arquivado sem exclusão definitiva.");
      await refreshPrompts();
    } catch {
      setToast("Não foi possível arquivar o prompt.");
    }
  }

  async function generate(save = true) {
    if (!selected) return;
    const nextOutput = generateDeterministicOutput(selected, purpose, variableValues, buildSelectionSummary(context, selection));
    setOutput(nextOutput);
    if (save) {
      setExecution(await saveExecution({
        type: "prompt",
        title: selected.title,
        outputText: nextOutput,
        selection,
        sourceModule: "Biblioteca de Prompts",
        inputSummary: `${purpose || "Uso operacional"} • ${selected.description || selected.category}`,
        metadata: {
          prompt_template_id: selected.id,
          prompt_title: selected.title,
          prompt_version: selected.current_version,
          prompt_category: selected.category,
          prompt_type: selected.prompt_type,
        },
      }));
    }
  }

  function applyPreset(preset: (typeof modelPresets)[number]) {
    setForm({ ...blankForm(), title: preset.title, category: preset.category, prompt_type: preset.prompt_type, prompt_body: preset.body, tagsText: "modelo, revisão-humana", variablesText: "cliente, processo, objetivo", change_summary: "Criado a partir de modelo pré-preenchido." });
  }

  return (
    <AppLayout>
      <RestrictedAccess module="prompts">
      <div className="space-y-5">
        <CentralHero eyebrow="Central LEX.OS • Gerenciador de Prompts" title="Biblioteca de Prompts do escritório." description="Cadastre, edite, versione, filtre, arquive e execute prompts do escritório de forma controlada. A demonstração permanece separada e nenhuma integração externa é acionada." />

        <div className="rounded-2xl border border-lexos-gold/25 bg-lexos-gold/8 p-4 text-sm leading-6 text-lexos-silver">
          {isSupabaseMode ? "Ambiente conectado: prompts do escritório aparecem apenas para usuários autorizados." : "Modo demonstração: biblioteca local separada do escritório."} Revise antes de usar em casos reais. Não insira senhas, tokens ou chaves.
        </div>

        <SectionCard eyebrow="Filtros" title="Refine a biblioteca" action={canManagePromptLibrary ? <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => setForm(blankForm())} type="button">Novo prompt</button> : <span className="text-xs text-lexos-muted">Gestão reservada a gestores autorizados</span>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Busca<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Título, descrição ou tag" /></label>
            <FilterSelect label="Categoria" value={filters.category} options={categories} onChange={(value) => setFilters({ ...filters, category: value })} />
            <FilterSelect label="Área jurídica" value={filters.legalArea} options={legalAreas} onChange={(value) => setFilters({ ...filters, legalArea: value })} />
            <FilterSelect label="Tipo" value={filters.promptType} options={promptTypes} onChange={(value) => setFilters({ ...filters, promptType: value })} />
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Status<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none transition focus:border-lexos-gold" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as PromptTemplateStatus | "all" })}><option value="all">Todos</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Modelos opcionais" title="Criar prompt a partir de modelo" action={<span className="text-xs text-lexos-muted">Pré-preenche; o usuário salva manualmente.</span>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {modelPresets.map((preset) => <button className="rounded-2xl border border-lexos-line bg-lexos-card/60 p-4 text-left text-sm font-semibold text-white transition hover:border-lexos-gold/55" key={preset.title} onClick={() => applyPreset(preset)} type="button">{preset.title}<span className="mt-2 block text-xs font-normal text-lexos-muted">{preset.category} • {preset.prompt_type}</span></button>)}
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard eyebrow={isSupabaseMode ? "Prompts do escritório" : "Prompts da demonstração"} title={`${prompts.length} prompt(s) no recorte atual`}>
            <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1 premium-scrollbar">
              {isLoadingPrompts ? <p className="rounded-2xl border border-lexos-line bg-lexos-card/70 p-5 text-sm text-lexos-muted">Carregando biblioteca de prompts...</p> : null}
              {!isLoadingPrompts && prompts.map((prompt) => (
                <button className={`w-full rounded-2xl border p-4 text-left transition hover:border-lexos-gold ${selected?.id === prompt.id ? "border-lexos-gold bg-lexos-gold/10" : "border-lexos-line bg-lexos-card/70"}`} key={prompt.id} onClick={() => setSelectedId(prompt.id)} type="button">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-lexos-gold/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-gold">{statuses.find((status) => status.value === prompt.status)?.label ?? prompt.status}</span>
                    <span className="rounded-full border border-lexos-line px-2.5 py-1 text-[11px] text-lexos-muted">v{prompt.current_version}</span>
                    <span className="rounded-full border border-lexos-line px-2.5 py-1 text-[11px] text-lexos-muted">{prompt.prompt_type}</span>
                  </div>
                  <p className="mt-3 font-semibold text-white">{prompt.title}</p>
                  <p className="mt-2 text-sm leading-5 text-lexos-muted">{prompt.description || "Sem descrição cadastrada."}</p>
                  <p className="mt-3 text-xs text-lexos-muted">{prompt.category} • {prompt.legal_area || "geral"} • {prompt.visibility === "private" ? "privado" : "equipe do escritório"} • {prompt.tags.join(", ") || "sem tags"}</p>
                </button>
              ))}
              {!isLoadingPrompts && !prompts.length ? <div className="rounded-2xl border border-dashed border-lexos-gold/30 bg-lexos-ink/45 p-6 text-sm leading-5 text-lexos-muted"><p>Nenhum prompt cadastrado neste escritório ainda.</p>{canManagePromptLibrary ? <button className="mt-4 rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold" onClick={() => setForm(blankForm())} type="button">Cadastrar primeiro prompt</button> : <p className="mt-3 text-xs text-lexos-goldSoft">Solicite a um gestor autorizado o cadastro do primeiro prompt.</p>}</div> : null}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Dados do escritório" title="Detalhar, versionar e executar">
            {selected ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-lexos-line/80 bg-lexos-ink/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-semibold text-white">{selected.title}</p>
                      <p className="mt-2 text-sm leading-5 text-lexos-muted">{selected.description || "Prompt sem descrição."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => copyText(selected.prompt_body)} type="button">Copiar prompt</button>
                      {canManagePromptLibrary ? <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => setForm(formFromPrompt(selected))} type="button">Editar</button> : null}
                      {canManagePromptLibrary && selected.status !== "archived" ? <button className="rounded-xl border border-lexos-wine/60 bg-lexos-wine/10 px-3 py-2 text-xs font-semibold text-lexos-red transition hover:bg-lexos-wine/20" onClick={() => setPendingArchive(selected)} type="button">Arquivar</button> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-lexos-silver md:grid-cols-2">
                    <p><span className="text-lexos-muted">Categoria:</span> {selected.category}</p>
                    <p><span className="text-lexos-muted">Área:</span> {selected.legal_area || "geral"}</p>
                    <p><span className="text-lexos-muted">Tipo:</span> {selected.prompt_type}</p>
                    <p><span className="text-lexos-muted">Visibilidade:</span> {selected.visibility}</p>
                    <p><span className="text-lexos-muted">Versão atual:</span> {selected.current_version}</p>
                    <p><span className="text-lexos-muted">Atualizado:</span> {formatDateTime(selected.updated_at)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/45 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-gold">Histórico simples de versões</p>
                  <div className="mt-3 space-y-2">
                    {versions.map((version) => <button className="w-full rounded-xl border border-lexos-line bg-lexos-ink/50 p-3 text-left text-sm text-lexos-silver transition hover:border-lexos-gold/50" key={version.id} onClick={() => setVersionPreview(version)} type="button">v{version.version_number} • {formatDateTime(version.created_at)} • {version.change_summary || "sem resumo"}</button>)}
                    {!versions.length ? <p className="text-sm text-lexos-muted">Nenhuma versão registrada.</p> : null}
                  </div>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Finalidade / público<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none focus:border-lexos-gold" value={purpose} onChange={(event) => setPurpose(event.target.value)}><option>{selected.audience || "Uso operacional"}</option><option>Preparação de reunião</option><option>Comunicação com cliente</option><option>Relatório interno</option></select></label>
                <SelectionPanel context={context} selection={selection} onChange={setSelection} />
                {selected.variables.length ? <div className="grid gap-3 md:grid-cols-2">{selected.variables.map((variable) => <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted" key={variable}>{variable}<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none transition focus:border-lexos-gold" value={variableValues[variable] ?? ""} onChange={(event) => setVariableValues({ ...variableValues, [variable]: event.target.value })} placeholder={`Valor para ${variable}`} /></label>)}</div> : <p className="text-sm text-lexos-muted">Este prompt não possui variáveis esperadas cadastradas.</p>}
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15 disabled:opacity-60" disabled={isLoadingContext} onClick={() => generate(true)} type="button">Gerar saída controlada</button>
                  <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white disabled:opacity-60" disabled={isLoadingContext} onClick={() => generate(false)} type="button">Gerar prévia sem salvar</button>
                </div>
                <p className="text-xs text-lexos-muted">Saída controlada. Revisão humana obrigatória antes de uso externo.</p>
              </div>
            ) : <p className="text-sm text-lexos-muted">Nenhum prompt selecionado.</p>}
          </SectionCard>
        </div>

        {selected ? <OutputPanel title={selected.title} output={output} execution={execution} onCopy={() => copyText(output, execution?.id)} onSave={execution ? undefined : async () => setExecution(await saveExecution({ type: "prompt", title: selected.title, outputText: output, selection, sourceModule: "Biblioteca de Prompts", metadata: { prompt_template_id: selected.id, prompt_title: selected.title, prompt_version: selected.current_version } }))} /> : null}
      </div>
      {form ? <PromptModal draft={form} onClose={() => setForm(null)} onSave={saveForm} /> : null}
      {versionPreview ? <SimulationModal eyebrow={`Versão ${versionPreview.version_number}`} onClose={() => setVersionPreview(null)} title={versionPreview.title} wide><p className="text-sm text-lexos-muted">{versionPreview.change_summary || "Sem resumo de alteração."}</p><pre className="mt-4 max-h-[58vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-lexos-line bg-lexos-ink/75 p-5 text-sm leading-7 text-lexos-silver premium-scrollbar">{versionPreview.prompt_body}</pre></SimulationModal> : null}
      {pendingArchive ? <SimulationModal eyebrow="Arquivar prompt" onClose={() => setPendingArchive(null)} title="Confirmar arquivamento" wide={false}><p className="text-sm leading-6 text-lexos-silver">O prompt “{pendingArchive.title}” será marcado como arquivado, sem exclusão destrutiva.</p><div className="mt-5 flex flex-wrap gap-3"><button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold" onClick={confirmArchive} type="button">Arquivar prompt</button><button className="rounded-xl border border-lexos-line px-4 py-3 text-sm font-semibold text-lexos-silver" onClick={() => setPendingArchive(null)} type="button">Cancelar</button></div></SimulationModal> : null}
      <Toast message={toast} />
      </RestrictedAccess>
    </AppLayout>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">{label}<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none transition focus:border-lexos-gold" value={value} onChange={(event) => onChange(event.target.value)}><option>{emptyFilter}</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function PromptModal({ draft: initialDraft, onClose, onSave }: { draft: PromptFormState; onClose: () => void; onSave: (draft: PromptFormState) => void }) {
  const [draft, setDraft] = useState(initialDraft);
  const inputClass = "mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/90 px-3 py-3 text-sm text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold";
  const labelClass = "block text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted";
  const set = (patch: Partial<PromptFormState>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-lexos-ink/80 p-4 backdrop-blur-md">
      <div className="mx-auto my-6 max-w-5xl rounded-[1.35rem] border border-lexos-gold/25 bg-gradient-to-br from-lexos-panel via-lexos-navy to-lexos-ink p-5 shadow-premium lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-lexos-line/70 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Gerenciador de Prompts</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{draft.id ? "Editar prompt" : "Novo prompt"}</h2>
            <p className="mt-2 text-sm text-lexos-muted">Cadastro vinculado ao escritório no ambiente conectado; demonstração local permanece separada. Título, categoria, tipo e corpo são obrigatórios.</p>
          </div>
          <button className="rounded-xl border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onClose} type="button">Fechar</button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className={labelClass}>Título<input className={inputClass} value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder="Ex.: Roteiro de análise inicial" /></label>
          <label className={labelClass}>Categoria<input className={inputClass} list="prompt-categories" value={draft.category} onChange={(event) => set({ category: event.target.value })} /></label>
          <label className={labelClass}>Área jurídica<input className={inputClass} list="prompt-areas" value={draft.legal_area} onChange={(event) => set({ legal_area: event.target.value })} /></label>
          <SelectField label="Tipo" value={draft.prompt_type} options={promptTypes} onChange={(value) => set({ prompt_type: value })} />
          <label className={labelClass}>Público / uso<input className={inputClass} value={draft.audience} onChange={(event) => set({ audience: event.target.value })} placeholder="Equipe, sócios, atendimento..." /></label>
          <SelectField label="Status" value={draft.status} options={statuses.map((status) => status.value)} onChange={(value) => set({ status: value as PromptTemplateStatus })} />
          <label className={labelClass}>Visibilidade<select className={inputClass} value={draft.visibility} onChange={(event) => set({ visibility: event.target.value as "workspace" | "private" })}><option value="workspace">Equipe do escritório</option><option value="private">Privado</option></select></label>
          <label className={labelClass}>Tags<input className={inputClass} value={draft.tagsText} onChange={(event) => set({ tagsText: event.target.value })} placeholder="contratos, revisão, cliente" /></label>
          <label className={labelClass}>Variáveis esperadas<input className={inputClass} value={draft.variablesText} onChange={(event) => set({ variablesText: event.target.value })} placeholder="cliente, processo, objetivo" /></label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextArea label="Descrição" rows={4} value={draft.description} onChange={(value) => set({ description: value })} />
          <TextArea label="Resumo da versão / alteração" rows={4} value={draft.change_summary} onChange={(value) => set({ change_summary: value })} />
        </div>
        <div className="mt-4">
          <TextArea label="Corpo do prompt" rows={14} value={draft.prompt_body} onChange={(value) => set({ prompt_body: value })} helper="Conteúdo versionado, sem chamada externa. Revise antes de usar." />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-lexos-line/70 pt-5">
          <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onClose} type="button">Cancelar</button>
          <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => onSave(draft)} type="button">Salvar prompt</button>
        </div>
        <datalist id="prompt-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
        <datalist id="prompt-areas">{legalAreas.map((item) => <option key={item} value={item} />)}</datalist>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">{label}<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/90 px-3 py-3 text-sm text-white outline-none transition focus:border-lexos-gold" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function TextArea({ label, value, onChange, rows, helper }: { label: string; value: string; onChange: (value: string) => void; rows: number; helper?: string }) {
  return <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">{label}<textarea className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/90 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-lexos-muted/70 focus:border-lexos-gold premium-scrollbar" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />{helper ? <span className="mt-2 block text-[11px] normal-case tracking-normal text-lexos-muted">{helper}</span> : null}</label>;
}
