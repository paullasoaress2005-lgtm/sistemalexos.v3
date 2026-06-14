"use client";

import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";

type Metric = {
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "gold" | "green" | "silver";
};

const metrics: Metric[] = [
  { label: "Clientes ativos", value: "42", detail: "5 em atenção", tone: "cyan" },
  { label: "Processos em análise", value: "12", detail: "3 com prazo crítico", tone: "gold" },
  { label: "Tarefas para revisão", value: "08", detail: "revisão humana", tone: "green" },
  { label: "Economia estimada", value: "14h", detail: "indicador demonstrativo", tone: "silver" },
];

const priorities = [
  {
    number: "01",
    area: "Clientes",
    title: "Retomar cliente sem retorno recente",
    detail: "Grupo Ápice · próximo contato recomendado hoje",
    href: "/clientes",
  },
  {
    number: "02",
    area: "Processos",
    title: "Validar estratégia em processo de risco",
    detail: "Trabalhista · prazo vencido em acompanhamento",
    href: "/processos",
  },
  {
    number: "03",
    area: "Tarefas",
    title: "Revisar fila crítica da semana",
    detail: "4 tarefas abertas · 2 urgentes",
    href: "/tarefas",
  },
  {
    number: "04",
    area: "Financeiro",
    title: "Conferir cobranças vencidas",
    detail: "R$ 20.700,00 em tratamento ativo",
    href: "/financeiro",
  },
];

const distribution = [
  { label: "Clientes em atenção", value: "5", detail: "follow-up recomendado", href: "/clientes" },
  { label: "Processos críticos", value: "3", detail: "risco ou prazo", href: "/processos" },
  { label: "Tarefas operacionais", value: "8", detail: "revisão aberta", href: "/tarefas" },
];

const operationalRows = [
  {
    type: "Pessoa jurídica",
    title: "Grupo Ápice",
    meta: "Contrato Master 2026 · último contato 08/05",
    owner: "Dra. Helena",
    stage: "Aguardando reunião executiva",
    risk: "Atenção",
  },
  {
    type: "Trabalhista",
    title: "Marina Salles",
    meta: "1023387-44.2024.5.02.0001 · prazo vencido",
    owner: "Dr. Rafael",
    stage: "Revisar rol de testemunhas",
    risk: "Risco alto",
  },
  {
    type: "Previdenciário",
    title: "Benefício por incapacidade",
    meta: "Dossiê em organização · prova médica pendente",
    owner: "Dra. Helena",
    stage: "Auditoria documental",
    risk: "Médio",
  },
  {
    type: "Consumidor",
    title: "Fraude bancária",
    meta: "Pix contestado · documentos digitais em triagem",
    owner: "Equipe LEX.OS",
    stage: "Minuta em revisão",
    risk: "Atenção",
  },
];

const auditTrail = [
  {
    date: "13 jun 2026 · 10:42",
    actor: "Dra. Helena Moraes",
    area: "Clientes",
    title: "Atualização de contexto iniciada",
    description: "Ficha do cliente aberta para revisão consultiva.",
    status: "Em revisão",
  },
  {
    date: "13 jun 2026 · 10:18",
    actor: "Central LEX.OS",
    area: "Processos",
    title: "Minuta operacional gerada",
    description: "Rascunho assistivo criado sem envio externo.",
    status: "Sugestão",
  },
  {
    date: "13 jun 2026 · 09:54",
    actor: "Equipe jurídica",
    area: "Financeiro",
    title: "Cobrança consultiva sinalizada",
    description: "Pendência financeira marcada para tratativa humana.",
    status: "Pendente",
  },
];

const toneClasses: Record<Metric["tone"], string> = {
  cyan: "text-lexos-cyan border-lexos-cyan/35",
  gold: "text-lexos-goldSoft border-lexos-gold/35",
  green: "text-lexos-green border-lexos-green/35",
  silver: "text-lexos-silver border-lexos-line/80",
};

