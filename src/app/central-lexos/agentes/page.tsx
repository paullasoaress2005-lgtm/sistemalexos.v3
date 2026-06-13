"use client";

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CentralHero, OutputPanel, SelectionPanel, Toast, useCentralWorkspace } from "@/components/CentralLexosWorkspace";
import { SectionCard } from "@/components/ui";
import { agentTemplates, generateAgentOutput, type AgentTemplate, type CentralSelection } from "@/lib/data/centralOperations";
import type { CentralExecution } from "@/lib/data/centralExecutions";

export default function Page() {
  const { context, toast, copyText, saveExecution } = useCentralWorkspace();
  const [selected, setSelected] = useState<AgentTemplate>(agentTemplates[0]);
  const [selection, setSelection] = useState<CentralSelection>({});
  const [output, setOutput] = useState("");
  const [execution, setExecution] = useState<CentralExecution | null>(null);

  async function simulate(agent = selected) {
    const nextOutput = generateAgentOutput(agent, context, selection);
    setSelected(agent);
    setOutput(nextOutput);
    setExecution(await saveExecution({ type: "agente", title: agent.name, outputText: nextOutput, selection, sourceModule: "Agentes LEX.OS", inputSummary: agent.description }));
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <CentralHero eyebrow="Central LEX.OS • Agentes" title="Agentes demonstrativos conectados aos módulos internos." description="Simule leituras operacionais baseadas em clientes, prazos, financeiro, atendimento, relatórios e parcerias. Nenhum agente substitui análise jurídica humana." />
        <SectionCard eyebrow="Contexto opcional" title="Selecione dados para orientar a simulação">
          <SelectionPanel context={context} selection={selection} onChange={setSelection} includeTask={false} includeFinance={false} />
        </SectionCard>
        <SectionCard eyebrow="Agentes mínimos" title="Simular atuação controlada">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {agentTemplates.map((agent) => (
              <article className={`rounded-2xl border p-5 shadow-glow transition hover:-translate-y-1 hover:border-lexos-gold ${selected.id === agent.id ? "border-lexos-gold bg-lexos-gold/10" : "border-lexos-line bg-lexos-card/76"}`} key={agent.id}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">{agent.scope}</p>
                <h2 className="mt-3 text-lg font-semibold text-white">{agent.name}</h2>
                <p className="mt-3 text-sm leading-5 text-lexos-muted">{agent.description}</p>
                <button className="mt-5 w-full rounded-xl border border-lexos-gold/45 bg-lexos-gold/10 px-4 py-3 text-sm font-semibold text-lexos-gold transition hover:bg-lexos-gold/15" onClick={() => simulate(agent)} type="button">Simular atuação</button>
              </article>
            ))}
          </div>
        </SectionCard>
        <OutputPanel title={selected.name} output={output} execution={execution} onCopy={() => copyText(output, execution?.id)} />
      </div>
      <Toast message={toast} />
    </AppLayout>
  );
}
