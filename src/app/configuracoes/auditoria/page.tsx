"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { SectionCard } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth/session";
import { getActivityModuleLabel, getActivityRoute, listActivityLogs, type ActivityLog } from "@/lib/data/activityLogs";
import { shouldUseWorkspaceSupabase } from "@/lib/data/source";

const moduleOptions = [
  "todos",
  "clients",
  "processes",
  "process_partnerships",
  "tasks",
  "agenda",
  "financeiro",
  "reports",
  "central_lexos",
  "prompts",
  "usuarios",
  "configuracoes",
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AuditoriaPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("todos");
  const [actionFilter, setActionFilter] = useState("todos");
  const isSupabaseMode = shouldUseWorkspaceSupabase();

  useEffect(() => {
    let alive = true;
    async function load() {
      setIsLoading(true);
      const session = await getCurrentSessionOrFallback();
      const nextWorkspaceId = session.mode === "supabase" ? session.user.workspaceId : null;
      if (!alive) return;
      setWorkspaceId(nextWorkspaceId ?? null);
      if (!nextWorkspaceId || !isSupabaseMode) {
        setLogs([]);
        setIsLoading(false);
        return;
      }
      const nextLogs = await listActivityLogs(nextWorkspaceId, { limit: 200 });
      if (!alive) return;
      setLogs(nextLogs);
      setIsLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [isSupabaseMode]);

  const actions = useMemo(() => ["todos", ...Array.from(new Set(logs.map((log) => log.action))).sort()], [logs]);
  const filtered = useMemo(
    () => logs.filter((log) => (moduleFilter === "todos" || log.entity_type === moduleFilter) && (actionFilter === "todos" || log.action === actionFilter)),
    [actionFilter, logs, moduleFilter],
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <section className="rounded-[1.6rem] border border-lexos-gold/25 bg-gradient-to-br from-lexos-panel via-lexos-card to-lexos-navy p-6 shadow-glow md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-lexos-gold">Configurações • Auditoria operacional</p>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Auditoria operacional do escritório</h1>
          <p className="mt-3 max-w-3xl text-sm leading-5 text-lexos-muted">
            Consulta de rastreabilidade operacional. A demonstração permanece separada e não lê nem grava auditoria do ambiente conectado.
          </p>
          <Link className="mt-5 inline-flex rounded-xl border border-lexos-gold/40 px-4 py-2 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/10" href="/configuracoes">
            Voltar para Configurações
          </Link>
        </section>

        <SectionCard eyebrow="Filtros" title="Recorte de auditoria">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm text-lexos-silver">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">Módulo</span>
              <select className="w-full rounded-2xl border border-lexos-line bg-lexos-ink/80 px-4 py-3 text-white outline-none focus:border-lexos-gold" onChange={(event) => setModuleFilter(event.target.value)} value={moduleFilter}>
                {moduleOptions.map((module) => <option key={module} value={module}>{module === "todos" ? "Todos" : getActivityModuleLabel(module)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-lexos-silver">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">Ação</span>
              <select className="w-full rounded-2xl border border-lexos-line bg-lexos-ink/80 px-4 py-3 text-white outline-none focus:border-lexos-gold" onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
                {actions.map((action) => <option key={action} value={action}>{action === "todos" ? "Todas" : action}</option>)}
              </select>
            </label>
            <div className="rounded-2xl border border-lexos-line bg-lexos-card/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">Ambiente</p>
              <p className="mt-2 text-sm text-lexos-silver">{workspaceId ? "Escritório conectado" : "Demonstração separada"}</p>
            </div>
          </div>
        </SectionCard>



        <SectionCard eyebrow="Informações avançadas" title="Detalhes técnicos recolhidos">
          <details className="rounded-2xl border border-lexos-line bg-lexos-ink/55 p-4 text-sm leading-6 text-lexos-silver">
            <summary className="cursor-pointer font-semibold text-lexos-gold">Mostrar informações técnicas</summary>
            <div className="mt-4 space-y-2">
              <p>Referência técnica do escritório: {workspaceId ? "oculta na interface" : "não resolvida"}</p>
              <p>Identificadores de entidades ficam preservados nos registros de auditoria e não são exibidos na tabela principal.</p>
            </div>
          </details>
        </SectionCard>

        <SectionCard eyebrow="Auditoria" title="Eventos registrados">
          {!isSupabaseMode ? (
            <div className="rounded-2xl border border-dashed border-lexos-gold/30 bg-lexos-card/55 p-5 text-sm text-lexos-muted">Modo demonstração ativo: auditorias do escritório conectado não são exibidas.</div>
          ) : isLoading ? (
            <div className="rounded-2xl border border-lexos-line bg-lexos-card/55 p-5 text-sm text-lexos-muted">Carregando auditoria operacional...</div>
          ) : filtered.length ? (
            <div className="overflow-hidden rounded-2xl border border-lexos-line">
              <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1.5fr_1fr] gap-3 border-b border-lexos-line bg-lexos-ink/80 p-3 text-xs font-semibold uppercase tracking-[0.14em] text-lexos-gold">
                <span>Data</span><span>Ação</span><span>Módulo</span><span>Usuário</span><span>Descrição</span><span>Registro</span>
              </div>
              {filtered.map((log) => (
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1.5fr_1fr] gap-3 border-b border-lexos-line/70 p-3 text-sm text-lexos-silver last:border-b-0" key={log.id}>
                  <span>{formatDateTime(log.created_at)}</span>
                  <span className="font-semibold text-white">{log.action}</span>
                  <span>{getActivityModuleLabel(log.entity_type)}</span>
                  <span>{log.actor_name || log.actor_email || "Usuário autenticado"}</span>
                  <span>{log.description || log.title || "Sem descrição"}</span>
                  <Link className="text-lexos-gold hover:text-lexos-goldSoft" href={getActivityRoute(log)}>Abrir registro</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-lexos-gold/30 bg-lexos-card/55 p-5 text-sm text-lexos-muted">Nenhuma atividade operacional registrada neste escritório ainda.</div>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
