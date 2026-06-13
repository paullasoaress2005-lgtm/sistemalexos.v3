"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { RestrictedAccess } from "@/components/RestrictedAccess";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import {
  FALLBACK_WORKSPACE_ID,
  listClientsAsync,
  type Client,
} from "@/lib/data/clients";
import { listProcessesAsync, type Process } from "@/lib/data/processes";
import {
  archiveReportAsync,
  generateReportAsync,
  getDefaultReportPeriod,
  getReportByIdAsync,
  listReportsAsync,
  reportTemplates,
  reportTypeLabel,
  markReportCopiedAsync,
  updateReportTitleAsync,
  type Report,
  type ReportAudience,
  type ReportMetric,
  type ReportType,
} from "@/lib/data/reports";
import { cn, humanizeLabel } from "@/lib/utils";

const audienceLabels: Record<ReportAudience, string> = {
  socios: "Sócios/Gestores",
  equipe: "Equipe",
  cliente: "Cliente",
  financeiro: "Financeiro",
  interno: "Interno",
};

const metricTone: Record<NonNullable<ReportMetric["severity"]>, string> = {
  info: "border-white/[0.055] text-lexos-silver",
  success: "border-lexos-green/28 text-lexos-green",
  warning: "border-lexos-gold/30 text-lexos-goldSoft",
  critical: "border-lexos-wine/38 text-lexos-red/90",
};

const frequentTemplates = [
  { type: "socios_operacional", title: "Relatório semanal para sócios", category: "Gestão" },
  { type: "cliente", title: "Relatório de carteira", category: "Carteira" },
  { type: "financeiro", title: "Relatório financeiro", category: "Financeiro" },
  { type: "carteira_processos", title: "Relatório de risco processual", category: "Risco" },
  { type: "tarefas_prazos", title: "Relatório de produtividade", category: "Operação" },
  { type: "inadimplencia", title: "Relatório de pendências críticas", category: "Pendências" },
] satisfies Array<{ type: ReportType; title: string; category: string }>;

const reportStatusLabel = {
  generated: "Revisão pendente",
  copied: "Copiado · revisar",
  archived: "Arquivado",
} as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value.includes("T") ? value : `${value}T12:00:00`),
  );
}

function suggestedTitle(type: ReportType) {
  const base = reportTypeLabel(type);
  return `${base} • ${formatDate(todayIso())}`;
}

