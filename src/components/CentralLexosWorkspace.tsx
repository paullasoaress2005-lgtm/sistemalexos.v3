"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui";
import { getCurrentSessionOrFallback } from "@/lib/auth";
import { createCentralExecutionAsync, markCentralExecutionCopiedAsync, type CentralExecution, type CentralExecutionType } from "@/lib/data/centralExecutions";
import { buildSelectionSummary, loadCentralContext, loadCentralContextAsync, type CentralContext, type CentralSelection } from "@/lib/data/centralOperations";
import { FALLBACK_WORKSPACE_ID } from "@/lib/data/clients";
import { shouldUseWorkspaceSupabase } from "@/lib/data/source";

function isRealWorkspaceId(workspaceId: string) {
  return Boolean(workspaceId && !workspaceId.startsWith("workspace-demo-") && workspaceId !== FALLBACK_WORKSPACE_ID);
}

export function useCentralWorkspace() {
  const session = useMemo(() => getCurrentSessionOrFallback(), []);
  const workspaceId = session.workspace?.id || session.user.workspaceId || FALLBACK_WORKSPACE_ID;
  const isSupabaseMode = session.mode === "supabase" && shouldUseWorkspaceSupabase() && isRealWorkspaceId(workspaceId);
  const [context, setContext] = useState<CentralContext>(() => (isSupabaseMode ? { clients: [], processes: [], partnerships: [], tasks: [], agenda: [], finance: [], reports: [] } : loadCentralContext(workspaceId)));
  const [isLoadingContext, setIsLoadingContext] = useState(isSupabaseMode);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoadingContext(isSupabaseMode);
    loadCentralContextAsync(workspaceId)
      .then((nextContext) => {
        if (active) setContext(nextContext);
      })
      .finally(() => {
        if (active) setIsLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [isSupabaseMode, workspaceId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function copyText(text: string, executionId?: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (executionId) await markCentralExecutionCopiedAsync(executionId, workspaceId);
      setToast("Resultado copiado para a área de transferência.");
    } catch {
      setToast("Não foi possível copiar automaticamente. Selecione o texto do resultado e copie manualmente.");
    }
  }

  async function saveExecution(input: { type: CentralExecutionType; title: string; outputText: string; selection: CentralSelection; sourceModule?: string; inputSummary?: string; metadata?: Record<string, unknown> }) {
    const execution = await createCentralExecutionAsync({
      type: input.type,
      title: input.title,
      source_module: input.sourceModule ?? "Central LEX.OS",
      client_id: input.selection.clientId,
      process_id: input.selection.processId,
      partnership_id: input.selection.partnershipId,
      task_id: input.selection.taskId,
      finance_id: input.selection.financeId,
      financial_record_id: input.selection.financeId,
      report_id: input.selection.reportId,
      input_summary: input.inputSummary ?? buildSelectionSummary(context, input.selection),
      output_text: input.outputText,
      metadata: { mode: isSupabaseMode ? "supabase" : "demo", deterministic: true, external_ai: false, ...(input.metadata ?? {}) },
    }, workspaceId);
    setToast(isSupabaseMode ? "Execução salva no histórico da Central LEX.OS do escritório." : "Execução controlada salva no histórico local.");
    return execution;
  }

  return { context, isLoadingContext, isSupabaseMode, workspaceId, toast, setToast, copyText, saveExecution };
}

export function Toast({ message }: { message: string | null }) {
  return message ? <div className="fixed bottom-6 right-6 z-[90] rounded-2xl border border-lexos-gold/40 bg-[#0a1424] px-3.5 py-2.5 text-sm font-semibold text-lexos-gold shadow-premium">{message}</div> : null;
}

export function CentralHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="rounded-[1.6rem] border border-lexos-gold/20 bg-gradient-to-br from-lexos-panel/95 via-lexos-navy/90 to-lexos-ink p-5 shadow-premium lg:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold text-white lg:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-lexos-muted">{description}</p>
    </section>
  );
}

export function SelectionPanel({ context, selection, onChange, includeTask = true, includeFinance = true }: { context: CentralContext; selection: CentralSelection; onChange: (selection: CentralSelection) => void; includeTask?: boolean; includeFinance?: boolean }) {
  const selectClass = "w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-lexos-gold";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Cliente<select className={selectClass} value={selection.clientId ?? ""} onChange={(event) => onChange({ ...selection, clientId: event.target.value || undefined })}><option value="">Base geral</option>{context.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Processo<select className={selectClass} value={selection.processId ?? ""} onChange={(event) => onChange({ ...selection, processId: event.target.value || undefined })}><option value="">Sem processo específico</option>{context.processes.map((process) => <option key={process.id} value={process.id}>{process.number} • {process.client_name}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Parceria<select className={selectClass} value={selection.partnershipId ?? ""} onChange={(event) => onChange({ ...selection, partnershipId: event.target.value || undefined })}><option value="">Sem parceria específica</option>{context.partnerships.map((partnership) => <option key={partnership.id} value={partnership.id}>{partnership.partner_name} • {partnership.status}</option>)}</select></label>
      {includeTask ? <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Tarefa<select className={selectClass} value={selection.taskId ?? ""} onChange={(event) => onChange({ ...selection, taskId: event.target.value || undefined })}><option value="">Sem tarefa específica</option>{context.tasks.map((task) => <option key={task.id} value={task.id}>{task.title} • {task.client_name ?? "interno"}</option>)}</select></label> : null}
      {includeFinance ? <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Financeiro<select className={selectClass} value={selection.financeId ?? ""} onChange={(event) => onChange({ ...selection, financeId: event.target.value || undefined })}><option value="">Sem financeiro específico</option>{context.finance.map((record) => <option key={record.id} value={record.id}>{record.title} • {record.client_name ?? "sem cliente"}</option>)}</select></label> : null}
    </div>
  );
}

export function OutputPanel({ title, output, execution, onCopy, onSave }: { title: string; output: string; execution?: CentralExecution | null; onCopy: () => void; onSave?: () => void }) {
  if (!output) return null;
  return (
    <SectionCard eyebrow="Resultado operacional" title={title} action={<span className="rounded-full border border-lexos-gold/30 px-3 py-1 text-xs text-lexos-gold">{execution ? "salvo" : "prévia"}</span>}>
      <pre className="max-h-[56vh] whitespace-pre-wrap rounded-2xl border border-lexos-line bg-lexos-ink/75 p-4 text-sm leading-6 text-lexos-silver premium-scrollbar overflow-y-auto">{output}</pre>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-3.5 py-2.5 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={onCopy} type="button">Copiar resultado</button>
        {onSave ? <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3.5 py-2.5 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={onSave} type="button">Salvar execução controlada</button> : null}
        <Link className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3.5 py-2.5 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" href="/central-lexos">Ver histórico</Link>
      </div>
    </SectionCard>
  );
}
