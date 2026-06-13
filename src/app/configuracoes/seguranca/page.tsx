"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { SectionCard, StatCard } from "@/components/ui";
import { getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";
import { logSettingsActivity } from "@/lib/data/activityLogs";
import { getDataSourceStatus } from "@/lib/data/source";
import { loadSettings, type SettingsLoadState } from "@/lib/data/settings";
import { currentSecurityLimitations, lgpdChecklistItems, productionReadinessItems, realDataModules, type ChecklistStatus } from "@/lib/security";
import { getRolePermissions, normalizeWorkspaceRole, roleLabels } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const statusLabels: Record<ChecklistStatus, string> = {
  concluido: "Concluído",
  atencao: "Atenção",
  manual: "Manual",
};

const statusClass: Record<ChecklistStatus, string> = {
  concluido: "border-lexos-green/45 bg-lexos-green/10 text-lexos-green",
  atencao: "border-lexos-gold/45 bg-lexos-gold/10 text-lexos-goldSoft",
  manual: "border-lexos-line bg-lexos-card/70 text-lexos-silver",
};

function readinessStatus(mode: string | undefined, configured: boolean, workspaceId: string | null | undefined) {
  if (mode === "supabase" && configured && workspaceId) return "Pronto para piloto controlado";
  if (configured || workspaceId) return "Atenção";
  return "Não pronto";
}

function safeWorkspaceId(session: LexosSession, state: SettingsLoadState | null) {
  return state?.workspaceId || session.user.workspaceId || session.workspace.id;
}

export default function SegurancaPage() {
  const [settings, setSettings] = useState<SettingsLoadState | null>(null);
  const [session, setSession] = useState<LexosSession>(() => getCurrentSessionOrFallback());
  const [toast, setToast] = useState<string | null>(null);
  const dataStatus = getDataSourceStatus();

  const currentRole = normalizeWorkspaceRole(settings?.profile.membershipRole || session.user.profile);
  const permissions = getRolePermissions(currentRole);
  const workspaceId = safeWorkspaceId(session, settings);
  const readyStatus = useMemo(() => readinessStatus(settings?.mode, dataStatus.supabaseConfigured, settings?.workspaceId), [dataStatus.supabaseConfigured, settings?.mode, settings?.workspaceId]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      const loaded = await loadSettings();
      if (!active) return;
      const currentSession = getCurrentSessionOrFallback();
      setSettings(loaded);
      setSession(currentSession);
      if (loaded.mode === "supabase" && loaded.workspaceId) {
        void logSettingsActivity({
          workspaceId: loaded.workspaceId,
          action: "security_page_viewed",
          title: "Segurança e LGPD visualizada",
          description: "Página de segurança, LGPD e prontidão de produção foi aberta.",
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

  async function logReview(action: string, title: string, description: string) {
    if (settings?.mode === "supabase" && settings.workspaceId) {
      await logSettingsActivity({ workspaceId: settings.workspaceId, action, title, description, metadata: { role: currentRole } });
    }
    setToast(`${title} registrado para auditoria operacional quando permitido.`);
  }

  async function copyRecommendations() {
    const text = [
      "LEX.OS Control — recomendações antes do piloto controlado",
      ...currentSecurityLimitations.map((item) => `- ${item}`),
      "- Revisar permissões, registros de validação e saídas antes de uso externo.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    await logReview("security_recommendation_copied", "Recomendações copiadas", "Recomendações de segurança e limitações foram copiadas.");
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <section className="rounded-[1.35rem] border border-lexos-gold/20 bg-gradient-to-br from-lexos-panel/95 via-lexos-navy/92 to-lexos-ink p-5 shadow-premium lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">Segurança e LGPD</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold text-white lg:text-4xl">Segurança operacional para o escritório.</h1>
          <p className="mt-2.5 max-w-3xl text-sm leading-7 text-lexos-silver">Checklist operacional de apoio à conformidade. Não substitui revisão jurídica específica, termos públicos definitivos ou auditoria final de produção.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <StatCard label="Ambiente" value={settings?.mode === "supabase" ? "Dados do escritório ativos" : "Demonstração separada"} detail={settings?.mode === "supabase" ? "ambiente do escritório" : "sem consultar o escritório"} tone="premium" />
            <StatCard label="Escritório" value={settings?.workspace.firmName || session.workspace.name} detail={workspaceId ? "resolvido" : "pendente"} tone={workspaceId ? "positive" : "warning"} />
            <StatCard label="Status piloto" value={readyStatus} detail="prontidão operacional" tone={readyStatus === "Pronto para piloto controlado" ? "positive" : "warning"} />
          </div>
        </section>

        <SectionCard eyebrow="Diagnóstico do ambiente" title="Ambiente atual e separação de demonstração">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Usuário atual" value={settings?.profile.fullName || session.user.name} />
            <InfoTile label="E-mail" value={settings?.userEmail || session.user.email} />
            <InfoTile label="Papel atual" value={roleLabels[currentRole]} />
            <InfoTile label="Ambiente conectado" value={dataStatus.supabaseConfigured ? "sim" : "não"} />
            <InfoTile label="Controle de acesso" value="por usuário autorizado" />
            <InfoTile label="Demonstração separada" value={settings?.mode === "supabase" ? "demonstração não consultada" : "ambiente conectado não consultado"} />
            <InfoTile label="Auditoria operacional" value={settings?.mode === "supabase" ? "ativa quando permitido" : "orientação local"} />
            <InfoTile label="Configurações avançadas" value={permissions.editWorkspaceSettings ? "gestores autorizados" : "restritas"} />
          </div>
          <p className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/60 p-4 text-sm leading-6 text-lexos-silver">Dados do escritório permanecem isolados por usuário autorizado. A demonstração permanece local e não consulta registros do escritório.</p>
        </SectionCard>

        <SectionCard eyebrow="LGPD operacional" title="Checklist prudente de apoio à conformidade" action={<button className="rounded-xl border border-lexos-gold/40 px-3 py-2 text-xs font-semibold text-lexos-gold" onClick={() => logReview("lgpd_checklist_reviewed", "Checklist LGPD revisado", "Checklist operacional de LGPD foi revisado.")} type="button">Registrar revisão</button>}>
          <div className="grid gap-3 lg:grid-cols-2">
            {lgpdChecklistItems.map((item) => <ChecklistRow item={item} key={item.title} />)}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Prontidão" title="Pronto para piloto controlado" action={<button className="rounded-xl border border-lexos-gold/40 px-3 py-2 text-xs font-semibold text-lexos-gold" onClick={() => logReview("production_readiness_reviewed", "Prontidão revisada", "Critérios de prontidão para piloto controlado foram revisados.")} type="button">Registrar prontidão</button>}>
          <div className="mb-5 rounded-2xl border border-lexos-gold/24 bg-lexos-gold/10 p-4 text-sm font-semibold text-lexos-goldSoft">Status sugerido: {readyStatus}. Validação manual com usuário real ainda é obrigatória antes de entregar ao escritório.</div>
          <div className="grid gap-3 lg:grid-cols-2">
            {productionReadinessItems.map((item) => <ChecklistRow item={item} key={item.title} />)}
          </div>
        </SectionCard>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard eyebrow="Módulos do escritório" title="Áreas liberadas para validação operacional">
            <div className="grid gap-2 md:grid-cols-2">
              {realDataModules.map((module) => <span className="subtle-hover-card rounded-2xl border border-lexos-line bg-lexos-card/65 px-3 py-2 text-sm text-lexos-silver" key={module}>{module}</span>)}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Limitações" title="O que ainda não deve ser tratado como produção pública" action={<button className="rounded-xl border border-lexos-line px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={copyRecommendations} type="button">Copiar recomendações</button>}>
            <ul className="space-y-3 text-sm leading-6 text-lexos-silver">
              {currentSecurityLimitations.map((item) => <li className="subtle-hover-card rounded-2xl border border-lexos-line bg-lexos-ink/55 p-3" key={item}>{item}</li>)}
            </ul>
          </SectionCard>
        </section>



        <SectionCard eyebrow="Informações avançadas" title="Detalhes técnicos recolhidos">
          <details className="subtle-hover-card rounded-2xl border border-lexos-line bg-lexos-ink/55 p-4 text-sm leading-6 text-lexos-silver">
            <summary className="cursor-pointer font-semibold text-lexos-gold">Mostrar informações técnicas</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoTile label="Referência técnica protegida" value={workspaceId ? "oculta na interface" : "não resolvida"} />
              <InfoTile label="Fonte de dados solicitada" value={dataStatus.requested} />
              <InfoTile label="Controle por usuário" value="membro ativo do escritório" />
              <InfoTile label="Auditoria" value={settings?.mode === "supabase" ? "registrada quando autorizada" : "local/controlada"} />
            </div>
          </details>
        </SectionCard>

        <SectionCard eyebrow="Registros de validação" title="Limpeza segura e sem exclusão automática" action={<button className="rounded-xl border border-lexos-gold/40 px-3 py-2 text-xs font-semibold text-lexos-gold" onClick={() => logReview("test_data_review_requested", "Revisão de registros de validação solicitada", "Usuário abriu orientação de revisão manual de registros de validação.")} type="button">Registrar orientação</button>}>
          <p className="text-sm leading-7 text-lexos-silver">Revise registros de validação nos primeiros passos e nos módulos operacionais. Arquive manualmente quando necessário, não misture dados de cliente com validações e não apague registros automaticamente.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="rounded-xl border border-lexos-gold/40 px-4 py-2 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/10" href="/onboarding">Abrir primeiros passos</Link>
            <Link className="rounded-xl border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" href="/configuracoes/auditoria">Abrir auditoria</Link>
            <Link className="rounded-xl border border-lexos-line px-4 py-2 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" href="/dashboard">Voltar ao Dashboard</Link>
          </div>
        </SectionCard>
      </div>
      {toast ? <div className="fixed bottom-6 right-6 z-[80] max-w-sm rounded-2xl border border-lexos-gold/35 bg-lexos-panel px-4 py-3 text-sm text-lexos-goldSoft shadow-premium">{toast}</div> : null}
    </AppLayout>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="subtle-hover-card rounded-2xl border border-lexos-line bg-lexos-card/70 p-4"><p className="text-xs uppercase tracking-[0.18em] text-lexos-muted">{label}</p><p className="mt-2 break-words text-sm font-semibold text-white">{value}</p></div>;
}

function ChecklistRow({ item }: { item: { title: string; detail: string; status: ChecklistStatus } }) {
  return (
    <article className="subtle-hover-card rounded-2xl border border-lexos-line bg-lexos-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white">{item.title}</h3>
        <span className={cn("shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", statusClass[item.status])}>{statusLabels[item.status]}</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-lexos-muted">{item.detail}</p>
    </article>
  );
}
