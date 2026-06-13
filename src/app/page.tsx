"use client";

import { useMemo, useState } from "react";
import { modules, operationalQueue, records, toneLabel, type ModuleId, type StatusTone, type WorkspaceRecord } from "@/lib/data";

type Command = {
  label: string;
  hint: string;
  key: string;
  module: ModuleId;
  recordId?: string;
  tone: StatusTone;
};

const commands: Command[] = [
  { label: "Dossiê", hint: "abrir análise", key: "D", module: "processos", recordId: "processo-marina", tone: "attention" },
  { label: "Cliente", hint: "novo cadastro", key: "C", module: "clientes", recordId: "cliente-apice", tone: "success" },
  { label: "Prazo", hint: "lançar agenda", key: "P", module: "agenda", recordId: "agenda-audiencia", tone: "risk" },
  { label: "Tarefa", hint: "fila rápida", key: "T", module: "tarefas", recordId: "tarefa-replica", tone: "info" },
  { label: "Central", hint: "fluxos LEX.OS", key: "X", module: "central", recordId: "central-camaleao", tone: "neutral" },
  { label: "Leitura", hint: "sócios", key: "R", module: "relatorios", tone: "neutral" }
];

const moduleOrder: ModuleId[] = ["inicio", "clientes", "processos", "tarefas", "agenda", "financeiro", "central", "relatorios"];

export default function HomePage() {
  const [activeModule, setActiveModule] = useState<ModuleId>("inicio");
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(operationalQueue[0] ?? records[0] ?? null);
  const [query, setQuery] = useState("");

  const active = modules.find((module) => module.id === activeModule) ?? modules[0];

  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const moduleMatch = activeModule === "inicio" || record.module === activeModule;
      const queryMatch = !normalized || [record.title, record.subtitle, record.owner, record.status, record.action].join(" ").toLowerCase().includes(normalized);
      return moduleMatch && queryMatch;
    });
  }, [activeModule, query]);

  const focusRecord = selectedRecord ?? filteredRecords[0] ?? records[0] ?? null;

  function openModule(moduleId: ModuleId) {
    setActiveModule(moduleId);
    setSelectedRecord(records.find((record) => record.module === moduleId) ?? (moduleId === "inicio" ? operationalQueue[0] : null) ?? selectedRecord);
  }

  function runCommand(command: Command) {
    setActiveModule(command.module);
    setSelectedRecord(records.find((record) => record.id === command.recordId) ?? records.find((record) => record.module === command.module) ?? selectedRecord);
  }

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <div className="brand-lockup">
          <img alt="LEX.OS" src="/lexos-logo.png" />
          <div>
            <span>LEX.OS</span>
            <strong>Sistema v3</strong>
          </div>
        </div>

        <label className="global-search">
          <span>Buscar</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="cliente, processo, tarefa..." value={query} />
        </label>

        <div className="session-card">
          <span>Unidade</span>
          <strong>Dra. Helena</strong>
        </div>
      </header>

      <section className="ops-grid">
        <nav className="module-rail" aria-label="Módulos">
          {moduleOrder.map((moduleId) => {
            const module = modules.find((item) => item.id === moduleId);
            if (!module) return null;
            return (
              <button className={module.id === activeModule ? "rail-item active" : "rail-item"} key={module.id} onClick={() => openModule(module.id)} type="button">
                <span>{module.shortLabel.slice(0, 2).toUpperCase()}</span>
                <strong>{module.shortLabel}</strong>
              </button>
            );
          })}
        </nav>

        <section className="desk">
          <div className="desk-head">
            <div>
              <p className="eyebrow">Mesa operacional</p>
              <h1>{active.label}</h1>
            </div>
            <button className="primary-action" type="button">{active.primaryAction}</button>
          </div>

          <section className="command-deck" aria-label="Atalhos principais">
            {commands.map((command) => (
              <button className={`command-tile ${command.tone}`} key={command.label} onClick={() => runCommand(command)} type="button">
                <kbd>{command.key}</kbd>
                <strong>{command.label}</strong>
                <span>{command.hint}</span>
              </button>
            ))}
          </section>

          <section className="signal-strip" aria-label="Indicadores">
            {active.metrics.map((metric) => (
              <button className={`signal ${metric.tone}`} key={metric.label} type="button">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </button>
            ))}
          </section>

          <section className="workbench">
            <div className="queue-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">{activeModule === "inicio" ? "Fila de decisão" : "Registros"}</p>
                  <h2>{filteredRecords.length} item(ns)</h2>
                </div>
                <span>{active.summary}</span>
              </div>

              <div className="queue-list">
                {filteredRecords.map((record) => (
                  <button className={focusRecord?.id === record.id ? "queue-row selected" : "queue-row"} key={record.id} onClick={() => setSelectedRecord(record)} type="button">
                    <div className="row-main">
                      <StatusDot tone={record.tone} />
                      <div>
                        <strong>{record.title}</strong>
                        <span>{record.subtitle}</span>
                      </div>
                    </div>
                    <div className="row-meta">
                      <StatusPill status={record.status} tone={record.tone} />
                      <small>{record.due ?? record.owner}</small>
                    </div>
                  </button>
                ))}

                {!filteredRecords.length ? (
                  <div className="empty-state">
                    <strong>Nenhum item neste recorte.</strong>
                    <span>Troque de módulo ou ajuste a busca.</span>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="inspector" aria-label="Detalhes do item selecionado">
              {focusRecord ? (
                <>
                  <div className="inspector-head">
                    <p className="eyebrow">{toneLabel(focusRecord.tone)}</p>
                    <h2>{focusRecord.title}</h2>
                    <StatusPill status={focusRecord.status} tone={focusRecord.tone} />
                  </div>

                  <div className="mini-facts">
                    <Fact label="Responsável" value={focusRecord.owner} />
                    <Fact label="Prazo" value={focusRecord.due ?? "Sem prazo"} />
                    <Fact label="Valor" value={focusRecord.value ?? "Não aplicável"} />
                  </div>

                  <details className="detail-drawer">
                    <summary>Contexto do item</summary>
                    <ul>
                      {focusRecord.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>

                  <div className="inspector-actions">
                    <button className="primary-action" type="button">{focusRecord.action}</button>
                    <button className="quiet-action" type="button">Criar tarefa</button>
                    <button className="danger-action" type="button">Arquivar</button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <strong>Selecione um item.</strong>
                  <span>O painel lateral mostra apenas o necessário.</span>
                </div>
              )}
            </aside>
          </section>
        </section>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusDot({ tone }: { tone: StatusTone }) {
  return <span aria-hidden="true" className={`status-dot ${tone}`} />;
}

function StatusPill({ status, tone }: { status: string; tone: StatusTone }) {
  return <span className={`status-pill ${tone}`}>{status}</span>;
}
