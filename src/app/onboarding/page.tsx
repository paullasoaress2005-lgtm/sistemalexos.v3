"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { SectionCard } from "@/components/ui";
import {
  loadOnboardingState,
  logOnboardingActivity,
  type OnboardingState,
} from "@/lib/data/onboarding";
import { normalizeWorkspaceRole, type WorkspaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type RouteAction = {
  label: string;
  route: string;
};

type OnboardingStep = {
  number: number;
  title: string;
  badge: string;
  description: string;
  actions: RouteAction[];
};

type AvoidItem = {
  title: string;
  text: string;
};

const CHECKLIST_STORAGE_KEY = "lexos.control.firstSteps.checklist";

const quickVision = [
  {
    label: "Etapa atual",
    value: "Configuração inicial",
    detail: "Comece pelos dados do escritório",
    tone: "premium",
  },
  {
    label: "Progresso sugerido",
    value: "0/7",
    detail: "passos concluídos",
    tone: "warning",
  },
  {
    label: "Prioridade inicial",
    value: "Clientes e processos",
    detail: "base da operação",
    tone: "positive",
  },
  {
    label: "Revisão humana",
    value: "Obrigatória",
    detail: "antes de uso externo",
    tone: "premium",
  },
];

const onboardingSteps: OnboardingStep[] = [
  {
    number: 1,
    title: "Revisar dados do escritório",
    badge: "Essencial",
    description:
      "Confirme nome, perfil, identidade operacional, responsáveis e parâmetros básicos.",
    actions: [{ label: "Abrir Configurações", route: "/configuracoes" }],
  },
  {
    number: 2,
    title: "Cadastrar ou revisar clientes",
    badge: "Essencial",
    description:
      "Crie a carteira inicial de clientes, responsáveis, status e informações essenciais.",
    actions: [{ label: "Abrir Clientes", route: "/clientes" }],
  },
  {
    number: 3,
    title: "Cadastrar processos principais",
    badge: "Essencial",
    description:
      "Vincule processos aos clientes, defina fase, risco, responsáveis e próximos passos.",
    actions: [{ label: "Abrir Processos", route: "/processos" }],
  },
  {
    number: 4,
    title: "Organizar tarefas e prazos",
    badge: "Recomendado",
    description:
      "Transforme pendências em tarefas, prazos, audiências, reuniões e follow-ups.",
    actions: [
      { label: "Abrir Tarefas", route: "/tarefas" },
      { label: "Abrir Agenda", route: "/agenda" },
    ],
  },
  {
    number: 5,
    title: "Registrar controle financeiro interno",
    badge: "Controle interno",
    description:
      "Cadastre cobranças, vencidos, recebidos e previsões apenas como controle interno.",
    actions: [{ label: "Abrir Financeiro", route: "/financeiro" }],
  },
  {
    number: 6,
    title: "Gerar primeira leitura executiva",
    badge: "Revisão humana",
    description:
      "Use Painel dos Sócios, Relatórios ou Central LEX.OS para consolidar riscos, caixa, prazos e prioridades.",
    actions: [
      { label: "Abrir Painel dos Sócios", route: "/socios" },
      { label: "Abrir Relatórios", route: "/relatorios" },
      { label: "Abrir Central LEX.OS", route: "/central-lexos" },
    ],
  },
  {
    number: 7,
    title: "Validar rotina com a equipe",
    badge: "Revisão humana",
    description:
      "Revise permissões, responsáveis, fluxos e saída de informações antes de qualquer uso externo.",
    actions: [{ label: "Abrir Implantação", route: "/configuracoes/release" }],
  },
];

const recommendedOrder = [
  "Configurar",
  "Cadastrar clientes",
  "Criar processos",
  "Organizar tarefas/agenda",
  "Acompanhar financeiro",
  "Usar relatórios",
  "Acionar Central LEX.OS",
];

const avoidItems: AvoidItem[] = [
  {
    title: "Não começar pelo financeiro sem clientes/processos cadastrados",
    text: "O financeiro ganha contexto quando cobranças estão vinculadas a clientes, processos ou responsáveis.",
  },
  {
    title: "Não gerar relatórios antes de organizar a base",
    text: "Relatórios ficam mais úteis quando clientes, processos, tarefas e prazos estão minimamente estruturados.",
  },
  {
    title: "Não usar saídas externas sem revisão",
    text: "Mensagens, relatórios e dossiês devem passar por validação humana antes de uso com cliente, terceiro ou órgão externo.",
  },
  {
    title: "Não misturar demonstração com dados reais sem controle",
    text: "Ambientes demonstrativos devem permanecer separados de dados reais do escritório.",
  },
];

const firstDayChecklist = [
  "Conferir dados do escritório",
  "Cadastrar 3 clientes reais ou fictícios de teste",
  "Cadastrar 3 processos vinculados",
  "Criar 5 tarefas operacionais",
  "Criar 2 prazos ou eventos de agenda",
  "Registrar 2 cobranças internas de teste",
  "Gerar 1 relatório executivo",
  "Gerar 1 dossiê rápido na Central LEX.OS",
  "Revisar tudo antes de uso externo",
];

function emptyState(): OnboardingState {
  return {
    mode: "demo",
    workspaceId: null,
    workspaceName: "Escritório da demonstração",
    workspaceStatus: "demo",
    userId: null,
    userName: "Usuário da demonstração",
    userEmail: "demo@lexos.local",
    userRole: "socio",
    counts: {
      clients: 0,
      processes: 0,
      process_partnerships: 0,
      tasks: 0,
      agenda_events: 0,
      financial_records: 0,
      reports: 0,
      central_executions: 0,
      prompt_templates: 0,
      activity_logs: 0,
      workspace_members: 0,
    },
    hasOwnerAdminActive: false,
    latestActivities: [],
    testData: [],
    errors: [],
  };
}

function loadChecklistState() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHECKLIST_STORAGE_KEY) || "{}",
    );
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function persistChecklistState(next: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
}

