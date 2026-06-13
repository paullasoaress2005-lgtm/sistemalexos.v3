"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CentralHero, OutputPanel, SelectionPanel, Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { SectionCard } from "@/components/ui";
import { flowTemplates, generateFlowOutput, type CentralSelection, type FlowTemplate } from "@/lib/data/centralOperations";
import type { CentralExecution } from "@/lib/data/centralExecutions";

export default function Page() {
  const { context, toast, copyText, saveExecution } = useCentralWorkspace();
  const [selected, setSelected] = useState<FlowTemplate>(flowTemplates[0]);
  const [selection, setSelection] = useState<CentralSelection>({});
  const [checkedByFlow, setCheckedByFlow] = useState<Record<string, string[]>>({});
  const [output, setOutput] = useState("");
  const [execution, setExecution] = useState<CentralExecution | null>(null);
  const checked = useMemo(() => checkedByFlow[selected.id] ?? [], [checkedByFlow, selected.id]);

  function toggle(step: string) {
    setCheckedByFlow((current) => {
      const active = current[selected.id] ?? [];
      return { ...current, [selected.id]: active.includes(step) ? active.filter((item) => item !== step) : [...active, step] };
    });
  }

  async function summarize(save = true) {
    const nextOutput = generateFlowOutput(selected, checked, context, selection);
    setOutput(nextOutput);
    if (save) setExecution(await saveExecution({ type: "fluxo", title: selected.name, outputText: nextOutput, selection, sourceModule: "Fluxos Guiados", inputSummary: `${checked.length}/${selected.steps.length} etapas concluídas` }));
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <CentralHero eyebrow="Central LEX.OS • Fluxos Guiados" title="Checklists executáveis para rotinas jurídicas recorrentes." description="Abra um roteiro, marque etapas na interface, gere resumo de execução e salve no histórico da Central." />
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <SectionCard eyebrow="Fluxos mínimos" title="Roteiros operacionais">
            <div className="space-y-3">
              {flowTemplates.map((flow) => (
                <button className={`w-full rounded-2xl border p-4 text-left transition hover:border-lexos-gold ${selected.id === flow.id ? "border-lexos-gold bg-lexos-gold/10" : "border-lexos-line bg-lexos-card/70"}`} key={flow.id} onClick={() => { setSelected(flow); setOutput(""); setExecution(null); }} type="button">
                  <p className="font-semibold text-white">{flow.name}</p>
                  <p className="mt-2 text-sm leading-5 text-lexos-muted">{flow.objective}</p>
                </button>
              ))}
            </div>
          </SectionCard>
          <SectionCard eyebrow="Roteiro aberto" title={selected.name}>
            <div className="space-y-5">
              <p className="text-sm leading-6 text-lexos-silver">{selected.objective} Responsável sugerido: <span className="text-lexos-gold">{selected.suggestedOwner}</span>.</p>
              <SelectionPanel context={context} selection={selection} onChange={setSelection} includeTask={false} includeFinance={false} />
              <div className="space-y-3">
                {selected.steps.map((step, index) => (
                  <label className="flex items-start gap-3 rounded-2xl border border-lexos-line bg-lexos-card/70 p-4 text-sm text-lexos-silver transition hover:border-lexos-gold/60" key={step}>
                    <input className="mt-1 accent-[#d9b86f]" type="checkbox" checked={checked.includes(step)} onChange={() => toggle(step)} />
                    <span><span className="font-semibold text-white">{index + 1}. </span>{step}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => summarize(true)} type="button">Gerar resumo e salvar</button>
                <button className="rounded-xl border border-lexos-line bg-lexos-card/70 px-4 py-3 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white" onClick={() => copyText(generateFlowOutput(selected, selected.steps, context, selection))} type="button">Copiar roteiro</button>
              </div>
            </div>
          </SectionCard>
        </div>
        <OutputPanel title={`Resumo • ${selected.name}`} output={output} execution={execution} onCopy={() => copyText(output, execution?.id)} />
      </div>
      <Toast message={toast} />
    </AppLayout>
  );
}
