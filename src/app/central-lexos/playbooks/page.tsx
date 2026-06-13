"use client";

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CentralHero, OutputPanel, SelectionPanel, Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { DetailBlock, SimulationModal } from "@/components/SimulationModal";
import { SectionCard } from "@/components/ui";
import { generatePlaybookOutput, playbookTemplates, type CentralSelection, type PlaybookTemplate } from "@/lib/data/centralOperations";
import type { CentralExecution } from "@/lib/data/centralExecutions";

export default function Page() {
  const { context, toast, copyText, saveExecution } = useCentralWorkspace();
  const [selection, setSelection] = useState<CentralSelection>({});
  const [selected, setSelected] = useState<PlaybookTemplate | null>(null);
  const [output, setOutput] = useState("");
  const [execution, setExecution] = useState<CentralExecution | null>(null);

  async function save(playbook: PlaybookTemplate) {
    const nextOutput = generatePlaybookOutput(playbook, context, selection);
    setOutput(nextOutput);
    setExecution(await saveExecution({ type: "playbook", title: playbook.name, outputText: nextOutput, selection, sourceModule: "Playbooks", inputSummary: playbook.objective }));
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <CentralHero eyebrow="Central LEX.OS • Playbooks" title="Manuais acionáveis para operação jurídica premium." description="Cada playbook traz objetivo, quando usar, checklist, responsável sugerido, riscos comuns, padrão de mensagem e registro da execução no histórico adequado." />
        <SectionCard eyebrow="Contexto opcional" title="Vincular dados locais ao playbook">
          <SelectionPanel context={context} selection={selection} onChange={setSelection} includeTask={false} includeFinance={false} />
        </SectionCard>
        <SectionCard eyebrow="Playbooks mínimos" title="Biblioteca operacional">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playbookTemplates.map((playbook) => (
              <article className="flex min-h-[390px] flex-col rounded-2xl border border-lexos-line bg-lexos-card/76 p-5 shadow-glow transition hover:-translate-y-1 hover:border-lexos-gold/60" key={playbook.id}>
                <h2 className="text-lg font-semibold text-white">{playbook.name}</h2>
                <p className="mt-3 text-sm leading-6 text-lexos-silver"><span className="text-lexos-muted">Objetivo: </span>{playbook.objective}</p>
                <p className="mt-3 text-sm leading-6 text-lexos-silver"><span className="text-lexos-muted">Quando usar: </span>{playbook.whenToUse}</p>
                <p className="mt-3 text-sm text-lexos-silver"><span className="text-lexos-muted">Responsável: </span>{playbook.suggestedOwner}</p>
                <div className="mt-4 flex flex-wrap gap-2">{playbook.checklist.map((item) => <span className="rounded-full border border-lexos-line bg-lexos-ink/55 px-3 py-1 text-xs text-lexos-silver" key={item}>{item}</span>)}</div>
                {playbook.message ? <p className="mt-4 rounded-xl border border-lexos-gold/20 bg-lexos-gold/10 p-3 text-sm leading-6 text-lexos-silver">“{playbook.message}”</p> : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  <button className="rounded-xl border border-lexos-gold/40 bg-lexos-gold/10 px-3 py-2 text-xs font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => setSelected(playbook)} type="button">Abrir checklist</button>
                  <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => copyText(generatePlaybookOutput(playbook, context, selection))} type="button">Copiar playbook</button>
                  <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-3 py-2 text-xs font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => save(playbook)} type="button">Salvar execução controlada</button>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
        <OutputPanel title="Playbook salvo" output={output} execution={execution} onCopy={() => copyText(output, execution?.id)} />
      </div>
      {selected ? <SimulationModal eyebrow="Checklist acionável" onClose={() => setSelected(null)} title={selected.name} wide><div className="grid gap-4 md:grid-cols-2"><DetailBlock title="Checklist" items={selected.checklist} /><DetailBlock title="Riscos comuns" items={selected.commonRisks} /></div><p className="mt-4 rounded-2xl border border-lexos-line bg-lexos-card/70 p-4 text-sm leading-6 text-lexos-silver">{selected.message ?? "Adaptar a comunicação ao caso concreto antes de qualquer envio."}</p><p className="mt-4 text-xs text-lexos-muted">Saída controlada. Revisão humana obrigatória antes de qualquer uso externo.</p></SimulationModal> : null}
      <Toast message={toast} />
    </AppLayout>
  );
}
