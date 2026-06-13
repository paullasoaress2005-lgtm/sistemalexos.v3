"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui";
import { getCurrentSessionOrFallback, setPendingToast } from "@/lib/auth";
import { archiveProcess, getProcessById, Process, ProcessArea } from "@/lib/data/processes";
import { listPartnershipsByProcessId, ProcessPartnership } from "@/lib/data/partnerships";
import { listTasksByProcessId, resolveEffectiveTaskStatus, Task } from "@/lib/data/tasks";


function formatArea(area: ProcessArea) {
  const labels: Record<ProcessArea, string> = {
    civel: "cível",
    trabalhista: "trabalhista",
    consumidor: "consumidor",
    previdenciario: "previdenciário",
    administrativo: "administrativo",
    tributario: "tributário",
    penal: "penal",
    familia: "família",
    outro: "outro",
  };
  return labels[area];
}

function formatDate(value: string) {
  if (!value) return "Sem prazo definido";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

export default function ProcessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState("workspace-demo-moraes-brito");
  const [process, setProcess] = useState<Process | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [linkedPartnerships, setLinkedPartnerships] = useState<ProcessPartnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    const session = getCurrentSessionOrFallback();
    const sessionWorkspaceId = session.workspace.id || session.user.workspaceId || "workspace-demo-moraes-brito";
    setWorkspaceId(sessionWorkspaceId);
    const currentProcess = getProcessById(params.id, sessionWorkspaceId);
    setProcess(currentProcess);
    setLinkedTasks(currentProcess ? listTasksByProcessId(currentProcess.id, sessionWorkspaceId) : []);
    setLinkedPartnerships(currentProcess ? listPartnershipsByProcessId(currentProcess.id, sessionWorkspaceId) : []);
    setLoading(false);
  }, [params.id]);

  function confirmArchive() {
    if (!process) return;
    const archived = archiveProcess(process.id, workspaceId);
    if (archived) {
      setPendingToast("Processo arquivado nesta demonstração.");
      router.push("/processos");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <section className="rounded-[1.35rem] border border-lexos-gold/20 bg-gradient-to-br from-lexos-panel/95 via-lexos-navy/92 to-lexos-ink p-5 shadow-premium lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">Processo específico • busca global</p>
              <h1 className="mt-3 max-w-4xl text-3xl font-semibold text-white lg:text-4xl">
                {process ? process.number : "Detalhe do processo"}
              </h1>
              <p className="mt-2.5 max-w-3xl text-sm leading-5 text-lexos-muted">
                Resultado aberto pelo identificador interno do processo, sem conexão com tribunais ou integrações externas.
              </p>
            </div>
            <Link className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-5 py-3 text-center text-sm font-semibold text-lexos-gold transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:shadow-glow" href="/processos">
              Voltar para processos
            </Link>
          </div>
        </section>

        {loading ? (
          <EmptyState title="Carregando processo..." description="Validando sessão e buscando o registro do escritório." />
        ) : process ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <SectionCard eyebrow="Dados processuais" title={process.title || process.number}>
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.35rem] border border-lexos-line/85 bg-lexos-card/70 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-lexos-gold">{formatArea(process.area)} • {process.phase}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{process.client_name}</h2>
                    <p className="mt-1 text-sm text-lexos-muted">Parte contrária: {process.opposing_party || "não informada"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><StatusBadge status={process.status} /><StatusBadge status={`risco ${process.risk}`} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Número" value={process.number} />
                  <Info label="Cliente vinculado" value={process.client_name} />
                  <Info label="Tribunal/órgão" value={process.court || "Não informado"} />
                  <Info label="Comarca/foro/jurisdição" value={process.jurisdiction || "Não informado"} />
                  <Info label="Status" value={process.status} />
                  <Info label="Risco" value={process.risk} />
                  <Info label="Prioridade" value={process.priority} />
                  <Info label="Responsável" value={process.responsible} />
                  <Info label="Próximo prazo" value={formatDate(process.next_deadline_at)} />
                  <Info label="Próxima ação" value={process.next_action || "Definir próxima ação"} />
                </div>
                <TextBlock title="Assunto principal" value={process.main_issue || "Sem assunto registrado."} />
                <TextBlock title="Observações" value={process.notes || "Sem observações registradas."} />
                {process.archived_at ? <Info label="Arquivado em" value={new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(process.archived_at))} /> : null}
                <div className="flex flex-wrap gap-3 border-t border-lexos-line/80 pt-5">
                  <Link className="rounded-2xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/18" href="/processos">
                    Editar na carteira
                  </Link>
                  {process.status !== "arquivado" ? (
                    <button className="rounded-2xl border border-lexos-wine/55 px-4 py-3 text-sm font-semibold text-lexos-red transition hover:bg-lexos-wine/14" onClick={() => setArchiveOpen(true)} type="button">
                      Arquivar processo
                    </button>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard eyebrow="Vínculos" title="Tarefas e parcerias do processo">
              <div className="space-y-3">
                <Link className="block rounded-2xl border border-lexos-gold/35 bg-lexos-gold/10 p-4 text-sm font-semibold text-lexos-gold transition hover:border-lexos-gold/70 hover:bg-lexos-gold/16" href={`/processos/parcerias?processId=${process.id}`}>Ver parcerias deste processo →</Link>
                {linkedPartnerships.length ? linkedPartnerships.map((partnership) => (
                  <Link className="block rounded-2xl border border-lexos-line/65 bg-lexos-ink/55 p-3 text-sm leading-6 text-lexos-silver transition hover:border-lexos-gold/45 hover:text-white" href={`/processos/parcerias?partnershipId=${partnership.id}`} key={partnership.id}>
                    <span className="font-semibold text-white">{partnership.partner_name}</span><br />
                    {partnership.partner_firm} • {partnership.status} • {partnership.next_action}
                  </Link>
                )) : <p className="rounded-2xl border border-dashed border-lexos-gold/25 bg-lexos-ink/45 p-4 text-sm leading-5 text-lexos-muted">Nenhuma parceria vinculada a este processo nesta demonstração.</p>}
                <div className="border-t border-lexos-line/70 pt-3" />
                {linkedTasks.length ? linkedTasks.map((task) => (
                  <Link className="block rounded-2xl border border-lexos-line/65 bg-lexos-ink/55 p-3 text-sm leading-6 text-lexos-silver transition hover:border-lexos-gold/45 hover:text-white" href={`/tarefas?taskId=${task.id}`} key={task.id}>
                    <span className="font-semibold text-white">{task.title}</span><br />
                    {task.responsible} • {task.priority} • {resolveEffectiveTaskStatus(task)}
                  </Link>
                )) : <p className="rounded-2xl border border-dashed border-lexos-gold/25 bg-lexos-ink/45 p-4 text-sm leading-5 text-lexos-muted">Nenhuma tarefa vinculada a este processo ainda.</p>}
                <p className="rounded-2xl border border-lexos-gold/20 bg-lexos-gold/8 p-4 text-xs leading-5 text-lexos-goldSoft">Vínculos operacionais preparados para acompanhamento do caso.</p>
              </div>
            </SectionCard>
          </div>
        ) : (
          <EmptyState title="Processo não encontrado" description="O registro pode não existir neste escritório ou pode ter sido arquivado." />
        )}
      </div>

      {archiveOpen && process ? <ArchiveProcessModal process={process} onCancel={() => setArchiveOpen(false)} onConfirm={confirmArchive} /> : null}
    </AppLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-line/70 bg-lexos-ink/55 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">{label}</p><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>;
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-lexos-gold/15 bg-lexos-ink/55 p-4"><p className="text-sm text-lexos-muted">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-lexos-silver">{value}</p></div>;
}

function ArchiveProcessModal({ process, onCancel, onConfirm }: { process: Process; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-lexos-ink/72 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[1.75rem] border border-lexos-gold/30 bg-[#0b1728] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.78)] ring-1 ring-white/5"><div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/70 p-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">Confirmação operacional</p><h2 className="mt-3 text-2xl font-semibold text-white">Arquivar processo</h2><p className="mt-3 text-sm leading-5 text-lexos-muted">Este processo será marcado como arquivado. O registro não será excluído.</p><div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-muted">Processo selecionado</p><p className="mt-2 text-lg font-semibold text-white">{process.number}</p><p className="mt-1 text-sm text-lexos-muted">Cliente: {process.client_name}</p></div></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-2xl border border-lexos-line px-5 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-lexos-gold" onClick={onCancel} type="button">Cancelar</button><button className="rounded-2xl border border-lexos-wine/65 bg-lexos-wine/18 px-5 py-3 text-sm font-semibold text-lexos-red transition hover:-translate-y-0.5 hover:bg-lexos-wine/26 hover:shadow-[0_18px_48px_rgba(122,27,54,0.22)]" onClick={onConfirm} type="button">Arquivar processo</button></div></div></div>;
}
