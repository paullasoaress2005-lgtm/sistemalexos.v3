"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { SectionCard } from "@/components/ui";
import { getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";
import { logSettingsActivity } from "@/lib/data/activityLogs";
import { getDataSourceStatus } from "@/lib/data/source";
import { loadSettings, type SettingsLoadState } from "@/lib/data/settings";
import {
  manualQaChecklist,
  operationalJourneyRoutes,
} from "@/lib/data/manualQa";
import {
  currentSecurityLimitations,
  type ChecklistStatus,
} from "@/lib/security";
import {
  getRolePermissions,
  normalizeWorkspaceRole,
  roleLabels,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

type ReleaseChecklistStatus = ChecklistStatus | "pendente";
type ModuleStatus = "liberado" | "em validação" | "restrito" | "pós-piloto";
type OperationalStep = {
  title: string;
  description: string;
  action: string;
  status: ReleaseChecklistStatus;
};

const statusLabels: Record<ReleaseChecklistStatus, string> = {
  concluido: "Concluído",
  atencao: "Em validação",
  manual: "Revisão humana",
  pendente: "Pendente",
};
const statusClass: Record<ReleaseChecklistStatus, string> = {
  concluido: "border-lexos-cyan/28 bg-lexos-cyan/8 text-lexos-cyan",
  atencao: "border-lexos-gold/34 bg-lexos-gold/[0.075] text-lexos-goldSoft",
  manual: "border-lexos-gold/24 bg-white/[0.035] text-lexos-silver",
  pendente: "border-lexos-gold/30 bg-lexos-gold/[0.06] text-lexos-goldSoft",
};
const moduleStatusClass: Record<ModuleStatus, string> = {
  liberado: "border-lexos-cyan/28 bg-lexos-cyan/8 text-lexos-cyan",
  "em validação":
    "border-lexos-gold/34 bg-lexos-gold/[0.075] text-lexos-goldSoft",
  restrito: "border-white/10 bg-white/[0.035] text-lexos-silver",
  "pós-piloto": "border-lexos-gold/28 bg-lexos-gold/[0.06] text-lexos-goldSoft",
};

const operationalSteps: OperationalStep[] = [
  {
    title: "Revisar identidade do escritório",
    description:
      "Confirmar workspace, identidade operacional e isolamento da demonstração.",
    action: "Conferir dados do escritório",
    status: "concluido",
  },
  {
    title: "Validar usuários e permissões",
    description:
      "Revisar papéis sensíveis antes de compartilhar o ambiente piloto.",
    action: "Abrir usuários",
    status: "manual",
  },
  {
    title: "Cadastrar clientes e processos de teste",
    description:
      "Executar um fluxo demonstrativo com dados locais e fictícios.",
    action: "Validar cadastros",
    status: "concluido",
  },
  {
    title: "Validar tarefas, agenda e financeiro",
    description:
      "Conferir a rotina diária e manter financeiro como controle interno.",
    action: "Executar fluxo operacional",
    status: "atencao",
  },
  {
    title: "Gerar dossiê demonstrativo",
    description: "Validar uma leitura executiva sem envio externo automático.",
    action: "Gerar primeira leitura",
    status: "atencao",
  },
  {
    title: "Revisar governança antes do uso externo",
    description: "Conferir permissões, limites e revisão humana obrigatória.",
    action: "Registrar revisão humana",
    status: "manual",
  },
  {
    title: "Liberar piloto assistido",
    description:
      "Formalizar a apresentação acompanhada e a rotina de feedback.",
    action: "Submeter à revisão final",
    status: "pendente",
  },
];

const safeUseItems = [
  "Não envia dados ou comunicações automaticamente.",
  "Não substitui revisão jurídica nem parecer profissional.",
  "Demonstração com dados locais e fictícios, separada do escritório.",
  "Uso externo exige validação humana e liberação controlada.",
  "Permissões e integrações devem ser revisadas antes da produção.",
];

const nextMovements = [
  {
    title: "Concluir checklist inicial",
    description: "Fechar as validações essenciais do workspace.",
    href: "#checklist-operacional",
    label: "Revisar roteiro",
    status: "Em andamento",
  },
  {
    title: "Validar dados de teste",
    description: "Conferir clientes, processos e persistência local.",
    href: "/clientes",
    label: "Abrir clientes",
    status: "Recomendado",
  },
  {
    title: "Revisar permissões",
    description: "Confirmar responsáveis e acessos sensíveis.",
    href: "/configuracoes/usuarios",
    label: "Abrir usuários",
    status: "Revisão humana",
  },
  {
    title: "Gerar primeira leitura",
    description: "Produzir dossiê demonstrativo com revisão obrigatória.",
    href: "/central-lexos/dossie-rapido",
    label: "Gerar dossiê",
    status: "Recomendado",
  },
  {
    title: "Submeter revisão final",
    description: "Registrar a liberação assistida antes do uso externo.",
    href: "#revisao-final",
    label: "Ver liberação",
    status: "Pendente",
  },
];

const moduleMatrix: Array<{
  name: string;
  status: ModuleStatus;
  description: string;
  route: string;
}> = [
  {
    name: "Configurações / workspace / perfil",
    status: "liberado",
    description: "Identidade e governança inicial do escritório.",
    route: "/configuracoes",
  },
  {
    name: "Usuários e permissões",
    status: "em validação",
    description: "Membros e papéis sensíveis sob revisão assistida.",
    route: "/configuracoes/usuarios",
  },
  {
    name: "Clientes, processos e parcerias",
    status: "liberado",
    description: "Cadastros e vínculos operacionais do piloto.",
    route: "/clientes",
  },
  {
    name: "Tarefas e agenda",
    status: "liberado",
    description: "Responsabilidades, prazos e rotina diária.",
    route: "/tarefas",
  },
  {
    name: "Financeiro",
    status: "restrito",
    description: "Controle interno; sem gateway ou cobrança bancária.",
    route: "/financeiro",
  },
  {
    name: "Painéis executivos",
    status: "restrito",
    description: "Indicadores para perfis autorizados.",
    route: "/socios",
  },
  {
    name: "Relatórios e Central LEX.OS",
    status: "em validação",
    description: "Saídas assistidas com revisão humana obrigatória.",
    route: "/relatorios",
  },
  {
    name: "Auditoria operacional",
    status: "em validação",
    description: "Trilha de atividades conforme fonte ativa.",
    route: "/configuracoes/auditoria",
  },
  {
    name: "Onboarding de produção",
    status: "pós-piloto",
    description: "Adoção ampla após feedback e governança.",
    route: "/onboarding",
  },
];

const quickManual = [
  "Manual rápido do piloto — LEX.OS Control",
  "1. Entrar com usuário autorizado do escritório.",
  "2. Revisar workspace, membros e permissões.",
  "3. Cadastrar clientes e processos de teste.",
  "4. Validar tarefas, agenda e financeiro interno.",
  "5. Gerar relatório ou dossiê demonstrativo.",
  "6. Revisar toda saída antes de uso externo.",
  "7. Registrar feedback e submeter a revisão final.",
].join("\n");
const testChecklist = [
  "Checklist manual do cliente piloto",
  ...manualQaChecklist.map(
    (item, index) => `${index + 1}. ${item.label} — ${item.expected}`,
  ),
].join("\n");
const routeAudit = ["/login", "/dashboard", ...operationalJourneyRoutes];

function safeEscritorioId(
  session: LexosSession,
  state: SettingsLoadState | null,
) {
  return state?.workspaceId || session.user.workspaceId || session.workspace.id;
}

export default function ReleasePage() {
  const [settings, setSettings] = useState<SettingsLoadState | null>(null);
  const [session, setSession] = useState<LexosSession>(() =>
    getCurrentSessionOrFallback(),
  );
  const [toast, setToast] = useState<string | null>(null);
  const dataStatus = getDataSourceStatus();
  const currentRole = normalizeWorkspaceRole(
    settings?.profile.membershipRole || session.user.profile,
  );
  const permissions = getRolePermissions(currentRole);
  const workspaceId = safeEscritorioId(session, settings);
  const completedCount = useMemo(
    () => operationalSteps.filter((item) => item.status === "concluido").length,
    [],
  );
  const pendingCount = useMemo(
    () => operationalSteps.filter((item) => item.status !== "concluido").length,
    [],
  );
  const progressPercent = Math.round(
    (completedCount / operationalSteps.length) * 100,
  );
  const currentStepIndex = operationalSteps.findIndex(
    (item) => item.status !== "concluido",
  );

  useEffect(() => {
    let active = true;
    async function hydrate() {
      const loaded = await loadSettings();
      if (!active) return;
      setSettings(loaded);
      setSession(getCurrentSessionOrFallback());
      if (loaded.mode === "supabase" && loaded.workspaceId) {
        void logSettingsActivity({
          workspaceId: loaded.workspaceId,
          action: "release_page_viewed",
          title: "Central executiva de implantação visualizada",
          description:
            "Página de entrega controlada do LEX.OS Control foi aberta.",
          metadata: { mode: loaded.mode, role: loaded.profile.membershipRole },
        });
      }
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function logReleaseAction(
    action: string,
    title: string,
    description: string,
  ) {
    if (settings?.mode === "supabase" && settings.workspaceId) {
      await logSettingsActivity({
        workspaceId: settings.workspaceId,
        action,
        title,
        description,
        metadata: { role: currentRole, release: "piloto-controlado" },
      });
    }
    setToast(`${title}. Registro de auditoria criado quando permitido.`);
  }

  async function copyText(
    text: string,
    action: string,
    title: string,
    description: string,
  ) {
    await navigator.clipboard.writeText(text);
    await logReleaseAction(action, title, description);
  }

  return (
    <AppLayout>
      <div className="calm-workspace operational-stack-compact mx-auto max-w-[1540px] space-y-6 pb-4">
        <section className="calm-hero operational-hero-compact border border-lexos-cyan/10">
          <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-stretch">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lexos-cyan">
                Implantação · piloto controlado
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white lg:text-3xl">
                Implantação assistida do escritório
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-lexos-silver">
                Uma central de piloto controlado para preparar ambiente,
                permissões, dados de teste e validações em uma implantação
                gradual, segura e assistida.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="calm-primary-action text-xs"
                  onClick={() =>
                    logReleaseAction(
                      "release_marked_ready",
                      "Implantação submetida à revisão",
                      "Status do piloto encaminhado para revisão final.",
                    )
                  }
                  type="button"
                >
                  Submeter revisão final
                </button>
                <Link
                  className="calm-secondary-action text-xs"
                  href="/configuracoes/seguranca"
                >
                  Abrir Segurança/LGPD
                </Link>
                <Link
                  className="calm-secondary-action text-xs"
                  href="/configuracoes/auditoria"
                >
                  Abrir auditoria
                </Link>
              </div>
            </div>
            <aside className="flex flex-col justify-between rounded-[1.25rem] border border-lexos-gold/24 bg-[linear-gradient(135deg,rgba(197,161,89,0.105),rgba(255,255,255,0.025))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lexos-gold">
                Piloto seguro
              </p>
              <p className="mt-2 text-base font-semibold text-white">
                Revisão humana obrigatória
              </p>
              <p className="mt-1.5 text-xs leading-5 text-lexos-silver">
                Sem envio externo automático. O ambiente demo/local permanece
                separado, e qualquer uso externo depende de validação formal do
                escritório.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-lexos-cyan/24 bg-lexos-cyan/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-lexos-cyan">
                  Demo/local
                </span>
                <span className="rounded-full border border-lexos-gold/28 bg-lexos-gold/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-lexos-goldSoft">
                  Supabase separado
                </span>
              </div>
            </aside>
          </div>
        </section>

        <section
          aria-label="Indicadores do piloto"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          <ReleaseStatCard
            label="Status do piloto"
            value="Assistido"
            detail="liberação controlada"
            tone="positive"
          />
          <ReleaseStatCard
            label="Ambiente"
            value="Separado"
            detail="demonstração local"
            tone="premium"
          />
          <ReleaseStatCard
            label="Revisão humana"
            value="Obrigatória"
            detail="antes de uso externo"
            tone="warning"
          />
          <ReleaseStatCard
            label="Dados"
            value="Fictícios"
            detail="isolados do escritório"
            tone="premium"
          />
          <ReleaseStatCard
            label="Pendências"
            value={`${pendingCount}`}
            detail="etapas para revisar"
            tone="warning"
          />
          <ReleaseStatCard
            label="Liberação"
            value={`${progressPercent}%`}
            detail={`${completedCount}/${operationalSteps.length} etapas concluídas`}
            tone="positive"
          />
        </section>

        <section
          className="grid scroll-mt-4 gap-4 xl:grid-cols-[1.34fr_0.66fr]"
          id="checklist-operacional"
        >
          <SectionCard
            className="scroll-mt-4 border-white/[0.055]"
            eyebrow="Roteiro de implantação"
            title="Checklist operacional do piloto"
          >
            <div className="grid gap-2 md:grid-cols-2">
              {operationalSteps.map((step, index) => (
                <OperationalStepCard
                  index={index + 1}
                  isCurrent={index === currentStepIndex}
                  isRelease={index === operationalSteps.length - 1}
                  key={step.title}
                  step={step}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            className="xl:self-start border-lexos-gold/18"
            eyebrow="Uso seguro"
            title="Limites do piloto"
          >
            <p className="mb-2.5 text-xs leading-5 text-lexos-muted">
              Mensagens críticas continuam visíveis para manter a implantação
              assistida e o escopo sob controle.
            </p>
            <div className="rounded-[1.1rem] border border-white/[0.055] bg-white/[0.026] px-3">
              {safeUseItems.map((item) => (
                <div
                  className="flex gap-2.5 border-b border-white/[0.055] py-2.5 text-xs leading-5 text-lexos-silver last:border-b-0"
                  key={item}
                >
                  <span className="mt-[0.43rem] size-1.5 shrink-0 rounded-full border border-lexos-gold/70 bg-lexos-gold/35" />
                  {item}
                </div>
              ))}
            </div>
            <details className="mt-2.5 rounded-[1.1rem] border border-lexos-gold/18 bg-lexos-gold/[0.035] p-3 text-xs leading-5 text-lexos-silver">
              <summary className="cursor-pointer font-semibold text-lexos-gold">
                Ver alertas completos de segurança
              </summary>
              <div className="mt-3 space-y-2">
                {currentSecurityLimitations.map((item) => (
                  <p className="border-t border-lexos-line/60 pt-2" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </details>
          </SectionCard>
        </section>

        <SectionCard
          eyebrow="Próximos movimentos"
          title="Agenda objetiva para liberar o piloto"
        >
          <p className="mb-3 max-w-3xl text-xs leading-5 text-lexos-muted">
            Pendências e próximos passos em leitura executiva: primeiro valide a
            base, depois permissões, dossiê e liberação assistida.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {nextMovements.map((movement) => (
              <MovementCard key={movement.title} movement={movement} />
            ))}
          </div>
        </SectionCard>

        <section
          className="grid scroll-mt-4 gap-4 xl:grid-cols-[0.72fr_1.28fr]"
          id="revisao-final"
        >
          <SectionCard
            eyebrow="Contexto executivo"
            title="Ambiente em validação"
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <InfoTile
                label="Escritório"
                value={
                  settings?.workspace.firmName ||
                  session.workspace.name ||
                  "não resolvido"
                }
              />
              <InfoTile label="Papel atual" value={roleLabels[currentRole]} />
              <InfoTile
                label="Financeiro"
                value={
                  permissions.viewFinance
                    ? "permitido ao papel"
                    : "restrito ao papel"
                }
              />
              <InfoTile
                label="Áreas sensíveis"
                value={
                  permissions.viewPartnersDashboard || permissions.manageMembers
                    ? "acesso autorizado"
                    : "acesso restrito"
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Status e validações"
            title="Matriz compacta dos módulos"
          >
            <div className="space-y-2 md:hidden">
              {moduleMatrix.map((module) => (
                <ModuleValidationCard key={module.name} module={module} />
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-[1.1rem] border border-white/[0.055] bg-white/[0.018] md:block">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="bg-white/[0.035] uppercase tracking-[0.14em] text-lexos-muted">
                  <tr>
                    <th className="w-[27%] px-3 py-2.5">Módulo</th>
                    <th className="w-[18%] px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Leitura</th>
                    <th className="w-[12%] px-3 py-2.5">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleMatrix.map((module) => (
                    <ModuleRow key={module.name} module={module} />
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </section>

        <SectionCard
          className="scroll-mt-4"
          eyebrow="Materiais de apoio"
          title="Validação manual e informações avançadas"
        >
          <div className="grid gap-3 lg:grid-cols-3">
            <SupportPanel
              action="Copiar manual"
              title="Manual rápido do piloto"
              onClick={() =>
                copyText(
                  quickManual,
                  "release_manual_copied",
                  "Manual rápido copiado",
                  "Manual rápido da implantação foi copiado.",
                )
              }
            />
            <SupportPanel
              action="Copiar checklist"
              title="Checklist ponta a ponta"
              onClick={() =>
                copyText(
                  testChecklist,
                  "release_test_checklist_copied",
                  "Checklist copiado",
                  "Checklist manual do piloto foi copiado.",
                )
              }
            />
            <details className="rounded-[1.1rem] border border-white/[0.06] bg-white/[0.026] p-3 text-xs leading-5 text-lexos-silver">
              <summary className="cursor-pointer font-semibold text-lexos-gold">
                Ver informações técnicas
              </summary>
              <div className="mt-3 space-y-1.5 border-t border-lexos-line/60 pt-3">
                <p>
                  Referência técnica:{" "}
                  {workspaceId ? "protegida" : "não resolvida"}
                </p>
                <p>Fonte solicitada: {dataStatus.requested}</p>
                <p>Modo interno: {settings?.mode || session.mode}</p>
                <p>Registro: piloto-controlado</p>
              </div>
            </details>
          </div>
          <details className="mt-3 rounded-[1.1rem] border border-white/[0.06] bg-white/[0.026] p-3 text-xs leading-5 text-lexos-silver">
            <summary className="cursor-pointer font-semibold text-lexos-gold">
              Abrir jornada completa de QA manual e rotas auditadas
            </summary>
            <div className="mt-3 grid gap-2 border-t border-lexos-line/60 pt-3 md:grid-cols-2 xl:grid-cols-3">
              {manualQaChecklist.map((item, index) => (
                <Link
                  className="rounded-xl border border-white/[0.06] bg-white/[0.026] p-3 transition hover:border-lexos-gold/35 hover:bg-white/[0.04]"
                  href={item.route}
                  key={item.id}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lexos-gold">
                    Etapa {index + 1}
                  </span>
                  <p className="mt-1 font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-lexos-muted">{item.expected}</p>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-lexos-line/60 pt-3">
              {routeAudit.map((route) => (
                <Link
                  className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-lexos-muted transition hover:border-lexos-gold/35 hover:text-white"
                  href={route}
                  key={route}
                >
                  {route}
                </Link>
              ))}
            </div>
          </details>
        </SectionCard>
      </div>
      {toast ? (
        <div className="fixed bottom-6 right-6 z-[80] max-w-sm rounded-2xl border border-lexos-gold/26 bg-lexos-panel/95 px-4 py-3 text-sm text-lexos-goldSoft shadow-premium">
          {toast}
        </div>
      ) : null}
    </AppLayout>
  );
}

function ReleaseStatCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "positive" | "premium" | "warning";
  value: string;
}) {
  const toneClass = {
    positive: "border-lexos-cyan/20",
    premium: "border-lexos-gold/24",
    warning: "border-lexos-gold/22",
  }[tone];
  const accentClass = {
    positive: "bg-lexos-cyan/70",
    premium: "bg-lexos-gold/72",
    warning: "bg-lexos-gold/48",
  }[tone];
  return (
    <article
      className={cn(
        "calm-metric-card premium-lift relative overflow-hidden border",
        toneClass,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-px", accentClass)} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lexos-muted">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.11em] text-lexos-goldSoft">
        {detail}
      </p>
    </article>
  );
}

function StatusPill({ status }: { status: ReleaseChecklistStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.11em]",
        statusClass[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function OperationalStepCard({
  index,
  isCurrent,
  isRelease,
  step,
}: {
  index: number;
  isCurrent: boolean;
  isRelease: boolean;
  step: OperationalStep;
}) {
  const cardClass = {
    concluido: "border-lexos-cyan/18 bg-white/[0.026]",
    atencao: "border-lexos-gold/24 bg-lexos-gold/[0.045]",
    manual: "border-lexos-gold/18 bg-white/[0.024]",
    pendente: "border-white/[0.06] bg-white/[0.018]",
  }[step.status];
  const numberClass = {
    concluido: "border-lexos-cyan/42 bg-lexos-cyan/10 text-lexos-cyan",
    atencao: "border-lexos-gold/55 bg-lexos-gold/14 text-lexos-goldSoft",
    manual: "border-lexos-gold/38 bg-lexos-gold/8 text-lexos-goldSoft",
    pendente: "border-lexos-line bg-lexos-card/70 text-lexos-silver",
  }[step.status];
  return (
    <article
      className={cn(
        "premium-lift relative overflow-hidden rounded-[1.1rem] border p-3.5 shadow-[0_10px_26px_rgba(0,0,0,0.06)]",
        cardClass,
        isCurrent &&
          "ring-1 ring-lexos-gold/38 shadow-[0_0_0_1px_rgba(200,164,93,0.08),0_14px_34px_rgba(0,0,0,0.12)]",
        isRelease &&
          "md:col-span-2 border-lexos-gold/30 bg-gradient-to-r from-lexos-gold/[0.08] via-white/[0.025] to-lexos-cyan/[0.045]",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          step.status === "concluido" ? "bg-lexos-cyan/58" : "bg-lexos-gold/56",
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              numberClass,
            )}
          >
            {step.status === "concluido" ? "✓" : index}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isCurrent ? (
                <span className="rounded-full border border-lexos-gold/48 bg-lexos-gold/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-lexos-gold">
                  Etapa atual
                </span>
              ) : null}
              {isRelease ? (
                <span className="rounded-full border border-lexos-gold/38 bg-lexos-gold/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-lexos-goldSoft">
                  Liberação assistida
                </span>
              ) : null}
            </div>
            <h3
              className={cn(
                "text-sm font-semibold leading-5 text-white",
                (isCurrent || isRelease) && "mt-1",
              )}
            >
              {step.title}
            </h3>
          </div>
        </div>
        <StatusPill status={step.status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-lexos-silver">
        {step.description}
      </p>
      <p className="mt-2 border-t border-lexos-line/55 pt-2 text-[11px] font-semibold text-lexos-goldSoft">
        Próxima ação: {step.action}
      </p>
    </article>
  );
}

function MovementCard({
  movement,
}: {
  movement: {
    title: string;
    description: string;
    href: string;
    label: string;
    status: string;
  };
}) {
  return (
    <article className="premium-lift relative flex min-h-[148px] flex-col overflow-hidden rounded-[1.1rem] border border-white/[0.06] bg-white/[0.026] p-3.5">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-lexos-gold/62 via-lexos-cyan/25 to-transparent" />
      <span className="w-fit rounded-full border border-lexos-gold/30 bg-lexos-gold/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-lexos-goldSoft">
        {movement.status}
      </span>
      <h3 className="mt-2 text-sm font-semibold text-white">
        {movement.title}
      </h3>
      <p className="mt-1 flex-1 text-xs leading-5 text-lexos-muted">
        {movement.description}
      </p>
      <Link
        className="mt-3 inline-flex w-fit items-center rounded-lg border border-lexos-gold/32 px-2.5 py-1.5 text-xs font-semibold text-lexos-gold transition hover:bg-lexos-gold/10 hover:text-lexos-goldSoft"
        href={movement.href}
      >
        {movement.label} →
      </Link>
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/[0.055] bg-white/[0.026] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-lexos-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function ModuleStatusPill({ status }: { status: ModuleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
        moduleStatusClass[status],
      )}
    >
      {status}
    </span>
  );
}

function ModuleRow({
  module,
}: {
  module: {
    name: string;
    status: ModuleStatus;
    description: string;
    route: string;
  };
}) {
  return (
    <tr className="border-t border-white/[0.055] text-lexos-silver transition hover:bg-white/[0.035]">
      <td className="px-3 py-2.5 font-semibold leading-5 text-white">
        {module.name}
      </td>
      <td className="px-3 py-2.5">
        <ModuleStatusPill status={module.status} />
      </td>
      <td className="px-3 py-2.5 leading-5 text-lexos-muted">
        {module.description}
      </td>
      <td className="px-3 py-2.5">
        <Link
          className="font-semibold text-lexos-gold transition hover:text-lexos-goldSoft"
          href={module.route}
        >
          Abrir →
        </Link>
      </td>
    </tr>
  );
}

function ModuleValidationCard({
  module,
}: {
  module: {
    name: string;
    status: ModuleStatus;
    description: string;
    route: string;
  };
}) {
  return (
    <article className="rounded-[1rem] border border-white/[0.055] bg-white/[0.026] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold leading-5 text-white">
          {module.name}
        </p>
        <ModuleStatusPill status={module.status} />
      </div>
      <p className="mt-1.5 text-xs leading-5 text-lexos-muted">
        {module.description}
      </p>
      <Link
        className="mt-2 inline-flex text-xs font-semibold text-lexos-gold transition hover:text-lexos-goldSoft"
        href={module.route}
      >
        Abrir →
      </Link>
    </article>
  );
}

function SupportPanel({
  action,
  onClick,
  title,
}: {
  action: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/[0.06] bg-white/[0.024] p-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-lexos-muted">
        Material demonstrativo para validação assistida do escritório.
      </p>
      <button
        className="mt-2.5 rounded-lg border border-lexos-gold/32 px-2.5 py-1.5 text-xs font-semibold text-lexos-gold transition hover:bg-lexos-gold/10"
        onClick={onClick}
        type="button"
      >
        {action}
      </button>
    </div>
  );
}
