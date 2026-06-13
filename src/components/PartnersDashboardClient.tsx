"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, SectionCard } from "@/components/ui";
import { AGENDA_UPDATED_EVENT } from "@/lib/data/agenda";
import { CENTRAL_EXECUTIONS_UPDATED_EVENT } from "@/lib/data/centralExecutions";
import { CLIENTS_UPDATED_EVENT, FALLBACK_WORKSPACE_ID } from "@/lib/data/clients";
import { FINANCE_UPDATED_EVENT } from "@/lib/data/finance";
import { PARTNERSHIPS_UPDATED_EVENT } from "@/lib/data/partnerships";
import { buildPartnersDashboardData, buildPartnersDashboardDataAsync, type ExecutiveInsight, type PartnersDashboardCardId, type PartnersDashboardListItem, type PartnersDashboardPeriod } from "@/lib/data/partnersDashboard";
import { PROCESSES_UPDATED_EVENT } from "@/lib/data/processes";
import { REPORTS_UPDATED_EVENT } from "@/lib/data/reports";
import { TASKS_UPDATED_EVENT } from "@/lib/data/tasks";
import { getCurrentSessionOrFallback } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const periods: Array<{ value: PartnersDashboardPeriod; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes", label: "Mês atual" },
  { value: "todos", label: "Todos os dados" },
];

const executiveCardIds: PartnersDashboardCardId[] = [
  "clients_attention",
  "processes_risk",
  "finance_overdue",
  "tasks_overdue",
  "reports_generated",
  "deadlines_urgent",
];

const storageEvents = [
  CLIENTS_UPDATED_EVENT,
  PROCESSES_UPDATED_EVENT,
  PARTNERSHIPS_UPDATED_EVENT,
  TASKS_UPDATED_EVENT,
  AGENDA_UPDATED_EVENT,
  FINANCE_UPDATED_EVENT,
  REPORTS_UPDATED_EVENT,
  CENTRAL_EXECUTIONS_UPDATED_EVENT,
];

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "urgent" | "warning" | "positive" }) {
  const tones = {
    neutral: "border-lexos-line/45 bg-white/[0.026] text-lexos-silver",
    urgent: "border-lexos-wine/40 bg-lexos-wine/[0.065] text-lexos-red",
    warning: "border-lexos-gold/30 bg-lexos-gold/[0.055] text-lexos-gold",
    positive: "border-lexos-green/30 bg-lexos-green/[0.07] text-lexos-green",
  };
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

function ActionLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link className={cn("group/cta flex items-center justify-between gap-3 border-t border-white/[0.055] pt-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-lexos-gold transition hover:border-lexos-gold/32 hover:text-lexos-goldSoft", className)} href={href}><span>{children}</span><span className="transition group-hover/cta:translate-x-1">→</span></Link>;
}

function InsightCard({ insight }: { insight: ExecutiveInsight }) {
  const tone = insight.priority === "Alta" ? "urgent" : insight.priority === "Média" ? "warning" : "positive";
  return (
    <article className="calm-priority-card group relative flex h-full flex-col justify-between overflow-hidden border border-lexos-line/45 transition duration-200 hover:border-lexos-gold/28">
      <span className={cn("absolute inset-x-0 top-0 h-px", tone === "urgent" ? "bg-lexos-red/70" : tone === "warning" ? "bg-lexos-gold/85" : "bg-lexos-green/65")} />
      <div>
        <div className="-mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.045] bg-white/[0.026] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lexos-gold">{insight.source}</p>
          <Pill tone={tone}>Prioridade {insight.priority}</Pill>
        </div>
        <h3 className="mt-3 text-[15px] font-semibold leading-5 text-white transition group-hover:text-lexos-goldSoft">{insight.title}</h3>
        <dl className="mt-3 space-y-2 rounded-2xl bg-white/[0.024] px-3 py-2.5">
          <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">Motivo</dt><dd className="mt-1 text-xs leading-5 text-lexos-muted">{insight.description}</dd></div>
          <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-goldSoft">Impacto</dt><dd className="mt-1 text-xs leading-5 text-lexos-silver">{insight.impact}</dd></div>
          <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-goldSoft">Ação sugerida</dt><dd className="mt-1 text-xs leading-5 text-lexos-silver">{insight.suggestedAction}</dd></div>
        </dl>
      </div>
      <ActionLink className="mt-3" href={insight.route}>{insight.actionLabel}</ActionLink>
    </article>
  );
}

