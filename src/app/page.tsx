"use client";

import { useMemo, useState } from "react";
import { modules, operationalQueue, records, toneLabel, type ModuleId, type WorkspaceRecord } from "@/lib/data";

const quickActions = ["Novo dossiê", "Novo cliente", "Novo processo", "Nova tarefa"];
const dashboardShortcuts: Array<{ label: string; meta: string; module: ModuleId; recordId?: string; tone: "primary" | "neutral" | "attention" | "risk" }> = [
  { label: "Cadastrar cliente", meta: "novo relacionamento", module: "clientes", recordId: "cliente-apice", tone: "primary" },
  { label: "Novo processo", meta: "abrir caso", module: "processos", recordId: "processo-marina", tone: "primary" },
  { label: "Nova tarefa", meta: "providência rápida", module: "tarefas", recordId: "tarefa-replica", tone: "neutral" },
  { label: "Lançar prazo", meta: "agenda/processo", module: "agenda", recordId: "agenda-audiencia", tone: "attention" },
  { label: "Cobrança interna", meta: "financeiro", module: "financeiro", recordId: "financeiro-vencido", tone: "risk" },
  { label: "Central LEX.OS", meta: "prompts e fluxos", module: "central", recordId: "central-camaleao", tone: "neutral" },
  { label: "Relatório dos sócios", meta: "leitura executiva", module: "relatorios", tone: "neutral" },
  { label: "Fila crítica", meta: "atenções e riscos", module: "inicio", recordId: operationalQueue[0]?.id, tone: "attention" }
];

export default function HomePage() {
  const [activeModule, setActiveModule] = useState<ModuleId>("inicio");
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(operationalQueue[0] ?? null);
  const [query, setQuery] = useState("");

  const active = modules.find((module) => module.id === activeModule) ?? modules[0];
  const visibleRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const moduleMatch = activeModule === "inicio" || record.module === activeModule;
      const queryMatch = !normalized || [record.title, record.subtitle, record.owner, record.status, record.action].join(" ").toLowerCase().includes(normalized);
      return moduleMatch && queryMatch;
    });
  }, [activeModule, query]);

  function openShortcut(shortcut: (typeof dashboardShortcuts)[number]) {
    setActiveModule(shortcut.module);
    const target = records.find((record) => record.id === shortcut.recordId) ?? records.find((record) => record.module === shortcut.module) ?? operationalQueue[0] ?? null;
    setSelectedRecord(target);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark">LX</div>
          <div>
            <p>LEX.OS</p>
            <strong>Control V3</strong>
          </div>
        </div>

        <nav className="nav-list">
          {modules.map((module) => (
            <button className={module.id === activeModule ? "nav-item active" : "nav-item"} key={module.id} onClick={() => setActiveModule(module.id)} type="button">
              <span>{module.shortLabel}</span>
              <small>{module.metrics[0]?.value ?? "0"} · {module.metrics[0]?.label ?? "itens"}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>Modo</span>
          <strong>Demonstração local</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sistema LEX.OS V3</p>
            <h1>{active.label}</h1>
          </div>
          <div className="top-actions">
            {quickActions.map((action) => (
              <button className={action === active.primaryAction ? "button primary" : "button secondary"} key={action} type="button">
                {action}
              </button>
            ))}
          </div>
        </header>

        <nav className="mobile-tabs" aria-label="Módulos">
          {modules.map((module) => (
            <button className={module.id === activeModule ? "active" : ""} key={module.id} onClick={() => setActiveModule(module.id)} type="button">
              {module.shortLabel}
            </button>
          ))}
        </nav>

        <section className="command-strip">
          <div className="module-summary">
            <p className="eyebrow">Leitura rápida</p>
            <strong>{active.summary}</strong>
          </div>
          <div className="metric-row">
            {active.metrics.map((metric) => (
              <button className={`metric ${metric.tone}`} key={metric.label} type="button">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="shortcuts-panel" aria-label="Atalhos operacionais">
          <div className="shortcuts-heading">
            <p className="eyebrow">Atalhos</p>
            <strong>Comandos de rotina</strong>
          </div>
          <div className="shortcut-grid">
            {dashboardShortcuts.map((shortcut) => (
              <button className={`shortcut ${shortcut.tone}`} key={shortcut.label} onClick={() => openShortcut(shortcut)} type="button">
                <span>{shortcut.label}</span>
                <small>{shortcut.meta}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="control-row">
          <label className="search-box">
            <span>Buscar</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, processo, tarefa ou responsável" value={query} />
          </label>
          <button className="button primary" type="button">{active.primaryAction}</button>
        </section>

        <section className="content-grid">
          <div className="panel records-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{activeModule === "inicio" ? "Fila operacional" : active.label}</p>
                <h2>{visibleRecords.length} registro(s)</h2>
              </div>
              <button className="button ghost" onClick={() => setActiveModule("inicio")} type="button">Ver tudo</button>
            </div>

            <div className="record-list">
              {visibleRecords.map((record) => (
                <button className={selectedRecord?.id === record.id ? "record-card selected" : "record-card"} key={record.id} onClick={() => setSelectedRecord(record)} type="button">
                  <span className={`status ${record.tone}`}>{record.status}</span>
                  <div>
                    <strong>{record.title}</strong>
                    <small>{record.subtitle}</small>
                  </div>
                  <em>{record.due ?? record.owner}</em>
                </button>
              ))}
              {!visibleRecords.length ? (
                <div className="empty-state">
                  <strong>Nenhum registro encontrado.</strong>
                  <span>Ajuste a busca ou troque de módulo.</span>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="panel detail-panel">
            {selectedRecord ? (
              <>
                <div className="detail-head">
                  <p className="eyebrow">{toneLabel(selectedRecord.tone)}</p>
                  <h2>{selectedRecord.title}</h2>
                  <span className={`status ${selectedRecord.tone}`}>{selectedRecord.status}</span>
                </div>

                <div className="detail-facts">
                  <Fact label="Responsável" value={selectedRecord.owner} />
                  <Fact label="Prazo" value={selectedRecord.due ?? "Sem prazo"} />
                  <Fact label="Valor" value={selectedRecord.value ?? "Não aplicável"} />
                </div>

                <details className="details-box" open>
                  <summary>Informações</summary>
                  <ul>
                    {selectedRecord.details.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </details>

                <div className="detail-actions">
                  <button className="button primary" type="button">{selectedRecord.action}</button>
                  <button className="button secondary" type="button">Criar tarefa</button>
                  <button className="button secondary" type="button">Arquivar</button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <strong>Selecione um registro.</strong>
                <span>Os detalhes aparecem aqui.</span>
              </div>
            )}
          </aside>
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
