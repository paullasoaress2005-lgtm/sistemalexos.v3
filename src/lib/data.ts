export type ModuleId =
  | "inicio"
  | "clientes"
  | "processos"
  | "tarefas"
  | "agenda"
  | "financeiro"
  | "central"
  | "relatorios";

export type StatusTone = "neutral" | "info" | "attention" | "success" | "risk";

export type WorkspaceRecord = {
  id: string;
  module: ModuleId;
  title: string;
  subtitle: string;
  status: string;
  tone: StatusTone;
  owner: string;
  due?: string;
  value?: string;
  action: string;
  details: string[];
};

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  shortLabel: string;
  summary: string;
  primaryAction: string;
  metrics: Array<{ label: string; value: string; tone: StatusTone }>;
};

export const modules: ModuleDefinition[] = [
  {
    id: "inicio",
    label: "Início",
    shortLabel: "Início",
    summary: "Mesa diária para decidir o próximo movimento do escritório.",
    primaryAction: "Novo dossiê",
    metrics: [
      { label: "Atenções", value: "7", tone: "attention" },
      { label: "Prazos", value: "5", tone: "risk" },
      { label: "Recebíveis", value: "R$ 20,7k", tone: "info" }
    ]
  },
  {
    id: "clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    summary: "Carteira, histórico de contato e vínculos operacionais.",
    primaryAction: "Novo cliente",
    metrics: [
      { label: "Ativos", value: "18", tone: "success" },
      { label: "Sem retorno", value: "5", tone: "attention" },
      { label: "Cobrança", value: "3", tone: "risk" }
    ]
  },
  {
    id: "processos",
    label: "Processos",
    shortLabel: "Casos",
    summary: "Prazos, risco, responsáveis e próximas providências.",
    primaryAction: "Novo processo",
    metrics: [
      { label: "Ativos", value: "24", tone: "success" },
      { label: "Risco alto", value: "4", tone: "risk" },
      { label: "Próximos", value: "6", tone: "attention" }
    ]
  },
  {
    id: "tarefas",
    label: "Tarefas",
    shortLabel: "Tarefas",
    summary: "Fila objetiva de execução e revisão humana.",
    primaryAction: "Nova tarefa",
    metrics: [
      { label: "Abertas", value: "31", tone: "info" },
      { label: "Hoje", value: "8", tone: "attention" },
      { label: "Atrasadas", value: "4", tone: "risk" }
    ]
  },
  {
    id: "agenda",
    label: "Agenda",
    shortLabel: "Agenda",
    summary: "Prazos, audiências, reuniões e follow-ups.",
    primaryAction: "Novo evento",
    metrics: [
      { label: "Hoje", value: "3", tone: "info" },
      { label: "7 dias", value: "11", tone: "success" },
      { label: "Críticos", value: "2", tone: "risk" }
    ]
  },
  {
    id: "financeiro",
    label: "Financeiro",
    shortLabel: "Financeiro",
    summary: "Recebíveis, vencidos e leitura de caixa.",
    primaryAction: "Novo registro",
    metrics: [
      { label: "Aberto", value: "R$ 44k", tone: "info" },
      { label: "Vencido", value: "R$ 20,7k", tone: "risk" },
      { label: "Pago", value: "R$ 18k", tone: "success" }
    ]
  },
  {
    id: "central",
    label: "Central LEX.OS",
    shortLabel: "Central",
    summary: "Prompts, fluxos, playbooks e rotinas assistidas.",
    primaryAction: "Abrir central",
    metrics: [
      { label: "Prompts", value: "42", tone: "info" },
      { label: "Fluxos", value: "9", tone: "success" },
      { label: "Revisão", value: "3", tone: "attention" }
    ]
  },
  {
    id: "relatorios",
    label: "Relatórios",
    shortLabel: "Relatórios",
    summary: "Leitura executiva para sócios e operação.",
    primaryAction: "Gerar leitura",
    metrics: [
      { label: "Semana", value: "1", tone: "success" },
      { label: "Pendências", value: "7", tone: "attention" },
      { label: "Riscos", value: "4", tone: "risk" }
    ]
  }
];

export const records: WorkspaceRecord[] = [
  {
    id: "cliente-apice",
    module: "clientes",
    title: "Grupo Ápice",
    subtitle: "Pessoa jurídica · contrato master",
    status: "Atenção",
    tone: "attention",
    owner: "Dra. Helena",
    due: "08/05/2026",
    action: "Agendar retorno",
    details: [
      "Pendência principal: aprovar minuta de aditivo.",
      "Último contato: 08/05/2026, 09:00.",
      "Vínculos: 2 processos, 3 tarefas e 1 cobrança aberta."
    ]
  },
  {
    id: "processo-marina",
    module: "processos",
    title: "Marina Salles",
    subtitle: "1023387-44.2024.5.02.0001",
    status: "Risco alto",
    tone: "risk",
    owner: "Dr. Rafael",
    due: "13/05/2026",
    action: "Abrir processo",
    details: [
      "Área: trabalhista.",
      "Parte contrária: ex-empregadora.",
      "Próxima providência: revisar rol de testemunhas."
    ]
  },
  {
    id: "tarefa-replica",
    module: "tarefas",
    title: "Preparar réplica",
    subtitle: "Processo Marina Salles",
    status: "Hoje",
    tone: "attention",
    owner: "Dr. Rafael",
    due: "Hoje, 16:00",
    action: "Abrir tarefa",
    details: [
      "Tipo: peça.",
      "Prioridade: alta.",
      "Conferir documentos anexados antes de redigir."
    ]
  },
  {
    id: "agenda-audiencia",
    module: "agenda",
    title: "Audiência de instrução",
    subtitle: "Processo trabalhista · sala virtual",
    status: "Próximo",
    tone: "info",
    owner: "Dra. Helena",
    due: "Amanhã, 09:30",
    action: "Abrir agenda",
    details: [
      "Cliente: Grupo Ápice.",
      "Lembrete: 1 hora antes.",
      "Link do ato cadastrado internamente."
    ]
  },
  {
    id: "financeiro-vencido",
    module: "financeiro",
    title: "Honorários consultivos",
    subtitle: "Grupo Ápice · parcela 2/4",
    status: "Vencido",
    tone: "risk",
    owner: "Financeiro",
    due: "Venc. 10/05/2026",
    value: "R$ 7.800,00",
    action: "Registrar retorno",
    details: [
      "Controle interno sem emissão bancária.",
      "Próxima ação: cobrança consultiva.",
      "Vinculado ao cliente Grupo Ápice."
    ]
  },
  {
    id: "central-camaleao",
    module: "central",
    title: "Fluxo Camaleão Jurídico",
    subtitle: "Dossiê, jurisprudência, peça e auditoria",
    status: "Disponível",
    tone: "success",
    owner: "Central LEX.OS",
    action: "Abrir fluxo",
    details: [
      "Pacote operacional em quatro etapas.",
      "Uso assistivo com revisão humana.",
      "Pode gerar tarefas e checklist de produção."
    ]
  }
];

export const operationalQueue = records.filter((record) => ["attention", "risk"].includes(record.tone));

export function toneLabel(tone: StatusTone) {
  return {
    neutral: "Neutro",
    info: "Informação",
    attention: "Atenção",
    success: "Ativo",
    risk: "Risco"
  }[tone];
}