function ListItemCard({ item }: { item: PartnersDashboardListItem }) {
  return (
    <article className="calm-record-card group overflow-hidden border border-lexos-line/45 transition duration-200 hover:border-lexos-cyan/18">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-5 text-white transition group-hover:text-lexos-goldSoft">{item.title}</p>
          <p className="mt-1.5 text-sm leading-5 text-lexos-muted">{item.subtitle}</p>
        </div>
        <Pill tone="warning">{item.status}</Pill>
      </div>
      <p className="mt-3 border-t border-white/[0.055] pt-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-goldSoft">{item.meta}</p>
      <ActionLink className="mt-2.5" href={item.route}>{item.actionLabel}</ActionLink>
    </article>
  );
}

function parseClientNarrative(item: PartnersDashboardListItem) {
  const [reason = item.subtitle, riskAndAction = ""] = item.subtitle.replace(/^Motivo:\s*/, "").split(". Risco: ");
  const [risk = "Revisar pendência registrada no cliente.", action = "Definir responsável e próximo passo."] = riskAndAction.split(". Ação sugerida: ");
  const [owner = "Responsável não informado", lastContact = "último contato não informado"] = item.meta.split(" • ");
  return { reason, risk, action, owner, lastContact };
}

function ClientListItemCard({ item, balanceWide = false }: { item: PartnersDashboardListItem; balanceWide?: boolean }) {
  const narrative = parseClientNarrative(item);
  const tone = item.status === "atenção" ? "warning" : item.status === "ativo" ? "positive" : "neutral";
  return (
    <article className={cn("calm-record-card group relative overflow-hidden border border-lexos-line/45 transition duration-200 hover:border-lexos-gold/28", balanceWide && "xl:last:col-span-2")}>
      <span className="absolute inset-y-0 left-0 w-px bg-lexos-gold/45" />
      <div className="-mx-4 -mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.045] bg-white/[0.026] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-lexos-gold">Cliente prioritário</p>
          <h3 className="mt-1 text-[17px] font-semibold leading-5 text-white transition group-hover:text-lexos-goldSoft">{item.title}</h3>
        </div>
        <Pill tone={tone}>Status: {item.status}</Pill>
      </div>
      <dl className="mt-3 grid border-y border-white/[0.055] sm:grid-cols-2 sm:divide-x sm:divide-white/[0.045]">
        <div className="py-2.5 sm:pr-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-goldSoft">Motivo</dt><dd className="mt-1 text-xs leading-5 text-lexos-silver">{narrative.reason}</dd></div>
        <div className="border-t border-white/[0.055] bg-gradient-to-r from-lexos-gold/[0.045] to-transparent py-2.5 pl-2.5 sm:border-t-0 sm:pl-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-goldSoft">Risco</dt><dd className="mt-1 text-xs leading-5 text-lexos-silver">{narrative.risk}</dd></div>
      </dl>
      <div className="mt-2.5 rounded-2xl border border-lexos-gold/14 bg-lexos-gold/[0.045] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-gold">Ação sugerida</p><p className="mt-1 text-xs leading-5 text-lexos-silver">{narrative.action}</p></div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.055] pt-2.5 text-[11px] text-lexos-muted"><span><strong className="text-lexos-silver">Responsável:</strong> {narrative.owner}</span><span><strong className="text-lexos-silver">Contato:</strong> {narrative.lastContact}</span></div>
      <ActionLink className="mt-3" href={item.route}>{item.actionLabel}</ActionLink>
    </article>
  );
}
function MovementCard({ insight, label }: { insight: ExecutiveInsight; label: string }) {
  const suggestedAction = insight.suggestedAction.replace(/^Horizonte:\s*/, "");
  const sentenceBreak = suggestedAction.indexOf(". ");
  const horizon = sentenceBreak >= 0 ? suggestedAction.slice(0, sentenceBreak) : "Semana atual";
  const guidance = sentenceBreak >= 0 ? suggestedAction.slice(sentenceBreak + 2) : suggestedAction;
  const tone = insight.priority === "Alta" ? "urgent" : insight.priority === "Média" ? "warning" : "positive";
  return (
    <article className="calm-priority-card group relative flex h-full flex-col justify-between overflow-hidden border border-lexos-line/45 transition duration-200 hover:border-lexos-gold/28">
      <span className={cn("absolute inset-x-0 top-0 h-px", tone === "urgent" ? "bg-lexos-red/65" : tone === "warning" ? "bg-lexos-gold/80" : "bg-lexos-green/60")} />
      <div>
        <div className="-mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.045] bg-white/[0.024] px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-gold">{label}</p>
          <Pill tone={tone}>{insight.priority}</Pill>
        </div>
        <h3 className="mt-3 text-[15px] font-semibold leading-5 text-white transition group-hover:text-lexos-goldSoft">{insight.title}</h3>
        <div className="mt-3 rounded-2xl border border-lexos-cyan/12 bg-lexos-cyan/[0.035] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-cyan">Horizonte</p>
          <p className="mt-1 text-xs font-semibold text-white">{horizon}</p>
        </div>
        <p className="mt-2.5 text-xs leading-5 text-lexos-muted">{guidance}</p>
      </div>
      <ActionLink className="mt-3" href={insight.route}>{insight.actionLabel}</ActionLink>
    </article>
  );
}