function downloadText(report: Report) {
  const blob = new Blob([report.generated_text], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    report.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "relatorio-lexos"
  }.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sectionDigest(report: Report, terms: string[], fallback: string) {
  const section = report.sections.find((item) =>
    terms.some((term) =>
      `${item.title} ${item.content}`.toLowerCase().includes(term),
    ),
  );
  if (!section) return fallback;
  return [section.content, ...(section.items ?? []).slice(0, 2)].join(" ");
}

export default function RelatoriosPage() {
  const [workspaceId, setWorkspaceId] = useState(FALLBACK_WORKSPACE_ID);
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedType, setSelectedType] =
    useState<ReportType>("socios_operacional");
  const [audience, setAudience] = useState<ReportAudience>("socios");
  const defaultPeriod = useMemo(
    () => getDefaultReportPeriod(selectedType),
    [selectedType],
  );
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [clientId, setClientId] = useState("todos");
  const [processId, setProcessId] = useState("todos");
  const [responsible, setResponsible] = useState("todos");
  const [title, setTitle] = useState(suggestedTitle("socios_operacional"));
  const [historyView, setHistoryView] = useState<
    "ativos" | "arquivados" | "todos"
  >("ativos");
  const [reports, setReports] = useState<Report[]>([]);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [preview, setPreview] = useState<Report | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [dataMode, setDataMode] = useState<"demo" | "supabase">("demo");
  const [briefContext, setBriefContext] = useState("");
  const [loading, setLoading] = useState(true);
  const [archiveCandidate, setArchiveCandidate] = useState<Report | null>(null);
  const responsibles = useMemo(
    () =>
      Array.from(
        new Set([
          ...clients.map((client) => client.owner),
          ...processes.map((process) => process.responsible),
        ]),
      )
        .filter(Boolean)
        .sort(),
    [clients, processes],
  );
  const filteredProcesses = useMemo(
    () =>
      clientId === "todos"
        ? processes
        : processes.filter((process) => process.client_id === clientId),
    [clientId, processes],
  );
  const selectedTemplate = useMemo(
    () =>
      reportTemplates.find((template) => template.type === selectedType) ??
      reportTemplates[0],
    [selectedType],
  );

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      const session = getCurrentSessionOrFallback();
      const nextWorkspaceId = session.workspace.id;
      const nextMode = session.mode === "supabase" ? "supabase" : "demo";
      setWorkspaceId(nextWorkspaceId);
      setDataMode(nextMode);
      setLoading(true);

      const [nextClients, nextProcesses, nextReports, nextAllReports] =
        await Promise.all([
          listClientsAsync(nextWorkspaceId, { includeArchived: true }),
          listProcessesAsync(nextWorkspaceId, { includeArchived: true }),
          listReportsAsync(nextWorkspaceId),
          listReportsAsync(nextWorkspaceId, { includeArchived: true }),
        ]);
      if (!active) return;
      setClients(nextClients);
      setProcesses(nextProcesses);
      setReports(nextReports);
      setAllReports(nextAllReports);

      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get("type") as ReportType | null;
      const reportId = params.get("reportId");
      if (
        typeParam &&
        reportTemplates.some((template) => template.type === typeParam)
      ) {
        selectTemplate(typeParam, false);
      }
      if (reportId) {
        const report = await getReportByIdAsync(reportId, nextWorkspaceId);
        if (active && report) setPreview(report);
      }
      if (active) setLoading(false);
    }
    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = toast
      ? window.setTimeout(() => setToast(null), 2400)
      : undefined;
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [toast]);

  async function refreshHistory(
    nextWorkspaceId = workspaceId,
    view = historyView,
  ) {
    const [nextReports, nextAllReports] = await Promise.all([
      listReportsAsync(nextWorkspaceId, {
        includeArchived: view === "todos",
        archivedOnly: view === "arquivados",
      }),
      listReportsAsync(nextWorkspaceId, { includeArchived: true }),
    ]);
    setReports(nextReports);
    setAllReports(nextAllReports);
  }

  function selectTemplate(type: ReportType, updateUrl = true) {
    const template =
      reportTemplates.find((item) => item.type === type) ?? reportTemplates[0];
    const period = getDefaultReportPeriod(type);
    setSelectedType(type);
    setAudience(template.audience);
    setPeriodStart(period.periodStart);
    setPeriodEnd(period.periodEnd);
    setTitle(suggestedTitle(type));
    if (type !== "cliente") setClientId("todos");
    if (updateUrl)
      window.history.replaceState(null, "", `/relatorios?type=${type}`);
  }

  function validate() {
    if (!title.trim()) return "Informe um título para o relatório.";
    if (!periodStart || !periodEnd) return "Informe o período do relatório.";
    if (new Date(periodStart) > new Date(periodEnd))
      return "A data inicial não pode ser maior que a final.";
    if (
      selectedType === "cliente" &&
      clientId === "todos" &&
      dataMode === "supabase"
    )
      return "Selecione um cliente do escritório para gerar o relatório.";
    if (selectedType === "cliente" && clientId === "todos")
      return "Relatório de cliente será gerado para todos os clientes porque nenhum cliente específico foi selecionado.";
    return null;
  }

  async function handleGenerate() {
    const warning = validate();
    if (
      warning &&
      (dataMode === "supabase" || !warning.includes("todos os clientes"))
    ) {
      setToast(warning);
      return;
    }
    setLoading(true);
    try {
      const report = await generateReportAsync({
        workspaceId,
        title,
        type: selectedType,
        audience,
        periodStart,
        periodEnd,
        clientId: clientId === "todos" ? undefined : clientId,
        processId: processId === "todos" ? undefined : processId,
        responsible: responsible === "todos" ? undefined : responsible,
      });
      await refreshHistory();
      setPreview(report);
      setToast(
        dataMode === "supabase"
          ? "Relatório gerado e salvo no histórico do escritório."
          : (warning ?? "Relatório gerado nesta demonstração."),
      );
    } catch {
      setToast(
        "Não foi possível gerar ou salvar o relatório. Verifique as permissões do escritório e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyReport(report: Report) {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(report.generated_text);
      const updated = await markReportCopiedAsync(report.id, workspaceId);
      if (updated) {
        setPreview((current) =>
          current?.id === updated.id ? updated : current,
        );
        await refreshHistory();
      }
      setCopyFallback(null);
      setToast("Relatório copiado para a área de transferência.");
    } catch {
      setCopyFallback(report.generated_text);
      setToast("Clipboard indisponível: use o campo selecionável da prévia.");
    }
  }

  function reuseReport(report: Report) {
    setSelectedType(report.type);
    setAudience(report.audience);
    setTitle(report.title);
    setPeriodStart(report.period_start);
    setPeriodEnd(report.period_end);
    setClientId(report.client_id ?? "todos");
    setProcessId(report.process_id ?? "todos");
    setResponsible(report.responsible ?? "todos");
    setPreview(null);
    setToast("Recorte reutilizado na configuração do relatório.");
    window.history.replaceState(null, "", `/relatorios?type=${report.type}`);
  }

  async function confirmArchive() {
    if (!archiveCandidate) return;
    try {
      const archived = await archiveReportAsync(
        archiveCandidate.id,
        workspaceId,
      );
      await refreshHistory();
      if (archived) setPreview(archived);
      setArchiveCandidate(null);
      setToast("Relatório arquivado sem exclusão destrutiva.");
    } catch {
      setToast("Não foi possível arquivar o relatório real.");
    }
  }

  async function handleTitleSave(report: Report) {
    try {
      const updated = await updateReportTitleAsync(
        report.id,
        draftTitle,
        workspaceId,
      );
      if (updated) setPreview(updated);
      await refreshHistory();
      setEditingTitle(false);
      setToast(
        dataMode === "supabase"
          ? "Título atualizado no relatório real."
          : "Título atualizado nesta demonstração.",
      );
    } catch {
      setToast("Não foi possível atualizar o título do relatório.");
    }
  }

  function changeHistoryView(view: "ativos" | "arquivados" | "todos") {
    setHistoryView(view);
    void refreshHistory(workspaceId, view);
  }

  const activeReports = allReports.filter((report) => !report.archived_at);
  const pendingReview = activeReports.filter((report) => report.status === "generated");
  const weekThreshold = new Date();
  weekThreshold.setDate(weekThreshold.getDate() - 7);
  const reportsThisWeek = activeReports.filter(
    (report) => new Date(report.created_at) >= weekThreshold,
  );
  const latestReport = [...activeReports].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const executiveIndicators = [
    { label: "Relatórios gerados", value: activeReports.length, detail: "histórico ativo", tone: "border-lexos-gold/50" },
    { label: "Pendentes de revisão", value: pendingReview.length, detail: "exigem leitura humana", tone: "border-lexos-wine/60" },
    { label: "Relatórios da semana", value: reportsThisWeek.length, detail: "últimos 7 dias", tone: "border-lexos-green/45" },
    { label: "Última leitura", value: latestReport ? formatDate(latestReport.created_at) : "—", detail: latestReport ? "registro mais recente" : "sem histórico", tone: "border-cyan-300/35" },
    { label: "Modelos disponíveis", value: frequentTemplates.length, detail: "recortes frequentes", tone: "border-lexos-line" },
    { label: "Arquivados", value: allReports.filter((report) => report.archived_at).length, detail: "consulta preservada", tone: "border-lexos-line" },
  ];

  return (
    <AppLayout>
      <RestrictedAccess module="relatorios">
        <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
          <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lexos-cyan">Central executiva</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">Relatórios</h1>
                <p className="mt-2 text-sm leading-6 text-lexos-silver">Leituras executivas, históricos e saídas internas para revisão humana.</p>
                <span className="mt-3 inline-flex rounded-full border border-lexos-gold/30 bg-lexos-gold/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-goldSoft">Uso interno · revisão obrigatória · sem envio automático externo</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button className="calm-primary-action" onClick={() => document.getElementById("gerar-relatorio")?.scrollIntoView({ behavior: "smooth" })} type="button">Gerar relatório</button>
                <button className="calm-secondary-action" onClick={() => document.getElementById("historico-relatorios")?.scrollIntoView({ behavior: "smooth" })} type="button">Ver histórico</button>
              </div>
            </div>
          </section>

          <section aria-label="Indicadores de relatórios" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {executiveIndicators.map((indicator) => (
              <article className={cn("calm-metric-card border text-left", indicator.tone)} key={indicator.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">{indicator.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{indicator.value}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-lexos-muted">{indicator.detail}</p>
              </article>
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.34fr)_minmax(340px,0.66fr)]">
            <SectionCard eyebrow="Leitura prioritária" title="Relatórios recentes" className="xl:row-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-lexos-line/70 pb-3" id="historico-relatorios">
                <p className="text-sm text-lexos-muted">Abra primeiro os itens com revisão pendente.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["ativos", "arquivados", "todos"] as const).map((view) => (
                    <button className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition", historyView === view ? "border-lexos-gold bg-lexos-gold/15 text-lexos-gold" : "border-lexos-line text-lexos-muted hover:border-lexos-gold hover:text-white")} key={view} onClick={() => changeHistoryView(view)} type="button">{view}</button>
                  ))}
                </div>
              </div>
              {reports.length ? (
                <div className="max-h-[690px] space-y-2.5 overflow-y-auto pr-1 premium-scrollbar">
                  {reports.map((report, index) => (
                    <article className={cn("calm-record-card border transition", report.status === "generated" && !report.archived_at ? "border-lexos-gold/28 bg-lexos-gold/[0.035]" : "border-lexos-line/45")} key={report.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {index === 0 && report.status === "generated" && !report.archived_at ? <span className="rounded-full border border-lexos-gold/40 bg-lexos-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lexos-gold">Abrir primeiro</span> : null}
                            <StatusBadge status={reportStatusLabel[report.status]} />
                          </div>
                          <h3 className="mt-2 text-base font-semibold text-white">{report.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-lexos-muted">{reportTypeLabel(report.type)} <span className="text-lexos-line">•</span> {formatDate(report.period_start)} a {formatDate(report.period_end)}</p>
                        </div>
                        <p className="shrink-0 text-xs text-lexos-muted">{report.responsible ? `Responsável: ${report.responsible}` : "Origem: LEX.OS Control"}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-lexos-silver">{report.summary}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.055] pt-3">
                        <button className="rounded-full bg-lexos-cyan px-3 py-1.5 text-xs font-semibold text-lexos-ink transition hover:bg-white" onClick={() => setPreview(report)} type="button">Abrir</button>
                        <button className="rounded-full bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white" onClick={() => copyReport(report)} type="button">Copiar</button>
                        <button className="rounded-full bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white" onClick={() => reuseReport(report)} type="button">Reutilizar</button>
                        {!report.archived_at ? <button className="rounded-full bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white" onClick={() => setArchiveCandidate(report)} type="button">Arquivar</button> : null}
                        <span className="ml-auto text-[11px] text-lexos-muted">Criado em {formatDate(report.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="Nenhum relatório neste recorte." description="Gere uma leitura executiva ou altere o filtro do histórico para consultar relatórios preservados." actionLabel="Gerar primeiro relatório" onAction={() => document.getElementById("gerar-relatorio")?.scrollIntoView({ behavior: "smooth" })} />}
            </SectionCard>

            <SectionCard eyebrow="Bancada operacional" title="Gerar novo relatório" className="xl:row-span-2">
              <div id="gerar-relatorio" className="rounded-2xl border border-lexos-cyan/18 bg-lexos-cyan/[0.055] p-3">
                <p className="text-xs font-semibold text-lexos-goldSoft">{selectedTemplate.title}</p>
                <p className="mt-1 text-xs leading-5 text-lexos-muted">Configure um recorte objetivo e gere uma saída interna revisável.</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block text-xs font-medium text-lexos-muted sm:col-span-2 xl:col-span-1 2xl:col-span-2">Tipo de relatório<select className="premium-input mt-1.5 w-full" onChange={(event) => selectTemplate(event.target.value as ReportType)} value={selectedType}>{reportTemplates.map((template) => <option key={template.type} value={template.type}>{template.title}</option>)}</select></label>
                <label className="block text-xs font-medium text-lexos-muted">Período inicial<input className="premium-input mt-1.5 w-full" onChange={(event) => setPeriodStart(event.target.value)} type="date" value={periodStart} /></label>
                <label className="block text-xs font-medium text-lexos-muted">Período final<input className="premium-input mt-1.5 w-full" onChange={(event) => setPeriodEnd(event.target.value)} type="date" value={periodEnd} /></label>
                <label className="block text-xs font-medium text-lexos-muted sm:col-span-2 xl:col-span-1 2xl:col-span-2">Módulo / contexto<select className="premium-input mt-1.5 w-full" onChange={(event) => { setClientId(event.target.value); setProcessId("todos"); }} value={clientId}><option value="todos">Visão consolidada do escritório</option>{clients.map((client) => <option key={client.id} value={client.id}>Cliente · {client.name}</option>)}</select></label>
                <label className="block text-xs font-medium text-lexos-muted sm:col-span-2 xl:col-span-1 2xl:col-span-2">Contexto breve<textarea className="premium-input mt-1.5 min-h-[72px] w-full resize-none" onChange={(event) => setBriefContext(event.target.value)} placeholder="Ex.: destacar riscos, pendências e próximos movimentos." value={briefContext} /></label>
              </div>
              <button className="calm-primary-action mt-3 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={handleGenerate} type="button">{loading ? "Processando..." : "Gerar relatório assistido"}</button>
              <p className="mt-3 rounded-xl border border-lexos-gold/22 bg-lexos-gold/[0.065] p-2.5 text-xs leading-5 text-lexos-goldSoft">Revisão humana obrigatória antes de qualquer uso externo. Nenhum envio é realizado automaticamente.</p>
            </SectionCard>
          </div>

          <SectionCard eyebrow="Atalhos frequentes" title="Modelos de relatório">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {frequentTemplates.map((item) => {
                const template = reportTemplates.find((candidate) => candidate.type === item.type)!;
                return <article className="calm-record-card border border-lexos-line/45 transition hover:border-lexos-cyan/20" key={item.title}>
                  <span className="rounded-full border border-lexos-cyan/24 bg-lexos-cyan/[0.055] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lexos-cyan">{item.category}</span>
                  <h3 className="mt-2.5 font-semibold text-white">{item.title}</h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-lexos-muted">{template.description}</p>
                  <button className="mt-3 text-xs font-semibold text-lexos-gold transition hover:text-lexos-goldSoft" onClick={() => { selectTemplate(item.type); document.getElementById("gerar-relatorio")?.scrollIntoView({ behavior: "smooth" }); }} type="button">Usar modelo →</button>
                </article>;
              })}
            </div>
          </SectionCard>

          <section className="rounded-[1.25rem] border border-white/[0.055] bg-white/[0.026] p-3.5">
            <div className="grid gap-3 md:grid-cols-[1.1fr_repeat(3,minmax(0,1fr))] md:items-center">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lexos-gold">Governança</p><h2 className="mt-1 text-base font-semibold text-white">Relatórios são apoio interno</h2></div>
              {["Revisão humana obrigatória", "Sem envio automático", "Histórico preservado para consulta"].map((item) => <p className="border-l border-lexos-cyan/18 pl-3 text-sm leading-5 text-lexos-silver" key={item}>{item}</p>)}
            </div>
          </section>
        </div>
        {toast ? (
          <div className="fixed bottom-5 right-5 z-[80] rounded-2xl border border-lexos-gold/40 bg-lexos-panel px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium">
            {toast}
          </div>
        ) : null}

        {preview ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-lexos-ink/82 p-4 backdrop-blur-sm">
            <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.6rem] border border-lexos-gold/28 bg-[#0a1424] shadow-[0_28px_110px_rgba(0,0,0,0.72)]">
              <header className="border-b border-lexos-line bg-lexos-panel/95 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">
                      Prévia executiva • saída revisável
                    </p>
                    {editingTitle ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          className="min-w-[280px] flex-1 rounded-xl border border-lexos-line bg-lexos-ink px-4 py-3 text-white outline-none focus:border-lexos-gold"
                          onChange={(event) =>
                            setDraftTitle(event.target.value)
                          }
                          value={draftTitle}
                        />
                        <button
                          className="rounded-xl border border-lexos-gold/40 px-4 py-3 text-sm font-semibold text-lexos-gold"
                          onClick={() => handleTitleSave(preview)}
                          type="button"
                        >
                          Salvar
                        </button>
                      </div>
                    ) : (
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {preview.title}
                      </h2>
                    )}
                    <p className="mt-2 text-sm text-lexos-muted">
                      {reportTypeLabel(preview.type)} •{" "}
                      {audienceLabels[preview.audience]} •{" "}
                      {formatDate(preview.period_start)} a{" "}
                      {formatDate(preview.period_end)} • gerado em{" "}
                      {formatDate(preview.created_at)} • ID local {preview.id}
                    </p>
                  </div>
                  <button
                    className="rounded-xl border border-lexos-line px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white"
                    onClick={() => setPreview(null)}
                    type="button"
                  >
                    Fechar
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-5 premium-scrollbar">
                <div className="rounded-2xl border border-lexos-gold/25 bg-lexos-gold/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">
                    Resumo executivo
                  </p>
                  <p className="mt-2 text-sm leading-7 text-lexos-silver">
                    {preview.summary}
                  </p>
                </div>

                <div className="mt-4 rounded-2xl border border-lexos-gold/22 bg-lexos-gold/[0.065] p-4 text-sm leading-6 text-lexos-goldSoft">
                  Conteúdo gerado para uso interno. Revisão humana
                  obrigatória antes de uso externo.
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {preview.metrics.map((item) => (
                    <div
                      className={cn(
                        "calm-record-card border p-4",
                        metricTone[item.severity ?? "info"],
                      )}
                      key={item.label}
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-lexos-muted">
                        {humanizeLabel(item.label)}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {item.value}
                      </p>
                      {item.detail ? (
                        <p className="mt-1 text-xs">{item.detail}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {[
                    {
                      title: "Pontos de atenção",
                      text: sectionDigest(
                        preview,
                        ["atenção", "tarefas", "prazos", "gargalo"],
                        "Manter monitoramento da carteira e validar pendências operacionais antes de encaminhamento externo.",
                      ),
                    },
                    {
                      title: "Riscos",
                      text: sectionDigest(
                        preview,
                        ["risco", "vencidos", "inadimpl"],
                        "Sem risco crítico isolado no recorte, com recomendação de revisão humana do contexto jurídico e financeiro.",
                      ),
                    },
                    {
                      title: "Recomendações e próximas providências",
                      text: sectionDigest(
                        preview,
                        ["ações", "próxim", "recomenda", "cobrança"],
                        "Definir responsável, prazo de retorno e próximo movimento antes de circular a versão final.",
                      ),
                    },
                  ].map((block) => (
                    <article
                      className="rounded-2xl border border-white/[0.055] bg-white/[0.026] p-4"
                      key={block.title}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-gold">
                        {block.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-lexos-silver">
                        {block.text}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {preview.sections.map((section) => (
                    <article
                      className={cn(
                        "calm-record-card border p-4",
                        metricTone[section.severity ?? "info"],
                      )}
                      key={section.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-white">
                          {section.title}
                        </h3>
                        {section.source ? (
                          <span className="rounded-full border border-lexos-line px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-lexos-muted">
                            {section.source}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-lexos-silver">
                        {section.content}
                      </p>
                      {section.items?.length ? (
                        <ul className="mt-3 space-y-2 text-sm leading-5 text-lexos-muted">
                          {section.items.map((item) => (
                            <li
                              className="rounded-xl bg-white/[0.026] px-3 py-2"
                              key={item}
                            >
                              • {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>

                {copyFallback ? (
                  <textarea
                    className="mt-5 h-44 w-full rounded-2xl border border-lexos-gold/35 bg-lexos-ink p-4 text-sm leading-6 text-lexos-silver outline-none"
                    readOnly
                    value={copyFallback}
                  />
                ) : null}
              </div>

              <footer className="flex flex-wrap gap-3 border-t border-white/[0.055] bg-lexos-panel/90 p-5">
                <button
                  className="rounded-full bg-lexos-cyan px-4 py-2.5 text-sm font-semibold text-lexos-ink transition hover:bg-white"
                  onClick={() => copyReport(preview)}
                  type="button"
                >
                  Copiar relatório
                </button>
                <button
                  className="rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                  onClick={() => downloadText(preview)}
                  type="button"
                >
                  Baixar .md
                </button>
                <button
                  className="rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                  onClick={() => reuseReport(preview)}
                  type="button"
                >
                  Reutilizar recorte
                </button>
                <button
                  className="rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                  onClick={() => {
                    setDraftTitle(preview.title);
                    setEditingTitle(true);
                  }}
                  type="button"
                >
                  Editar título
                </button>
                {!preview.archived_at ? (
                  <button
                    className="rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                    onClick={() => setArchiveCandidate(preview)}
                    type="button"
                  >
                    Arquivar relatório
                  </button>
                ) : null}
                <button
                  className="ml-auto rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                  onClick={() => setPreview(null)}
                  type="button"
                >
                  Fechar
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {archiveCandidate ? (
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-lexos-ink/78 p-4 backdrop-blur-sm">
            <section className="w-full max-w-lg rounded-[1.6rem] border border-lexos-gold/30 bg-lexos-panel p-5 shadow-premium">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lexos-gold">
                Arquivamento seguro
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Arquivar relatório?
              </h2>
              <p className="mt-3 text-sm leading-6 text-lexos-silver">
                O relatório “{archiveCandidate.title}” não será excluído. Ele
                sairá da lista principal e ficará disponível no filtro de
                arquivados.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  className="rounded-full bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.08] hover:text-white"
                  onClick={() => setArchiveCandidate(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-xl border border-lexos-gold/50 bg-lexos-gold/15 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/20"
                  onClick={confirmArchive}
                  type="button"
                >
                  Arquivar sem excluir
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </RestrictedAccess>
    </AppLayout>
  );
}
