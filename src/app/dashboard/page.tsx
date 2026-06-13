"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentSessionOrFallback } from "@/lib/auth/session";
import { ACTIVITY_LOGS_UPDATED_EVENT } from "@/lib/data/activityLogs";
import { AGENDA_UPDATED_EVENT } from "@/lib/data/agenda";
import { CENTRAL_EXECUTIONS_UPDATED_EVENT } from "@/lib/data/centralExecutions";
import { CLIENTS_UPDATED_EVENT, FALLBACK_WORKSPACE_ID } from "@/lib/data/clients";
import { buildDashboardSummary, buildDashboardSummaryAsync, type DashboardMetric, type DashboardPriority, type DashboardSummary, type DashboardTone } from "@/lib/data/dashboard";
import { FINANCE_UPDATED_EVENT, formatCurrency } from "@/lib/data/finance";
import { PARTNERSHIPS_UPDATED_EVENT } from "@/lib/data/partnerships";
import { PROCESSES_UPDATED_EVENT } from "@/lib/data/processes";
import { REPORTS_UPDATED_EVENT } from "@/lib/data/reports";
import { TASKS_UPDATED_EVENT } from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

const eventNames = [
  CLIENTS_UPDATED_EVENT,
  PROCESSES_UPDATED_EVENT,
  TASKS_UPDATED_EVENT,
  AGENDA_UPDATED_EVENT,
  FINANCE_UPDATED_EVENT,
  PARTNERSHIPS_UPDATED_EVENT,
  REPORTS_UPDATED_EVENT,
  CENTRAL_EXECUTIONS_UPDATED_EVENT,
  ACTIVITY_LOGS_UPDATED_EVENT,
  "storage",
];

const toneClasses: Record<DashboardTone, string> = {
  neutral: "text-lexos-silver",
  premium: "text-lexos-cyan",
  positive: "text-lexos-green",
  warning: "text-lexos-goldSoft",
  urgent: "text-lexos-red/90",
  critical: "text-lexos-red/90",
};

const buttonClasses = "inline-flex items-center justify-center rounded-full bg-lexos-cyan px-4 py-2 text-sm font-semibold text-lexos-ink transition hover:bg-white";
const secondaryButtonClasses = "inline-flex items-center justify-center rounded-full bg-white/[0.055] px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:bg-white/[0.09] hover:text-white";

type ExecutiveMetric = Pick<DashboardMetric, "id" | "label" | "value" | "detail" | "tone" | "route">;
type ModuleStatus = "alimentado" | "em atenção" | "sem dados" | "restrito" | "demonstração";
type RecommendedAction = {
  id: string;
  category: string;
  priority: DashboardPriority;
  title: string;
  reason: string;
  impact: string;
  suggestedAction: string;
  route: string;
  actionLabel: string;
};

type ModuleCard = {
  label: string;
  value: string;
  detail: string;
  status: ModuleStatus;
  route: string;
};

function getMetric(summary: DashboardSummary, id: string) {
  return summary.metrics.find((metric) => metric.id === id);
}