function RestrictedOnboarding() {
  return (
    <AppLayout>
      <section className="rounded-[1.6rem] border border-lexos-gold/24 bg-gradient-to-br from-lexos-panel via-lexos-navy to-lexos-ink p-8 shadow-premium">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">
          Primeiros passos
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Acesso operacional restrito neste escritório.
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-7 text-lexos-silver">
          Esta trilha orienta adoção prática após o ambiente estar pronto para
          piloto controlado. Solicite revisão a um gestor autorizado.
        </p>
        <Link
          className="mt-6 inline-flex rounded-xl border border-lexos-gold/40 px-4 py-2 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/10"
          href="/dashboard"
        >
          Voltar ao dashboard
        </Link>
      </section>
    </AppLayout>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(emptyState());
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const role = normalizeWorkspaceRole(state.userRole as WorkspaceRole);
  const isDemoOrPilotWorkspace =
    state.mode === "demo" || state.workspaceStatus === "demo";
  const canViewPage =
    isDemoOrPilotWorkspace ||
    ["owner", "admin", "socio", "advogado", "operacional"].includes(role);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      const loadedOnboarding = await loadOnboardingState();
      if (!active) return;
      setState(loadedOnboarding);
      setCheckedItems(loadChecklistState());
      setLoading(false);
      await logOnboardingActivity(
        loadedOnboarding.workspaceId,
        "first_steps_viewed",
        "Trilha operacional de Primeiros Passos visualizada.",
      );
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  function go(route: string) {
    router.push(route);
  }

  function toggleChecklistItem(item: string) {
    setCheckedItems((current) => {
      const next = { ...current, [item]: !current[item] };
      persistChecklistState(next);
      return next;
    });
  }

  if (!loading && !canViewPage) return <RestrictedOnboarding />;

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
        <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
          <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr] xl:items-stretch">
            <div className="flex flex-col justify-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-lexos-cyan">
                Primeiros passos{" "}
                <span className="mx-2 text-lexos-cyan/45">/</span> entrada
                operacional
              </p>
              <h1 className="mt-2 max-w-4xl text-2xl font-semibold tracking-[-0.035em] text-white md:text-[2rem]">
                Entrada guiada para operar o LEX.OS Control.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-lexos-silver">
                Um roteiro leve para configurar o escritório, cadastrar
                clientes, criar processos, organizar tarefas e agenda,
                acompanhar financeiro e usar Relatórios e Central LEX.OS com
                segurança.
              </p>
              <div className="mt-3 flex max-w-3xl items-start gap-2 rounded-[1rem] border border-lexos-gold/18 bg-lexos-gold/[0.045] px-3 py-2 text-xs leading-5 text-lexos-goldSoft">
                <span className="mt-0.5 text-lexos-gold">◆</span>
                <p>
                  Trilha inicial de adoção: siga uma etapa por vez, mantenha
                  dados revisados e valide qualquer saída antes de compartilhar
                  com terceiros.
                </p>
              </div>
            </div>
            <aside className="flex flex-col justify-between rounded-[1.25rem] border border-lexos-gold/22 bg-[linear-gradient(135deg,rgba(197,161,89,0.10),rgba(255,255,255,0.024))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lexos-gold">
                    Entrada assistida
                  </p>
                  <span className="rounded-full border border-lexos-cyan/28 bg-lexos-cyan/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lexos-cyan">
                    Assistido
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-lexos-silver">
                  Roteiro operacional sem envios automáticos, sem integrações
                  externas nesta etapa e sem substituição da revisão jurídica.
                </p>
              </div>
              <button
                className="calm-primary-action mt-3 text-xs"
                onClick={() => go("/configuracoes")}
                type="button"
              >
                Começar por Configurações <span className="ml-1">→</span>
              </button>
            </aside>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickVision.map((card) => (
            <OnboardingStatusCard
              detail={card.detail}
              key={card.label}
              label={card.label}
              tone={card.tone}
              value={card.value}
            />
          ))}
        </section>

        <SectionCard
          className="border-white/[0.055]"
          eyebrow="Trilha principal de onboarding"
          title="Roteiro recomendado"
        >
          <div className="mb-4 flex flex-col gap-2 rounded-[1.1rem] border border-white/[0.055] bg-white/[0.026] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-lexos-silver">
              <span className="font-semibold text-lexos-goldSoft">
                Comece pela etapa 01.
              </span>{" "}
              A narrativa é simples: configurar, cadastrar, operar, acompanhar e
              revisar.
            </p>
            <span className="shrink-0 rounded-full border border-lexos-gold/30 bg-lexos-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-lexos-goldSoft">
              01 de 07 · atual
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {onboardingSteps.map((step) => (
              <StepCard key={step.number} onGo={go} step={step} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Sequência ideal" title="Narrativa de adoção">
          <div className="rounded-[1.15rem] border border-white/[0.055] bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
              {recommendedOrder.map((item, index) => (
                <div className="flex items-center gap-1.5" key={item}>
                  <span
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold",
                      index === 0
                        ? "border-lexos-gold/42 bg-lexos-gold/[0.095] text-lexos-gold"
                        : "border-white/[0.08] bg-white/[0.032] text-lexos-silver",
                    )}
                  >
                    {item}
                  </span>
                  {index < recommendedOrder.length - 1 ? (
                    <span className="text-xs text-lexos-gold/65">→</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2.5 border-t border-lexos-line/60 pt-2.5 text-xs leading-5 text-lexos-muted">
              Linha de execução recomendada para reduzir retrabalho: primeiro
              firme a base operacional, depois acompanhe rotina, financeiro,
              relatórios e Central LEX.OS.
            </p>
          </div>
        </SectionCard>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard
            eyebrow="Alertas consultivos"
            title="O que evitar no início"
          >
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {avoidItems.map((item) => (
                <AvoidCard item={item} key={item.title} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Primeiro dia"
            title="Checklist rápido do primeiro dia"
          >
            <div className="grid gap-1.5">
              {firstDayChecklist.map((item) => (
                <ChecklistToggle
                  checked={Boolean(checkedItems[item])}
                  item={item}
                  key={item}
                  onToggle={() => toggleChecklistItem(item)}
                />
              ))}
            </div>
            <p className="mt-3 rounded-[1rem] border border-white/[0.055] bg-white/[0.024] px-3 py-2 text-[11px] leading-5 text-lexos-muted">
              Checklist local/demonstrativo salvo apenas neste navegador quando
              disponível. Não altera permissões, integrações, cobranças ou dados
              externos.
            </p>
          </SectionCard>
        </section>

        <section className="executive-panel-compact rounded-[1.5rem] border border-lexos-gold/20 bg-[linear-gradient(135deg,rgba(197,161,89,0.095),rgba(12,25,43,0.78))] shadow-premium">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lexos-gold">
                Resultado esperado
              </p>
              <p className="mt-1.5 max-w-4xl text-sm leading-6 text-lexos-silver">
                Ao concluir os primeiros passos, o escritório deve conseguir
                visualizar carteira, processos, tarefas, prazos, financeiro
                interno, riscos e relatórios executivos em uma rotina única de
                acompanhamento.
              </p>
            </div>
            <button
              className="calm-secondary-action shrink-0 text-sm"
              onClick={() => go("/central-lexos")}
              type="button"
            >
              Abrir Central LEX.OS
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function OnboardingStatusCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  const tones: Record<string, string> = {
    warning: "border-lexos-gold/22 text-lexos-goldSoft",
    positive: "border-lexos-cyan/20 text-lexos-cyan",
    premium: "border-lexos-gold/24 text-lexos-gold",
  };
  return (
    <article
      className={cn(
        "calm-metric-card subtle-hover-card border px-3.5 py-3",
        tones[tone],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-lexos-muted">
          {label}
        </p>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-white">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.13em]">
        {detail}
      </p>
    </article>
  );
}

function StepCard({
  step,
  onGo,
}: {
  step: OnboardingStep;
  onGo: (route: string) => void;
}) {
  const isFirstStep = step.number === 1;
  return (
    <article
      className={cn(
        "interactive-card group flex min-h-[9.4rem] flex-col rounded-[1.15rem] border px-3.5 py-3.5",
        isFirstStep
          ? "border-lexos-gold/36 bg-[linear-gradient(135deg,rgba(197,161,89,0.095),rgba(255,255,255,0.026))] shadow-[0_0_0_1px_rgba(197,161,89,0.05),0_12px_30px_rgba(0,0,0,0.11)]"
          : "border-white/[0.06] bg-white/[0.024]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
            isFirstStep
              ? "border-lexos-gold/70 bg-lexos-gold/18 text-lexos-gold"
              : "border-white/[0.09] bg-white/[0.035] text-lexos-silver",
          )}
        >
          {String(step.number).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold leading-5 text-white">
              {step.title}
            </h3>
            <span className="rounded-full border border-lexos-gold/24 bg-lexos-gold/[0.06] px-2 py-0.5 text-[10px] font-semibold text-lexos-goldSoft">
              {step.badge}
            </span>
          </div>
          {isFirstStep ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-lexos-gold">
              Ação recomendada agora
            </p>
          ) : null}
          <p className="mt-1.5 text-xs leading-5 text-lexos-muted">
            {step.description}
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/[0.055] pt-2.5">
        {step.actions.map((action) => (
          <button
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
              isFirstStep
                ? "border-lexos-gold/45 bg-lexos-gold/10 text-lexos-gold hover:bg-lexos-gold/15"
                : "border-white/[0.08] bg-white/[0.026] text-lexos-silver hover:border-lexos-cyan/28 hover:text-lexos-cyan",
            )}
            key={action.label}
            onClick={() => onGo(action.route)}
            type="button"
          >
            {action.label} <span className="ml-0.5 opacity-70">→</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function AvoidCard({ item }: { item: AvoidItem }) {
  return (
    <div className="subtle-hover-card flex gap-2.5 rounded-[1.05rem] border border-lexos-gold/16 bg-white/[0.024] p-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-lexos-gold/35 bg-lexos-gold/10 text-[11px] font-semibold text-lexos-gold">
        !
      </span>
      <div>
        <p className="text-xs font-semibold leading-5 text-white">
          {item.title}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-lexos-muted">
          {item.text}
        </p>
      </div>
    </div>
  );
}

function ChecklistToggle({
  checked,
  item,
  onToggle,
}: {
  checked: boolean;
  item: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2.5 rounded-[1rem] border px-3 py-2 text-left transition",
        checked
          ? "border-lexos-cyan/30 bg-lexos-cyan/8 text-lexos-cyan"
          : "border-white/[0.06] bg-white/[0.024] text-lexos-silver hover:border-lexos-gold/28 hover:bg-white/[0.04]",
      )}
      onClick={onToggle}
      type="button"
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border text-[10px] font-bold",
          checked
            ? "border-lexos-cyan bg-lexos-cyan/12"
            : "border-white/[0.08] bg-white/[0.025]",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      <span className="text-xs leading-5">{item}</span>
    </button>
  );
}
