"use client";

import { useMemo, useState } from "react";
import { modules, operationalQueue, records, toneLabel, type ModuleId, type StatusTone, type WorkspaceRecord } from "@/lib/data";

type Shortcut = {
  label: string;
  description: string;
  module: ModuleId;
  recordId?: string;
  tone: StatusTone;
};

const shortcuts: Shortcut[] = [
  { label: "Novo dossiê", description: "abrir análise", module: "processos", recordId: "processo-marina", tone: "attention" },
  { label: "Cadastrar cliente", description: "nova relação", module: "clientes", recordId: "cliente-apice", tone: "success" },
  { label: "Criar tarefa", description: "fila rápida", module: "tarefas", recordId: "tarefa-replica", tone: "info" },
  { label: "Lançar prazo", description: "agenda e caso", module: "agenda", recordId: "agenda-audiencia", tone: "risk" },
  { label: "Central LEX.OS", description: "prompts e fluxos", module: "central", recordId: "central-camaleao", tone: "neutral" },
  { label: "Relatório", description: "leitura dos sócios", module: "relatorios", tone: "neutral" }
];

const moduleGroups: Array<{ label: string; ids: ModuleId[] }> = [
  { label: "Operação", ids: ["inicio", "clientes", "processos", "tarefas", "agenda"] },
  { label: "Gestão", ids: ["financeiro", "central", "relatorios"] }
];

export default function HomePage() {
  const [activeModule, setActiveModule] = useState<ModuleId>("inicio");
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(operationalQueue[0] ?? records[0] ?? null);
  const [query, setQuery] = useState("");

  const active = modules.find((module) => module.id === activeModule) ?? modules[0];
  const activeRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const moduleMatch = activeModule === "inicio" || record.module === activeModule;
      const queryMatch = !normalized || [record.title, record.subtitle, record.owner, record.status, record.action].join(" ").toLowerCase().includes(normalized);
      return moduleMatch && queryMatch;
    });
  }, [activeModule, query]);

  function openModule(moduleId: ModuleId) {
    setActiveModule(moduleId);
    const target = records.find((record) => record.module === moduleId) ?? (moduleId === "inicio" ? operationalQueue[0] : null) ?? selectedRecord;
    setSelectedRecord(target);
  }

  function openShortcut(shortcut: Shortcut) {
    setActiveModule(shortcut.module);
    setSelectedRecord(records.find((record) => record.id === shortcut.recordId) ?? records.find((record) => record.module === shortcut.module) ?? selectedRecord);
  }

  return (
    <main className="lexos-shell">
      <aside className="sidebar premium-scrollbar" aria-label="Navegação principal">
        <div className="brand-card">
          <img alt="LEX.OS" src="/lexos-logo.png" />
          <div>
            <span>LEX.OS</span>
            <strong>Control</strong>
            <small>operação jurídica</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {moduleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.ids.map((moduleId) => {
                const module = modules.find((item) => item.id === moduleId);
                if (!module) return null;
                return (
                  <button className={module.id === activeModule ? "nav-item active" : "nav-item"} key={module.id} onClick={() => openModule(module.id)} type="button">
                    <span>{module.shortLabel}</span>
                    <small>{module.metrics[0]?.value ?? "0"}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="unit-card">
          <p>Unidade</p>
          <strong>Escritório Demonstração</strong>
          <span>Dados locais para validação visual.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Sistema LEX.OS · V3</p>
            <h1>{active.label}</h1>
            <span>{active.summary}</span>
          </div>

          <div className="topbar-actions">
            <button className="button secondary" type="button">Alertas</button>
            <button className="button primary" type="button">{active.primaryAction}</button>
          </div>
        </header>

        <nav className="mobile-tabs premium-scrollbar" aria-label="Módulos">
          {modules.map((module) => (
            <button className={module.id === activeModule ? "active" : ""} key={module.id} onClick={() => openModule(module.id)} type="button">
              {module.shortLabel}
            </button>
          ))}
        </nav>

        <section className="page-grid">
          <div className="main-column">
            <section className="premium-surface command-panel">
              <div>
                <p className="eyebrow">Mesa operacional</p>
                <h2>Atalhos e leitura rápida para rotina do escritório.</h2>
              </div>
              <div className="metric-grid">
                {active.metrics.map((metric) => (
                  <button className={`metric-card ${metric.tone}`} key={metric.label} type="button">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="shortcut-grid" aria-label="Atalhos">
              {shortcuts.map((shortcut) => (
                <button className={`shortcut-card ${shortcut.tone}`} key={shortcut.label} onClick={() => openShortcut(shortcut)} type="button">
                  <span>{shortcut.description}</span>
                  <strong>{shortcut.label}</strong>
                </button>
              ))}
            </section>

            <section className="premium-surface list-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{activeModule === "inicio" ? "Fila executiva" : active.label}</p>
                  <h2>{activeRecords.length} registro(s)</h2>
                </div>
                <label className="search-field">
                  <span>Buscar</span>
                  <input onChange={(event) => setQuery(event.target.value)} placeholder="cliente, processo ou responsável" value={query} />
                </label>
              </div>

              <div className="record-table">
                {activeRecords.map((record) => (
                  <button className={selectedRecord?.id === record.id ? "record-row selected" : "record-row"} key={record.id} onClick={() => setSelectedRecord(record)} type="button">
                    <div>
                      <span className="record-module">{moduleLabel(record.module)}</span>
                      <strong>{record.title}</strong>
                      <small>{record.subtitle}</small>
                    </div>
                    <div className="record-meta">
                      <StatusPill status={record.status} tone={record.tone} />
                      <span>{record.due ?? record.owner}</span>
                    </div>
                  </button>
                ))}

                {!activeRecords.length ? (
                  <div className="empty-state">
                    <strong>Nenhum registro encontrado.</strong>
                    <span>Ajuste a busca ou selecione outro módulo.</span>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="side-column">
            <section className="premium-surface detail-panel">
              {selectedRecord ? (
                <>
                  <div className="detail-header">
                    <p className="eyebrow">{toneLabel(selectedRecord.tone)}</p>
                    <h2>{selectedRecord.title}</h2>
                    <span>{selectedRecord.subtitle}</span>
                  </div>

                  <div className="fact-grid">
                    <Fact label="Responsável" value={selectedRecord.owner} />
                    <Fact label="Prazo" value={selectedRecord.due ?? "Sem prazo"} />
                    <Fact label="Valor" value={selectedRecord.value ?? "Não aplicável"} />
                  </div>

                  <details className="info-drawer">
                    <summary>Ver informações</summary>
                    <ul>
                      {selectedRecord.details.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>

                  <div className="action-stack">
                    <button className="button primary" type="button">{selectedRecord.action}</button>
                    <button className="button secondary" type="button">Criar tarefa</button>
                    <button className="button ghost" type="button">Arquivar</button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <strong>Selecione um registro.</strong>
                  <span>Os detalhes aparecem neste painel.</span>
                </div>
              )}
            </section>

            <section className="premium-surface governance-card">
              <p className="eyebrow">Governança</p>
              <strong>IA assistiva, decisão humana.</strong>
              <span>Prompts e fluxos podem apoiar a rotina, mas a validação final permanece com o escritório.</span>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status, tone }: { status: string; tone: StatusTone }) {
  return <span className={`status-pill ${tone}`}>{status}</span>;
}

function moduleLabel(moduleId: ModuleId) {
  return modules.find((module) => module.id === moduleId)?.shortLabel ?? moduleId;
}