function executiveMetrics(summary: DashboardSummary): ExecutiveMetric[] {
  const clients = getMetric(summary, "clients-no-return");
  const riskProcesses = getMetric(summary, "active-processes");
  const overdueTasks = getMetric(summary, "overdue-tasks");
  const deadlines = getMetric(summary, "urgent-deadlines");
  const overdueValues = getMetric(summary, "overdue-values");
  const receivable = getMetric(summary, "receivable");
  const central = getMetric(summary, "central-usage");

  return [
    { id: "clients-attention", label: "Clientes em atenção", value: String(summary.counts.clients.semRetorno), detail: "follow-up recomendado", tone: summary.counts.clients.semRetorno ? "warning" : "positive", route: clients?.route ?? "/clientes" },
    { id: "active-processes", label: "Processos ativos", value: String(summary.counts.processes.ativos), detail: "carteira operacional", tone: summary.counts.processes.ativos ? "neutral" : "warning", route: "/processos" },
    { id: "risk-processes", label: "Processos de risco", value: String(summary.counts.processes.risco), detail: "alto ou crítico", tone: summary.counts.processes.risco ? "urgent" : "positive", route: riskProcesses?.route ?? "/processos" },
    { id: "urgent-tasks", label: "Tarefas vencidas / urgentes", value: String(summary.counts.tasks.atrasadas + summary.counts.tasks.urgentes), detail: `${summary.counts.tasks.atrasadas} vencida(s)`, tone: summary.counts.tasks.atrasadas || summary.counts.tasks.urgentes ? "urgent" : "positive", route: overdueTasks?.route ?? "/tarefas" },
    { id: "deadlines", label: "Prazos próximos", value: String(summary.counts.agenda.prazosUrgentes), detail: "próximos 7 dias", tone: summary.counts.agenda.prazosUrgentes ? "warning" : "positive", route: deadlines?.route ?? "/agenda" },
    { id: "overdue-finance", label: "Financeiro vencido", value: formatCurrency(summary.counts.finance.vencidos), detail: `${summary.counts.finance.cobrancasPendentes} cobrança(s) pendente(s)`, tone: summary.counts.finance.vencidos ? "urgent" : "positive", route: overdueValues?.route ?? "/financeiro" },
    { id: "receivable", label: "Valores a receber", value: formatCurrency(summary.counts.finance.receber), detail: "caixa em acompanhamento", tone: "premium", route: receivable?.route ?? "/financeiro" },
    { id: "central-reports", label: "Central / relatórios", value: `${summary.counts.central.execucoes} / ${summary.counts.reports.gerados}`, detail: "execuções / relatórios", tone: summary.counts.central.execucoes || summary.counts.reports.gerados ? "positive" : "warning", route: central?.route ?? "/central-lexos" },
  ];
}

function recommendedActions(summary: DashboardSummary): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  if (summary.counts.tasks.atrasadas || summary.counts.tasks.urgentes) actions.push({ id: "tasks", category: "Tarefas", priority: "urgente", title: "Repriorizar tarefas vencidas e urgentes", reason: `Existem ${summary.counts.tasks.atrasadas} tarefa(s) vencida(s) e ${summary.counts.tasks.urgentes} urgente(s) na fila operacional.`, impact: "Reduz risco de estouro de prazo, retrabalho e perda de previsibilidade.", suggestedAction: "Abrir Tarefas e reordenar a fila crítica por responsável.", route: "/tarefas?status=atrasada", actionLabel: "Abrir Tarefas" });
  if (summary.counts.finance.vencidos) actions.push({ id: "finance", category: "Financeiro", priority: "alta", title: "Acionar cobrança consultiva para vencidos", reason: `${formatCurrency(summary.counts.finance.vencidos)} estão vencidos e pedem tratamento ativo.`, impact: "Protege o caixa sem perder a qualidade do relacionamento com o cliente.", suggestedAction: "Abrir Financeiro, revisar vencidos e registrar a próxima ação.", route: "/financeiro?view=vencidos", actionLabel: "Abrir Financeiro" });
  if (summary.counts.processes.risco) actions.push({ id: "processes", category: "Processos", priority: "alta", title: "Revisar processos de risco alto", reason: `${summary.counts.processes.risco} processo(s) apresentam risco alto ou crítico.`, impact: "Concentra revisão humana onde a exposição jurídica é mais relevante.", suggestedAction: "Abrir Processos e validar estratégia, prazo e responsável.", route: "/processos?risk=alto", actionLabel: "Abrir Processos" });
  if (summary.counts.clients.semRetorno) actions.push({ id: "clients", category: "Clientes", priority: "média", title: "Conferir clientes sem retorno recente", reason: `${summary.counts.clients.semRetorno} cliente(s) exigem follow-up ou atualização de contexto.`, impact: "Melhora percepção de acompanhamento e reduz pendências silenciosas.", suggestedAction: "Abrir Clientes e organizar retornos consultivos prioritários.", route: "/clientes?status=atenção", actionLabel: "Abrir Clientes" });
  actions.push({ id: "reports", category: "Gestão", priority: summary.counts.reports.semana ? "média" : "alta", title: "Gerar relatório executivo para os sócios", reason: summary.counts.reports.semana ? "A visão consolidada deve acompanhar a tomada de decisão da semana." : "Ainda não há relatório executivo registrado nos últimos 7 dias.", impact: "Transforma os sinais da operação em pauta objetiva para gestão.", suggestedAction: "Abrir Relatórios e gerar a leitura operacional para sócios.", route: "/relatorios?type=socios_operacional", actionLabel: "Gerar relatório" });
  return actions.slice(0, 5);
}

