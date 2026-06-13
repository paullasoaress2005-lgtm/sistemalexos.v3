"use client";

import Link from "next/link";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CentralHero, OutputPanel, SelectionPanel, Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { SectionCard } from "@/components/ui";
import { generateDossierOutput, type CentralSelection } from "@/lib/data/centralOperations";
import type { CentralExecution } from "@/lib/data/centralExecutions";

const outputs = ["resumo para cliente", "análise interna", "preparação de reunião", "checklist documental", "próximos passos", "alinhamento com parceiro"];
const urgencies = ["alta", "média", "baixa", "crítica"];

export default function Page() {
  const { context, toast, copyText, saveExecution } = useCentralWorkspace();
  const [selection, setSelection] = useState<CentralSelection>({});
  const [objective, setObjective] = useState("Preparar reunião com visão executiva e próximos passos claros");
  const [urgency, setUrgency] = useState("alta");
  const [outputKind, setOutputKind] = useState(outputs[0]);
  const [output, setOutput] = useState("");
  const [execution, setExecution] = useState<CentralExecution | null>(null);

  const selectedClient = context.clients.find((client) => client.id === selection.clientId);
  const selectedProcess = context.processes.find((process) => process.id === selection.processId);
  const selectedPartnership = context.partnerships.find((partnership) => partnership.id === selection.partnershipId);

  async function generate(save = true) {
    const nextOutput = generateDossierOutput(context, selection, objective, urgency, outputKind);
    setOutput(nextOutput);
    if (save) setExecution(await saveExecution({ type: "dossie_rapido", title: `Dossiê rápido • ${selectedClient?.name ?? selectedProcess?.client_name ?? "base do escritório"}`, outputText: nextOutput, selection, sourceModule: "Dossiê Rápido", inputSummary: `${objective} • ${urgency} • ${outputKind}` }));
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <CentralHero eyebrow="Central LEX.OS • Dossiê Rápido" title="Dossiê consolidado para decisões e reuniões." description="Consolida clientes, processos, parcerias, tarefas, agenda, financeiro e relatórios do escritório em uma saída executiva, sempre sujeita à revisão humana." />
        <SectionCard eyebrow="Gerador controlado" title="Selecione contexto, objetivo e formato">
          <div className="space-y-5">
            <SelectionPanel context={context} selection={selection} onChange={setSelection} includeTask={false} includeFinance={false} />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="md:col-span-1 text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Objetivo<input className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none focus:border-lexos-gold" value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Urgência<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none focus:border-lexos-gold" value={urgency} onChange={(event) => setUrgency(event.target.value)}>{urgencies.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-lexos-muted">Saída desejada<select className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/70 px-3 py-3 text-sm text-white outline-none focus:border-lexos-gold" value={outputKind} onChange={(event) => setOutputKind(event.target.value)}>{outputs.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => generate(true)} type="button">Gerar dossiê</button>
              <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => generate(false)} type="button">Gerar prévia</button>
              {selectedClient ? <Link className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" href={`/clientes/${selectedClient.id}`}>Abrir cliente</Link> : null}
              {selectedProcess ? <Link className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" href={`/processos/${selectedProcess.id}`}>Abrir processo</Link> : null}
              {selectedPartnership ? <Link className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" href="/processos/parcerias">Abrir parceria</Link> : null}
            </div>
          </div>
        </SectionCard>
        <OutputPanel title="Dossiê Rápido" output={output} execution={execution} onCopy={() => copyText(output, execution?.id)} onSave={execution ? undefined : async () => setExecution(await saveExecution({ type: "dossie_rapido", title: "Dossiê rápido demonstrativo", outputText: output, selection, sourceModule: "Dossiê Rápido" }))} />
      </div>
      <Toast message={toast} />
    </AppLayout>
  );
}