const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-[12px] border border-lexos-gold/60 bg-lexos-gold px-5 py-2 text-sm font-extrabold text-lexos-ink shadow-[0_14px_34px_rgba(202,165,91,0.18)] transition hover:bg-lexos-goldSoft focus:outline-none focus:ring-2 focus:ring-lexos-gold/70";

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className={`rounded-[14px] border bg-gradient-to-br from-lexos-card/72 to-lexos-navy/72 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.18)] ${toneClasses[metric.tone]}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-lexos-muted">Indicador operacional</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-white">{metric.label}</p>
          <p className="mt-1 text-xs text-lexos-muted">{metric.detail}</p>
        </div>
        <strong className="font-serif text-3xl leading-none tracking-[-0.04em]">{metric.value}</strong>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  return (
    <AppLayout>
      <section className="flex flex-col gap-4 border-b border-lexos-line/55 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-lexos-goldSoft">Visão geral · Central do escritório</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white md:text-5xl">Bom dia, Helena.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-lexos-muted">
            Acompanhe a carteira, priorize revisões e mantenha controle humano em cada etapa da operação jurídica.
          </p>
        </div>
        <Link className={primaryButton} href="/clientes">
          Abrir cliente em atenção
        </Link>
      </section>

      <section className="mt-6 overflow-hidden rounded-[22px] border border-lexos-line/70 bg-[radial-gradient(circle_at_90%_0%,rgba(92,201,213,0.12),transparent_34rem),linear-gradient(135deg,rgba(19,41,66,0.88),rgba(8,18,33,0.92))] p-6 shadow-premium">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-lexos-goldSoft">Painel de trabalho</p>
            <h2 className="mt-3 max-w-3xl font-serif text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-white md:text-4xl">
              Controle diário de clientes, processos, tarefas e revisões.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-lexos-muted">
              A central organiza o que exige decisão humana e deixa a rotina do escritório mais objetiva. Sugestões assistivas permanecem subordinadas à validação interna.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["42 clientes ativos", "12 processos em análise", "8 tarefas para revisão"].map((chip) => (
                <span className="rounded-full border border-lexos-line/70 bg-lexos-ink/48 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-lexos-muted" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[16px] border border-lexos-line/75 bg-lexos-ink/42 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-lexos-gold/35 bg-lexos-gold/10 text-lexos-goldSoft">OK</span>
              <div>
                <strong className="font-mono text-[11px] uppercase tracking-[0.14em] text-lexos-goldSoft">Revisão humana obrigatória</strong>
                <p className="mt-2 text-sm leading-6 text-lexos-muted">
                  Resultado assistivo para validação interna. Nenhum cliente, processo ou comunicação é tratado automaticamente sem conferência.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lexos-goldSoft">Conferências prioritárias</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-white">Prioridade do dia</h2>
            </div>
            <span className="text-xs text-lexos-muted">Atualização demonstrativa</span>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-lexos-line/70 bg-lexos-card/28">
            {priorities.map((item) => (
              <Link className="grid gap-3 border-b border-lexos-line/55 p-4 transition last:border-b-0 hover:bg-white/[0.035] md:grid-cols-[48px_1fr]" href={item.href} key={item.number}>
                <span className="font-serif text-2xl font-semibold text-lexos-goldSoft">{item.number}</span>
                <span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-lexos-cyan">{item.area}</span>
                  <strong className="mt-1 block text-base text-white">{item.title}</strong>
                  <span className="mt-1 block text-sm text-lexos-muted">{item.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lexos-goldSoft">Fila por módulo</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-white">Distribuição operacional</h2>
          </div>
          <div className="grid gap-3">
            {distribution.map((item) => (
              <Link className="rounded-[16px] border border-lexos-line/70 bg-lexos-card/30 p-4 transition hover:border-lexos-gold/45 hover:bg-white/[0.035]" href={item.href} key={item.label}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <strong className="text-base text-white">{item.label}</strong>
                    <p className="mt-1 text-sm text-lexos-muted">{item.detail}</p>
                  </div>
                  <span className="font-serif text-4xl font-semibold tracking-[-0.05em] text-lexos-cyan">{item.value}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lexos-goldSoft">Esteira em curso</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-white">Demandas aguardando conferência</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lexos-muted">Responsabilidade por equipe</span>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-lexos-line/70 bg-lexos-card/24">
          <div className="hidden grid-cols-[1.25fr_0.7fr_0.9fr_0.45fr] gap-4 border-b border-lexos-line/55 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-lexos-muted md:grid">
            <span>Cliente / processo</span>
            <span>Responsável</span>
            <span>Etapa atual</span>
            <span>Risco</span>
          </div>
          {operationalRows.map((row) => (
            <article className="grid gap-3 border-b border-lexos-line/55 px-4 py-4 last:border-b-0 md:grid-cols-[1.25fr_0.7fr_0.9fr_0.45fr] md:items-center" key={`${row.type}-${row.title}`}>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-lexos-cyan">{row.type}</p>
                <strong className="mt-1 block text-base text-white">{row.title}</strong>
                <p className="mt-1 text-sm text-lexos-muted">{row.meta}</p>
              </div>
              <p className="text-sm font-semibold text-lexos-silver">{row.owner}</p>
              <p className="text-sm text-lexos-muted">{row.stage}</p>
              <span className="w-fit rounded-full border border-lexos-gold/35 bg-lexos-gold/10 px-3 py-1 text-xs font-bold text-lexos-goldSoft">{row.risk}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-7 pb-8">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lexos-goldSoft">Trilha de auditoria</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-white">Movimentações recentes</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lexos-muted">3 eventos demonstrativos</span>
        </div>
        <div className="rounded-[18px] border border-lexos-line/70 bg-lexos-card/22 p-4">
          <div className="space-y-4">
            {auditTrail.map((event) => (
              <article className="grid gap-3 border-b border-lexos-line/55 pb-4 last:border-b-0 last:pb-0 md:grid-cols-[170px_1fr_auto]" key={`${event.date}-${event.title}`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lexos-muted">{event.date}</p>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-white">{event.actor}</strong>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-lexos-cyan">{event.area}</span>
                  </div>
                  <strong className="mt-1 block text-base text-white">{event.title}</strong>
                  <p className="mt-1 text-sm text-lexos-muted">{event.description}</p>
                </div>
                <span className="h-fit w-fit rounded-full border border-lexos-line/70 bg-lexos-ink/50 px-3 py-1 text-xs font-bold text-lexos-silver">{event.status}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