function SummaryLine({ label, value, route }: { label: string; value: string | number; route: string }) {
  return (
    <Link className="flex items-center justify-between gap-3 rounded-xl border border-lexos-line/40 bg-white/[0.024] px-3 py-2.5 transition hover:border-lexos-cyan/18 hover:bg-white/[0.045]" href={route}>
      <span className="text-sm text-lexos-muted">{label}</span>
      <span className="shrink-0 text-sm font-semibold text-white">{value}</span>
    </Link>
  );
}

function RiskLine({ label, description, tone, route }: { label: string; description: string; tone: "urgent" | "warning" | "neutral"; route: string }) {
  return (
    <Link className="grid gap-1 rounded-xl border border-lexos-line/40 bg-white/[0.024] px-3 py-2.5 transition hover:border-lexos-gold/22 hover:bg-white/[0.045] sm:grid-cols-[145px_1fr_auto] sm:items-center sm:gap-3" href={route}>
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="text-xs leading-5 text-lexos-muted">{description}</span>
      <Pill tone={tone}>{tone === "urgent" ? "Prioridade alta" : tone === "warning" ? "Monitorar" : "Sob controle"}</Pill>
    </Link>
  );
}

export function PartnersDashboardClient() {
  const [period, setPeriod] = useState<PartnersDashboardPeriod>("todos");
  const [responsible, setResponsible] = useState("todos");
  const [activeCard, setActiveCard] = useState<PartnersDashboardCardId>("clients_attention");
  const [refresh, setRefresh] = useState(0);
  const session = useMemo(() => getCurrentSessionOrFallback(), []);
  const workspaceId = session.workspace.id || FALLBACK_WORKSPACE_ID;

  useEffect(() => {
    const update = () => setRefresh((current) => current + 1);
    storageEvents.forEach((event) => window.addEventListener(event, update));
    window.addEventListener("storage", update);
    return () => {
      storageEvents.forEach((event) => window.removeEventListener(event, update));
      window.removeEventListener("storage", update);
    };
  }, []);

  const [data, setData] = useState(() => buildPartnersDashboardData({ period, responsible, workspaceId }));

  useEffect(() => {
    let active = true;
    void buildPartnersDashboardDataAsync({ period, responsible, workspaceId }).then((nextData) => {
      if (active) setData(nextData);
    });
    return () => { active = false; };
  }, [period, refresh, responsible, workspaceId]);

  const executiveCards = executiveCardIds.map((id) => data.cards.find((card) => card.id === id)).filter((card) => card !== undefined);
  const active = data.cards.find((card) => card.id === activeCard) ?? executiveCards[0] ?? data.cards[0];
  const overloadedPeople = data.teamCapacity.filter((person) => person.status !== "Estável").length;
  const riskRows: Array<{ label: string; description: string; tone: "urgent" | "warning" | "neutral"; route: string }> = [
    { label: "Financeiro", description: `${data.metrics.finance.totalVencido} vencidos e ${data.metrics.finance.cobrancasPendentes} cobrança(s) pendente(s) no recorte.`, tone: Number(data.metrics.finance.clientesInadimplentes) > 0 ? "urgent" : "neutral", route: "/financeiro?view=vencidos" },
    { label: "Processual", description: `${data.metrics.processes.riscoAltoCritico} processo(s) de risco alto/crítico para revisão executiva.`, tone: data.metrics.processes.riscoAltoCritico > 0 ? "urgent" : "neutral", route: "/processos?risk=alto" },
    { label: "Operacional", description: `${data.metrics.tasks.atrasadas} tarefa(s) atrasada(s) e ${overloadedPeople} responsável(is) sob pressão de capacidade.`, tone: data.metrics.tasks.atrasadas > 0 ? "warning" : "neutral", route: "/tarefas?status=atrasada" },
    { label: "Relacionamento", description: `${data.metrics.clients.semRetorno} cliente(s) sem retorno recente ou com pendência aberta.`, tone: data.metrics.clients.semRetorno > 0 ? "warning" : "neutral", route: "/clientes?status=atenção" },
    { label: "Prazos", description: `${data.metrics.agenda.prazosSemana} prazo(s) urgente(s)/alto(s) próximo(s) para validação humana.`, tone: data.metrics.agenda.prazosSemana > 0 ? "urgent" : "neutral", route: "/agenda?view=prazos" },
  ];
  const movements = data.recommendations.map((insight, index) => ({
    insight,
    label: ["Fazer hoje", "Acompanhar caixa", "Delegar relacionamento", "Revisar governança", "Gerar relatório"][index],
  }));

  return (
    <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
      <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
        <div className="grid gap-4 xl:grid-cols-[1fr_330px] xl:items-stretch">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-lexos-cyan">Painel dos Sócios • sala de decisão</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">Sala executiva de decisões.</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-lexos-muted">Leitura estratégica da carteira, risco, caixa e produtividade para concentrar a atuação humana do sócio onde ela muda o resultado.</p>
            <p className="mt-3 max-w-4xl rounded-2xl border border-lexos-gold/16 bg-lexos-gold/[0.045] px-3.5 py-2.5 text-xs leading-5 text-lexos-silver"><strong className="text-lexos-goldSoft">Providência-chave:</strong> {data.health.weeklyRecommendation} Saídas externas ou jurídicas exigem revisão humana obrigatória.</p>
          </div>
          <div className="rounded-[1.25rem] border border-lexos-cyan/12 bg-white/[0.035] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lexos-muted">Leitura do recorte</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div><p className="text-xl font-semibold text-white">{data.health.status}</p><p className="mt-1 text-xs text-lexos-muted">pressão operacional {data.health.score}/100</p></div>
              <Pill tone={data.health.score >= 50 ? "urgent" : data.health.score > 0 ? "warning" : "positive"}>{session.workspace.name}</Pill>
            </div>
            <p className="mt-3 border-t border-white/[0.055] pt-3 text-xs leading-5 text-lexos-silver"><strong className="text-lexos-goldSoft">Gargalo:</strong> {data.health.mainBottleneck}</p>
          </div>
        </div>
      </section>

      <SectionCard eyebrow="Filtros executivos" title="Recorte da visão consolidada">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {periods.map((option) => <button className={cn("rounded-xl border px-3 py-2 text-xs font-semibold transition", period === option.value ? "border-lexos-cyan/45 bg-lexos-cyan/[0.075] text-lexos-cyan" : "border-lexos-line/45 bg-white/[0.026] text-lexos-silver hover:border-lexos-cyan/20 hover:text-white")} key={option.value} onClick={() => setPeriod(option.value)} type="button">{option.label}</button>)}
          </div>
          <label className="text-xs text-lexos-muted lg:w-[260px]">Responsável
            <select className="mt-1.5 w-full rounded-xl border border-lexos-line/45 bg-lexos-ink/92 px-3 py-2 text-sm text-white outline-none transition focus:border-lexos-cyan" onChange={(event) => setResponsible(event.target.value)} value={responsible}>
              <option value="todos">Todos</option>
              {data.responsibleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
            </select>
          </label>
        </div>
      </SectionCard>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {executiveCards.map((card) => <button className={cn("calm-metric-card border text-left transition", active.id === card.id ? "border-lexos-cyan/45 bg-lexos-cyan/[0.055] ring-1 ring-lexos-cyan/20" : "border-lexos-line/45", card.tone === "urgent" && active.id !== card.id ? "border-lexos-gold/24 bg-lexos-gold/[0.045]" : "")} key={card.id} onClick={() => setActiveCard(card.id)} type="button">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-lexos-muted">{card.title}</p>
          <p className="mt-1.5 text-2xl font-semibold text-white">{card.value}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-lexos-cyan/85">{card.detail}</p>
        </button>)}
      </section>

      <SectionCard eyebrow="Decisões do sócio" title="Decisões que exigem atenção">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.decisionsToday.length ? data.decisionsToday.map((insight) => <InsightCard insight={insight} key={insight.title} />) : <EmptyState title="Sem decisão crítica no recorte" description="Não há decisão executiva imediata sinalizada pelos dados atuais." />}
        </div>
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard eyebrow="Riscos consolidados" title="Mapa executivo de exposição">
          <div className="space-y-2">{riskRows.map((risk) => <RiskLine {...risk} key={risk.label} />)}</div>
        </SectionCard>

        <SectionCard eyebrow="Carteira e produtividade" title="Pulso operacional do escritório">
          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryLine label="Clientes acompanhados" route="/clientes" value={data.metrics.clients.ativos} />
            <SummaryLine label="Processos ativos" route="/processos" value={data.metrics.processes.ativos} />
            <SummaryLine label="Tarefas abertas" route="/tarefas" value={data.metrics.tasks.operacionais} />
            <SummaryLine label="Relatórios gerados" route="/relatorios" value={data.metrics.reports.gerados} />
            <SummaryLine label="Usos da Central LEX.OS" route="/central-lexos" value={data.metrics.central.execucoes} />
            <SummaryLine label="Pendências da semana" route="/agenda" value={data.metrics.agenda.prazosSemana + data.metrics.tasks.atrasadas} />
          </div>
          <p className="mt-3 rounded-2xl border border-lexos-gold/16 bg-lexos-gold/[0.045] px-3 py-2.5 text-xs leading-5 text-lexos-silver"><strong className="text-lexos-goldSoft">Capacidade:</strong> {data.health.busiestModule}</p>
        </SectionCard>
      </section>

      <SectionCard eyebrow="Próximos movimentos" title="Agenda executiva para estabilizar a semana">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {movements.map(({ insight, label }) => <MovementCard insight={insight} key={insight.title} label={label} />)}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Detalhamento por indicador" title={active.listTitle} action={<Pill tone="warning">Indicador selecionado</Pill>}>
        {active.items.length ? <div className="grid gap-3 xl:grid-cols-2">{active.items.map((entry) => active.id === "clients_attention" ? <ClientListItemCard balanceWide={active.items.length % 2 === 1} item={entry} key={entry.id} /> : <ListItemCard item={entry} key={entry.id} />)}</div> : <EmptyState title="Sem itens no recorte" description={active.emptyText} />}
      </SectionCard>
    </div>
  );
}