function moduleMap(summary: DashboardSummary, strategicProfile: boolean): ModuleCard[] {
  const hasFinanceAttention = summary.counts.finance.vencidos > 0;
  const hasTaskAttention = summary.counts.tasks.atrasadas + summary.counts.tasks.urgentes > 0;
  return [
    { label: "Clientes", value: String(summary.counts.clients.ativos + summary.counts.clients.atencao + summary.counts.clients.prospects), detail: "cadastros acompanhados", status: summary.counts.clients.semRetorno ? "em atenção" : summary.counts.clients.ativos ? "alimentado" : "sem dados", route: "/clientes" },
    { label: "Processos", value: String(summary.counts.processes.ativos), detail: "ativos na carteira", status: summary.counts.processes.risco ? "em atenção" : summary.counts.processes.ativos ? "alimentado" : "sem dados", route: "/processos" },
    { label: "Tarefas", value: String(summary.counts.tasks.operacionais), detail: "pendências operacionais", status: hasTaskAttention ? "em atenção" : summary.counts.tasks.operacionais ? "alimentado" : "sem dados", route: "/tarefas" },
    { label: "Agenda", value: String(summary.counts.agenda.semana), detail: "itens em 7 dias", status: summary.counts.agenda.prazosUrgentes ? "em atenção" : summary.counts.agenda.semana ? "alimentado" : "sem dados", route: "/agenda" },
    { label: "Financeiro", value: formatCurrency(summary.counts.finance.receber), detail: "a receber", status: hasFinanceAttention ? "em atenção" : summary.counts.finance.receber ? "alimentado" : "sem dados", route: "/financeiro" },
    { label: "Relatórios", value: String(summary.counts.reports.gerados), detail: "gerados no ambiente", status: summary.counts.reports.gerados ? "alimentado" : "sem dados", route: "/relatorios" },
    { label: "Central LEX.OS", value: String(summary.counts.central.execucoes), detail: "execuções registradas", status: summary.counts.central.execucoes ? "alimentado" : "demonstração", route: "/central-lexos" },
    { label: "Painel dos Sócios", value: strategicProfile ? "Ativo" : "Perfil", detail: strategicProfile ? "leitura estratégica" : "acesso por permissão", status: strategicProfile ? "alimentado" : "restrito", route: "/socios" },
    { label: "Configurações / implantação", value: "Local", detail: "ambiente controlado", status: "demonstração", route: "/configuracoes/release" },
  ];
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-cyan">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">{title}</h2>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-5 text-lexos-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function ExecutiveCard({ metric }: { metric: ExecutiveMetric }) {
  return (
    <Link className="group rounded-[1.15rem] bg-white/[0.032] px-4 py-3.5 shadow-[0_10px_28px_rgba(0,0,0,0.065)] transition hover:bg-white/[0.052]" href={metric.route}>
      <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-lexos-muted">{metric.label}</span>
      <span className="mt-2 block text-2xl font-semibold tracking-[-0.045em] text-white">{metric.value}</span>
      <span className={cn("mt-2.5 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.1em]", toneClasses[metric.tone])}>
        <span>{metric.detail}</span>
        <span className="text-sm text-lexos-muted transition group-hover:text-lexos-cyan">↗</span>
      </span>
    </Link>
  );
}

function SecondaryMetric({ metric }: { metric: ExecutiveMetric }) {
  return (
    <Link className="group flex items-center justify-between gap-3 border-b border-white/[0.055] py-2.5 last:border-b-0" href={metric.route}>
      <span>
        <span className="block text-xs text-lexos-muted transition group-hover:text-lexos-silver">{metric.label}</span>
        <span className="mt-0.5 block text-sm font-semibold text-white">{metric.value}</span>
      </span>
      <span className={cn("max-w-[132px] text-right text-[10px] font-medium uppercase tracking-[0.1em]", toneClasses[metric.tone])}>{metric.detail}</span>
    </Link>
  );
}

function ModuleTile({ module }: { module: ModuleCard }) {
  return (
    <Link className="group rounded-xl bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/[0.048]" href={module.route}>
      <span className="text-xs font-semibold text-lexos-silver transition group-hover:text-white">{module.label}</span>
      <span className="mt-1.5 block text-lg font-semibold tracking-[-0.03em] text-lexos-cyan">{module.value}</span>
      <span className="mt-0.5 block text-[11px] text-lexos-muted">{module.detail}</span>
      <span className="mt-1 block text-[10px] capitalize tracking-[0.06em] text-lexos-muted/90">{module.status}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(() => buildDashboardSummary(FALLBACK_WORKSPACE_ID));
  const session = useMemo(() => getCurrentSessionOrFallback(), []);
  const metrics = useMemo(() => executiveMetrics(summary), [summary]);
  const actions = useMemo(() => recommendedActions(summary), [summary]);
  const primaryMetrics = metrics.slice(0, 4);
  const secondaryMetrics = metrics.slice(4);
  const modules = useMemo(() => moduleMap(summary, session.user.profile === "socio"), [summary, session.user.profile]);
  const weekItems = summary.weekAgenda.flatMap((day) => day.items.map((item) => ({ ...item, dayLabel: day.dayLabel, shortDate: day.shortDate }))).slice(0, 7);
  const derivedItems = summary.todayItems.filter((item) => item.type.toLowerCase().includes("tarefa") || item.type.toLowerCase().includes("prazo")).slice(0, 3);
  const hasImmediateAttention = summary.counts.tasks.atrasadas + summary.counts.tasks.urgentes + summary.counts.processes.risco > 0 || summary.counts.finance.vencidos > 0;
  const generalSituation = summary.health.status === "Crítica" ? "operação exige priorização" : summary.health.status === "Atenção" ? "atenção elevada" : "operação saudável";
  const executiveHealthSummary = summary.health.status === "Crítica"
    ? "Há uma combinação relevante de vencidos, atrasos e riscos processuais. A leitura pede priorização executiva e revisão humana diária."
    : summary.health.status === "Atenção"
      ? "Há pontos de atenção que merecem acompanhamento próximo, com priorização objetiva e revisão humana antes da rotina ordinária."
      : summary.health.summary;

  useEffect(() => {
    let active = true;
    const refresh = () => void buildDashboardSummaryAsync(session.workspace.id || FALLBACK_WORKSPACE_ID).then((nextSummary) => { if (active) setSummary(nextSummary); });
    refresh();
    eventNames.forEach((name) => window.addEventListener(name, refresh));
    return () => {
      active = false;
      eventNames.forEach((name) => window.removeEventListener(name, refresh));
    };
  }, [session.workspace.id]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1540px] space-y-8 pb-4">
        <section className="overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_top_left,rgba(85,201,214,0.105),transparent_40%),linear-gradient(135deg,rgba(18,37,59,0.92),rgba(8,18,33,0.82))] px-5 py-6 shadow-[0_18px_46px_rgba(0,0,0,0.14)] lg:px-7 lg:py-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-end">
            <div className="max-w-5xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-cyan">Visão geral • inteligência operacional</p>
              <h1 className="mt-2.5 max-w-4xl text-3xl font-semibold tracking-[-0.05em] text-white md:text-[2.75rem] md:leading-[1.06]">Bom dia. Vamos organizar os próximos movimentos do escritório.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-lexos-silver">Uma leitura consolidada da carteira, prazos, tarefas, financeiro, clientes e uso da Central LEX.OS para apoiar decisões calmas, objetivas e sempre validadas por pessoas.</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link className={buttonClasses} href="/central-lexos">Abrir Central LEX.OS</Link>
                <Link className={secondaryButtonClasses} href="/socios">Ver Painel dos Sócios</Link>
              </div>
            </div>
            <div className="border-l border-white/[0.08] pl-4 xl:pl-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-cyan">Leitura de hoje</p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] text-white">{hasImmediateAttention ? "Há pontos para priorizar" : "Operação sob controle"}</p>
              <p className="mt-1.5 text-sm leading-5 text-lexos-silver">{hasImmediateAttention ? "Alguns sinais operacionais ou financeiros merecem revisão humana antes da rotina ordinária." : "Não há sinais críticos no consolidado atual. Antecipe revisões e mantenha os módulos alimentados."}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">{session.workspace.name}</p>
            </div>
          </div>
          <p className="mt-5 border-t border-white/[0.06] pt-3 text-xs leading-5 text-lexos-muted">Ambiente de demonstração/local. Dados fictícios ou salvos no navegador. Nenhuma saída externa automática. <span className="text-lexos-goldSoft">Revisão humana obrigatória.</span></p>
        </section>

        <section aria-label="Indicadores executivos">
          <SectionHeading eyebrow="Panorama executivo" title="O essencial para começar o dia" description="Quatro sinais principais para orientar a leitura antes de aprofundar a rotina operacional." />
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {primaryMetrics.map((metric) => <ExecutiveCard key={metric.id} metric={metric} />)}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="rounded-[1.45rem] bg-lexos-card/20 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.07)] lg:p-5">
              <SectionHeading eyebrow="Rotina operacional" title="Próximos compromissos" description="Agenda, prazos e movimentos derivados da operação em uma leitura contínua para os próximos 7 dias." action={<Link className="text-sm font-semibold text-lexos-cyan transition hover:text-white" href="/agenda">Ver agenda →</Link>} />
              <div className="mt-4">
                {weekItems.length ? weekItems.map((item) => (
                  <Link className="group grid gap-1 border-b border-white/[0.055] px-1 py-3 last:border-b-0 sm:grid-cols-[132px_1fr] sm:gap-4" href={item.route} key={`${item.id}-${item.dayLabel}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-cyan">{item.dayLabel} • {item.shortDate}</p>
                    <div>
                      <p className="font-semibold text-white transition group-hover:text-lexos-cyan">{item.title}</p>
                      <p className="mt-1 text-sm text-lexos-muted">{item.type} • {item.linked} • {item.owner}</p>
                    </div>
                  </Link>
                )) : <p className="py-3 text-sm leading-5 text-lexos-muted">Nenhum compromisso manual nos próximos 7 dias. Verifique tarefas e prazos derivados da operação.</p>}
              </div>
              {derivedItems.length ? (
                <div className="mt-3 border-t border-white/[0.055] pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lexos-muted">Derivados da operação</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {derivedItems.map((item) => <Link className="text-xs text-lexos-silver transition hover:text-lexos-cyan" href={item.route} key={`derived-${item.id}`}>{item.type}: {item.title}</Link>)}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[1.45rem] bg-lexos-card/16 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.06)] lg:p-5">
              <SectionHeading eyebrow="Prioridades" title="Onde vale concentrar a atenção humana" description="Uma fila executiva limpa para revisar os pontos mais relevantes sem transformar toda a rotina em alerta." />
              <div className="mt-3">
                {actions.map((action) => (
                  <article className="grid gap-2 border-b border-white/[0.055] px-1 py-3.5 last:border-b-0 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)_auto] lg:items-center" key={action.id}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">{action.category}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", action.priority === "urgente" ? "bg-lexos-wine/18 text-lexos-red" : "bg-white/[0.05] text-lexos-muted")}>{action.priority}</span>
                      </div>
                      <h3 className="mt-1 font-semibold leading-5 text-white">{action.title}</h3>
                    </div>
                    <div className="text-xs leading-5 text-lexos-muted">
                      <p><strong className="font-semibold text-lexos-silver">Motivo:</strong> {action.reason}</p>
                      <p className="mt-0.5"><strong className="font-semibold text-lexos-silver">Impacto:</strong> {action.impact}</p>
                      <p className="mt-0.5"><strong className="font-semibold text-lexos-silver">Ação:</strong> {action.suggestedAction}</p>
                    </div>
                    <Link className="text-xs font-semibold text-lexos-cyan transition hover:text-white" href={action.route}>{action.actionLabel} →</Link>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="rounded-[1.45rem] bg-gradient-to-b from-lexos-card/30 to-lexos-card/16 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.07)] lg:p-5">
            <SectionHeading eyebrow="Leitura executiva" title="Pontos de atenção" />
            <div className="mt-4 border-b border-white/[0.06] pb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-lexos-muted">Saúde operacional</p>
              <p className="mt-1.5 text-xl font-semibold capitalize tracking-[-0.03em] text-white">{generalSituation}</p>
              <p className="mt-1.5 text-sm leading-5 text-lexos-silver">{executiveHealthSummary}</p>
            </div>
            <dl className="mt-2">
              <HealthLine label="Principal gargalo" value={summary.health.bottleneck} />
              <HealthLine label="Risco financeiro" value={summary.counts.finance.vencidos ? `${formatCurrency(summary.counts.finance.vencidos)} vencidos em acompanhamento.` : "Sem valores vencidos relevantes no consolidado atual."} />
              <HealthLine label="Risco de prazo" value={summary.counts.agenda.prazosUrgentes || summary.counts.tasks.atrasadas ? `${summary.counts.agenda.prazosUrgentes} prazo(s) próximo(s) e ${summary.counts.tasks.atrasadas} tarefa(s) vencida(s).` : "Sem estouros ou prazos urgentes sinalizados no consolidado atual."} />
              <HealthLine label="Recomendação da semana" value={summary.health.recommendedPriority} />
            </dl>
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lexos-muted">Sinais complementares</p>
              <div className="mt-1">
                {secondaryMetrics.map((metric) => <SecondaryMetric key={metric.id} metric={metric} />)}
              </div>
            </div>
          </aside>
        </section>

        <section>
          <SectionHeading eyebrow="Mapa da operação" title="Frentes do escritório" description="Aprofunde um módulo quando necessário. O mapa permanece disponível sem competir com a rotina prioritária." />
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {modules.map((module) => <ModuleTile key={module.label} module={module} />)}
          </div>
        </section>

        <section className="border-t border-white/[0.06] pt-4">
          <SectionHeading eyebrow="Primeiros movimentos" title="Jornada recomendada para alimentar o escritório" description="Uma sequência simples para consolidar a base operacional com apoio controlado da Central LEX.OS." />
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            {[
              ["Configurações", "/configuracoes"],
              ["Clientes", "/clientes"],
              ["Processos", "/processos"],
              ["Tarefas / Agenda", "/tarefas"],
              ["Financeiro", "/financeiro"],
              ["Relatórios / Painel", "/relatorios"],
              ["Central LEX.OS", "/central-lexos"],
            ].map(([label, route], index, journey) => (
              <span className="flex items-center gap-2" key={label}>
                <Link className="text-sm font-semibold text-lexos-silver transition hover:text-lexos-cyan" href={route}>{index + 1}. {label}</Link>
                {index < journey.length - 1 ? <span className="text-lexos-cyan/55">→</span> : null}
              </span>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function HealthLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/[0.055] py-2.5 last:border-b-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-lexos-cyan">{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-lexos-silver">{value}</dd>
    </div>
  );
}
