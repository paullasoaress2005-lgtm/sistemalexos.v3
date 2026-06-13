"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { SimulationModal } from "@/components/SimulationModal";
import {
  CENTRAL_EXECUTIONS_UPDATED_EVENT,
  archiveCentralExecutionAsync,
  getCentralExecutionByIdAsync,
  listCentralExecutionsAsync,
  type CentralExecution,
  type CentralExecutionType,
} from "@/lib/data/centralExecutions";
import {
  PROMPT_TEMPLATES_UPDATED_EVENT,
  listPromptTemplatesAsync,
  type PromptTemplate,
} from "@/lib/data/promptTemplates";

const typeLabel: Record<string, string> = {
  prompt: "Prompt operacional",
  dossie_rapido: "Dossiê rápido",
  agente: "Apoio guiado",
  fluxo: "Fluxo",
  playbook: "Playbook",
  checklist: "Plano de ação",
  mensagem: "Síntese de cliente",
  resumo: "Relatório executivo",
};

const outputOptions: { label: string; value: CentralExecutionType }[] = [
  { label: "Dossiê rápido", value: "dossie_rapido" },
  { label: "Relatório executivo", value: "resumo" },
  { label: "Prompt operacional", value: "prompt" },
  { label: "Síntese de cliente", value: "mensagem" },
  { label: "Síntese de processo", value: "agente" },
  { label: "Plano de ação", value: "checklist" },
];

const moduleOptions = [
  "Operação geral",
  "Clientes",
  "Processos",
  "Tarefas",
  "Financeiro",
  "Agenda",
  "Relatórios",
];

const operationalModels: {
  title: string;
  detail: string;
  tag: string;
  type: CentralExecutionType;
  module: string;
  request: string;
}[] = [
  {
    title: "Dossiê de processo sensível",
    detail: "Consolide riscos, fase atual e próximos passos.",
    tag: "Processos",
    type: "dossie_rapido",
    module: "Processos",
    request:
      "Preparar dossiê rápido do processo sensível, destacando riscos, fase atual, pendências e próximos passos.",
  },
  {
    title: "Relatório para sócios",
    detail: "Organize decisões e prioridades da semana.",
    tag: "Gestão",
    type: "resumo",
    module: "Relatórios",
    request:
      "Gerar relatório executivo para sócios com prioridades, riscos e decisões necessárias nesta semana.",
  },
  {
    title: "Síntese de cliente em atenção",
    detail: "Estruture contexto, pendências e abordagem.",
    tag: "Clientes",
    type: "mensagem",
    module: "Clientes",
    request:
      "Sintetizar o contexto do cliente em atenção, suas pendências e o encaminhamento recomendado para revisão interna.",
  },
  {
    title: "Plano de tarefa urgente",
    detail: "Defina responsáveis, sequência e validações.",
    tag: "Tarefas",
    type: "checklist",
    module: "Tarefas",
    request:
      "Montar plano de ação para tarefa urgente com responsáveis, sequência, validações e pontos de controle.",
  },
  {
    title: "Pendências financeiras",
    detail: "Revise ocorrências e próximos encaminhamentos.",
    tag: "Financeiro",
    type: "resumo",
    module: "Financeiro",
    request:
      "Revisar pendências financeiras e organizar ocorrências, prioridades e próximos encaminhamentos internos.",
  },
  {
    title: "Apoio para reunião interna",
    detail: "Prepare pauta curta e pontos de decisão.",
    tag: "Agenda",
    type: "prompt",
    module: "Agenda",
    request:
      "Preparar apoio para reunião interna com pauta objetiva, pontos de decisão e pendências que exigem acompanhamento.",
  },
  {
    title: "Checklist de audiência",
    detail: "Organize documentos, pontos críticos e validações.",
    tag: "Fluxos",
    type: "checklist",
    module: "Agenda",
    request:
      "Preparar checklist de audiência com documentos, pontos críticos, responsáveis e validações finais.",
  },
  {
    title: "Revisão de documentos recebidos",
    detail: "Estruture conferência e lacunas documentais.",
    tag: "Playbooks",
    type: "agente",
    module: "Processos",
    request:
      "Revisar documentos recebidos, destacando conferências necessárias, lacunas e encaminhamentos internos.",
  },
];

const moduleLinks = [
  ["Dossiê rápido", "/central-lexos/dossie-rapido"],
  ["Prompts", "/central-lexos/prompts"],
  ["Agentes guiados", "/central-lexos/agentes"],
  ["Fluxos", "/central-lexos/fluxos"],
  ["Playbooks", "/central-lexos/playbooks"],
  ["Relatórios", "/relatorios"],
];

const governanceItems = [
  ["Sem envio externo", "Nenhuma saída é enviada automaticamente a terceiros."],
  ["Revisão obrigatória", "Todo conteúdo exige validação humana antes do uso."],
  [
    "Apoio responsável",
    "A Central não substitui análise jurídica responsável.",
  ],
  ["Ambiente controlado", "Operação local/demonstração com dados internos."],
];

function displayStatus(status: CentralExecution["status"]) {
  if (status === "archived") return "arquivado";
  if (status === "copied") return "revisado";
  return "gerado";
}

function statusClasses(status: CentralExecution["status"]) {
  if (status === "archived")
    return "border-lexos-line bg-lexos-card/70 text-lexos-muted";
  if (status === "copied")
    return "border-lexos-green/40 bg-lexos-green/10 text-lexos-green";
  return "border-lexos-gold/40 bg-lexos-gold/10 text-lexos-goldSoft";
}

export default function CentralLexosPage() {
  const {
    toast,
    setToast,
    copyText,
    saveExecution,
    workspaceId,
    isSupabaseMode,
  } = useCentralWorkspace();
  const [showArchived, setShowArchived] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [executions, setExecutions] = useState<CentralExecution[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selected, setSelected] = useState<CentralExecution | null>(null);
  const [pendingArchive, setPendingArchive] = useState<CentralExecution | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [request, setRequest] = useState("");
  const [outputType, setOutputType] =
    useState<CentralExecutionType>("dossie_rapido");
  const [sourceModule, setSourceModule] = useState("Operação geral");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [nextExecutions, nextPrompts] = await Promise.all([
      listCentralExecutionsAsync(workspaceId, { includeArchived: true }),
      listPromptTemplatesAsync(workspaceId, { status: "active" }),
    ]);
    setExecutions(nextExecutions);
    setPromptTemplates(nextPrompts);
    setIsLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    function onUpdate() {
      void refresh();
    }
    window.addEventListener(CENTRAL_EXECUTIONS_UPDATED_EVENT, onUpdate);
    window.addEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, onUpdate);
    return () => {
      window.removeEventListener(CENTRAL_EXECUTIONS_UPDATED_EVENT, onUpdate);
      window.removeEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, onUpdate);
    };
  }, [refresh]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("executionId");
    if (!id) return;
    void getCentralExecutionByIdAsync(id, workspaceId).then((execution) => {
      if (execution) setSelected(execution);
    });
  }, [workspaceId]);

  const activeExecutions = useMemo(
    () => executions.filter((execution) => execution.status !== "archived"),
    [executions],
  );
  const visibleExecutions = useMemo(
    () =>
      executions.filter((execution) =>
        showArchived
          ? execution.status === "archived"
          : execution.status !== "archived",
      ),
    [executions, showArchived],
  );
  const displayedExecutions = visibleExecutions.slice(
    0,
    showAllHistory ? 12 : 1,
  );
  const displayedModels = operationalModels.slice(
    0,
    showAllModels ? operationalModels.length : 4,
  );
  const counts = useMemo(
    () => ({
      total: activeExecutions.length,
      dossiers: activeExecutions.filter(
        (execution) => execution.type === "dossie_rapido",
      ).length,
      activePrompts: promptTemplates.length,
      pendingReview: activeExecutions.filter(
        (execution) => execution.status === "generated",
      ).length,
      archived: executions.filter(
        (execution) => execution.status === "archived",
      ).length,
      assistedUse: activeExecutions.filter(
        (execution) => execution.type !== "prompt",
      ).length,
    }),
    [activeExecutions, executions, promptTemplates.length],
  );

  function clearWorkbench() {
    setRequest("");
    setOutputType("dossie_rapido");
    setSourceModule("Operação geral");
  }

  function applyModel(model: (typeof operationalModels)[number]) {
    setRequest(model.request);
    setOutputType(model.type);
    setSourceModule(model.module);
    document
      .getElementById("bancada-operacional")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function executeWorkbench() {
    const normalizedRequest = request.trim();
    if (!normalizedRequest) {
      setToast("Descreva a solicitação antes de executar o apoio assistido.");
      return;
    }
    const label = typeLabel[outputType] ?? outputType;
    const outputText = `${label}\n\nContexto operacional\n${normalizedRequest}\n\nMódulo de referência\n${sourceModule}\n\nEstrutura sugerida para revisão\n• Validar fatos, documentos e vínculos internos aplicáveis.\n• Confirmar prioridades, responsáveis e prazos.\n• Ajustar linguagem e encaminhamento antes de qualquer uso externo.\n\nPróximo passo\nRevisar esta saída com o responsável jurídico e registrar os ajustes necessários.`;
    const execution = await saveExecution({
      type: outputType,
      title: `${label} · ${sourceModule}`,
      outputText,
      selection: {},
      sourceModule,
      inputSummary: normalizedRequest,
      metadata: {
        requested_output: label,
        operational_module: sourceModule,
        human_review_required: true,
      },
    });
    setSelected(execution);
    await refresh();
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    await archiveCentralExecutionAsync(pendingArchive.id, workspaceId);
    setToast("Execução arquivada sem exclusão definitiva.");
    setPendingArchive(null);
    await refresh();
  }

  function reuseExecution(execution: CentralExecution) {
    setRequest(execution.input_summary || execution.output_text);
    setOutputType(execution.type);
    setSourceModule(execution.source_module || "Operação geral");
    setToast("Execução restaurada na bancada para nova revisão.");
    document
      .getElementById("bancada-operacional")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
        <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lexos-gold">
                Central LEX.OS • IA supervisionada
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white lg:text-3xl">
                Central LEX.OS
              </h1>
              <p className="mt-1.5 text-[15px] leading-6 text-lexos-silver">
                Bancada assistida para preparar saídas internas, revisar riscos e manter o controle humano do escritório.
              </p>
            </div>
            <div className="max-w-sm rounded-2xl border border-lexos-cyan/16 bg-white/[0.035] px-4 py-3 text-xs leading-5 text-lexos-silver">
              <p className="font-semibold uppercase tracking-[0.12em] text-lexos-cyan">Controle do escritório</p>
              <p className="mt-1">Uso interno, revisão humana obrigatória e nenhuma saída externa automática.</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Execuções no período", counts.total],
              ["Dossiês rápidos", counts.dossiers],
              ["Prompts ativos", counts.activePrompts],
              ["Pendentes de revisão", counts.pendingReview],
            ].map(([label, value], index) => (
              <article
                className={`calm-metric-card flex min-h-[76px] items-center justify-between border ${index === 3 ? "border-lexos-gold/28 bg-lexos-gold/[0.055]" : index === 2 ? "border-lexos-cyan/18 bg-lexos-cyan/[0.04]" : "border-lexos-line/45"}`}
                key={label}
              >
                <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-lexos-silver">
                  {label}
                </p>
                <strong className="ml-3 text-2xl font-semibold leading-none text-lexos-goldSoft">
                  {value}
                </strong>
              </article>
            ))}
          </div>
          <p className="px-1 text-xs text-lexos-muted">
            Resumo secundário · {counts.archived} registros arquivados ·{" "}
            {counts.assistedUse} apoios internos ativos
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.62fr)]">
          <article
            className="overflow-hidden rounded-[1.45rem] border border-lexos-cyan/14 bg-white/[0.028] shadow-[0_14px_36px_rgba(0,0,0,0.11)]"
            id="bancada-operacional"
          >
            <div className="flex flex-col gap-2 border-b border-white/[0.045] bg-white/[0.026] px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lexos-gold">
                  Bancada assistida
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  Preparar saída revisável
                </h2>
                <p className="mt-1 text-sm leading-5 text-lexos-muted">
                  Organize contexto, tipo de apoio e módulo antes de salvar no histórico controlado.
                </p>
              </div>
              <span className="w-fit rounded-full border border-lexos-cyan/22 bg-lexos-cyan/[0.065] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lexos-cyan">
                IA supervisionada
              </span>
            </div>
            <div className="p-4">
              <label className="block text-sm font-semibold text-lexos-silver">
                Contexto ou solicitação
                <textarea
                  className="premium-input mt-1.5 min-h-[116px] resize-y !rounded-xl !px-3.5 !py-3"
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Descreva o caso, a pendência ou a decisão que precisa ser preparada..."
                  value={request}
                />
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold text-lexos-silver">
                  Tipo de saída
                  <select
                    className="premium-input mt-1.5 !rounded-xl !px-3 !py-2.5"
                    onChange={(event) =>
                      setOutputType(event.target.value as CentralExecutionType)
                    }
                    value={outputType}
                  >
                    {outputOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-lexos-silver">
                  Módulo / contexto
                  <select
                    className="premium-input mt-1.5 !rounded-xl !px-3 !py-2.5"
                    onChange={(event) => setSourceModule(event.target.value)}
                    value={sourceModule}
                  >
                    {moduleOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5 border-t border-lexos-line/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="calm-primary-action"
                    onClick={executeWorkbench}
                    type="button"
                  >
                    Executar apoio assistido
                  </button>
                  <button
                    className="calm-secondary-action"
                    onClick={clearWorkbench}
                    type="button"
                  >
                    Limpar bancada
                  </button>
                </div>
                <span className="text-xs text-lexos-muted">
                  Revisão humana obrigatória · sem envio automático
                </span>
              </div>
            </div>
          </article>

          <aside className="overflow-hidden rounded-[1.45rem] border border-lexos-line/45 bg-white/[0.025] shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
            <div className="border-b border-white/[0.045] bg-white/[0.024] px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-lexos-gold">
                Rotas assistidas
              </p>
              <h2 className="mt-1 text-base font-semibold text-white">
                Módulos da Central
              </h2>
            </div>
            <nav
              className="grid gap-1.5 p-3 sm:grid-cols-2 xl:grid-cols-1"
              aria-label="Módulos da Central LEX.OS"
            >
              {moduleLinks.map(([label, href]) => (
                <Link
                  className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-lexos-silver transition hover:border-lexos-cyan/18 hover:bg-white/[0.045] hover:text-white focus-visible:bg-white/[0.045]"
                  href={href}
                  key={href}
                >
                  <span>{label}</span>
                  <span className="text-lexos-gold transition group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              ))}
            </nav>
          </aside>
        </section>

        <section className="overflow-hidden rounded-[1.45rem] border border-lexos-line/45 bg-white/[0.024] shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-2 border-b border-lexos-line/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-cyan">
                Ações rápidas
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-white">
                Modelos frequentes
              </h2>
            </div>
            <button
              className="w-fit text-sm font-semibold text-lexos-gold transition hover:text-lexos-goldSoft"
              onClick={() => setShowAllModels((value) => !value)}
              type="button"
            >
              {showAllModels
                ? "Mostrar destaques"
                : `Ver todos os modelos (${operationalModels.length})`}{" "}
              →
            </button>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
            {displayedModels.map((model) => (
              <article
                className="calm-priority-card group flex min-h-[120px] flex-col border border-lexos-line/45 transition hover:border-lexos-cyan/20"
                key={model.title}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-5 text-white">
                    {model.title}
                  </h3>
                  <span className="shrink-0 rounded-full border border-lexos-cyan/14 bg-lexos-cyan/[0.045] px-2 py-0.5 text-[10px] font-semibold text-lexos-cyan">
                    {model.tag}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-[18px] text-lexos-muted">
                  {model.detail}
                </p>
                <button
                  className="mt-auto inline-flex w-fit rounded-full border border-lexos-gold/22 bg-lexos-gold/[0.055] px-3 py-1.5 text-left text-xs font-bold text-lexos-gold transition hover:border-lexos-gold/42 hover:bg-lexos-gold/10 hover:text-lexos-goldSoft"
                  onClick={() => applyModel(model)}
                  type="button"
                >
                  Usar modelo →
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.45rem] border border-lexos-line/45 bg-white/[0.024] shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-2 border-b border-lexos-line/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-gold">
                {isSupabaseMode
                  ? "Histórico do escritório"
                  : "Histórico controlado"}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-white">
                Histórico da Central
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="text-xs font-semibold text-lexos-silver transition hover:text-white"
                onClick={() => setShowArchived((value) => !value)}
                type="button"
              >
                {showArchived
                  ? "Ver recentes"
                  : `Ver arquivadas (${counts.archived})`}
              </button>
              {visibleExecutions.length > 1 ? (
                <button
                  className="text-xs font-semibold text-lexos-gold transition hover:text-lexos-goldSoft"
                  onClick={() => setShowAllHistory((value) => !value)}
                  type="button"
                >
                  {showAllHistory
                    ? "Mostrar apenas o mais recente"
                    : `Ver histórico (${visibleExecutions.length})`}{" "}
                  →
                </button>
              ) : null}
            </div>
          </div>
          <div className="p-3">
            {isLoading ? (
              <p className="rounded-xl border border-lexos-line/65 bg-lexos-card/40 p-3 text-sm text-lexos-muted">
                Carregando histórico...
              </p>
            ) : null}
            {!isLoading && displayedExecutions.length ? (
              <div className="divide-y divide-white/[0.045] overflow-hidden rounded-2xl border border-lexos-line/38 bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                {displayedExecutions.map((execution) => (
                  <article
                    className="grid gap-2.5 bg-transparent px-3.5 py-3.5 transition hover:bg-white/[0.028] lg:grid-cols-[minmax(220px,1.5fr)_minmax(115px,0.65fr)_100px_145px_minmax(230px,auto)] lg:items-center"
                    key={execution.id}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {execution.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-lexos-muted">
                        {execution.input_summary ||
                          "Execução registrada sem resumo."}
                      </p>
                    </div>
                    <span className="text-xs text-lexos-silver">
                      {typeLabel[execution.type] ?? execution.type}
                    </span>
                    <span
                      className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClasses(execution.status)}`}
                    >
                      {displayStatus(execution.status)}
                    </span>
                    <time className="text-xs leading-4 text-lexos-silver">
                      {new Date(execution.created_at).toLocaleString("pt-BR")}
                    </time>
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      <button
                        className="rounded-lg border border-lexos-gold/42 bg-lexos-gold/10 px-2 py-1.5 text-[11px] font-semibold text-lexos-gold transition hover:bg-lexos-gold/16"
                        onClick={() => setSelected(execution)}
                        type="button"
                      >
                        Abrir
                      </button>
                      <button
                        className="rounded-lg border border-lexos-line/85 bg-lexos-ink/22 px-2 py-1.5 text-[11px] font-semibold text-lexos-silver transition hover:border-lexos-gold/32 hover:text-white"
                        onClick={() =>
                          copyText(execution.output_text, execution.id)
                        }
                        type="button"
                      >
                        Copiar
                      </button>
                      <button
                        className="rounded-lg border border-lexos-line/85 bg-lexos-ink/22 px-2 py-1.5 text-[11px] font-semibold text-lexos-silver transition hover:border-lexos-gold/32 hover:text-white"
                        onClick={() => reuseExecution(execution)}
                        type="button"
                      >
                        Reutilizar
                      </button>
                      {execution.status !== "archived" ? (
                        <button
                          className="rounded-lg border border-lexos-line/85 bg-lexos-ink/22 px-2 py-1.5 text-[11px] font-semibold text-lexos-silver transition hover:border-lexos-gold/32 hover:text-white"
                          onClick={() => setPendingArchive(execution)}
                          type="button"
                        >
                          Arquivar
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {!isLoading && !visibleExecutions.length ? (
              <p className="rounded-xl border border-dashed border-lexos-gold/24 bg-lexos-ink/32 p-3 text-sm text-lexos-muted">
                Nenhuma execução {showArchived ? "arquivada" : "recente"}{" "}
                encontrada.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[1.35rem] border border-lexos-cyan/12 bg-white/[0.024] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-gold">
                Governança da Central
              </p>
              <p className="mt-1 text-sm text-lexos-muted">
                Operação interna, assistida e revisável.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {governanceItems.map(([title]) => (
                <span
                  className="flex items-center gap-1.5 rounded-full border border-lexos-cyan/12 bg-lexos-cyan/[0.035] px-2.5 py-1 text-xs font-semibold text-lexos-silver"
                  key={title}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-lexos-cyan"
                  />
                  {title}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
      {selected ? (
        <SimulationModal
          eyebrow={typeLabel[selected.type] ?? selected.type}
          onClose={() => setSelected(null)}
          title={selected.title}
          wide
        >
          <pre className="max-h-[62vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-lexos-line bg-lexos-ink/75 p-5 text-sm leading-7 text-lexos-silver premium-scrollbar">
            {selected.output_text}
          </pre>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold"
              onClick={() => copyText(selected.output_text, selected.id)}
              type="button"
            >
              Copiar resultado
            </button>
          </div>
        </SimulationModal>
      ) : null}
      {pendingArchive ? (
        <SimulationModal
          eyebrow="Arquivar execução"
          onClose={() => setPendingArchive(null)}
          title="Confirmar arquivamento"
          wide={false}
        >
          <p className="text-sm leading-6 text-lexos-silver">
            A execução “{pendingArchive.title}” será marcada como arquivada, sem
            exclusão destrutiva.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold"
              onClick={confirmArchive}
              type="button"
            >
              Arquivar execução
            </button>
            <button
              className="rounded-xl border border-lexos-line px-4 py-3 text-sm font-semibold text-lexos-silver"
              onClick={() => setPendingArchive(null)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </SimulationModal>
      ) : null}
      <Toast message={toast} />
    </AppLayout>
  );
}
