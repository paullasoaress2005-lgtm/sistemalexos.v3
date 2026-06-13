export type ManualQaItem = {
  id: string;
  label: string;
  route: string;
  expected: string;
};

export const operationalJourneyRoutes = [
  "/configuracoes",
  "/clientes",
  "/processos",
  "/tarefas",
  "/agenda",
  "/financeiro",
  "/relatorios",
  "/central-lexos",
  "/socios",
  "/configuracoes/release",
  "/onboarding",
] as const;

export const manualQaChecklist: ManualQaItem[] = [
  {
    id: "settings",
    label: "Revisar configurações do escritório",
    route: "/configuracoes",
    expected: "Confirmar workspace, usuários e escopo de demonstração local antes de cadastrar dados fictícios.",
  },
  {
    id: "clients",
    label: "Criar ou visualizar clientes",
    route: "/clientes?action=novo",
    expected: "Cadastrar cliente de teste e validar persistência local após reload.",
  },
  {
    id: "processes",
    label: "Criar processo vinculado",
    route: "/processos?action=novo",
    expected: "Selecionar cliente existente, salvar processo e abrir o vínculo do cliente/processo.",
  },
  {
    id: "tasks",
    label: "Criar tarefa operacional",
    route: "/tarefas?action=novo",
    expected: "Vincular cliente/processo quando aplicável, definir responsável, prazo e próxima ação.",
  },
  {
    id: "agenda",
    label: "Criar prazo ou evento de agenda",
    route: "/agenda?action=novo",
    expected: "Registrar evento local, revisar visão de hoje/semana e confirmar estado vazio seguro quando não houver dados.",
  },
  {
    id: "finance",
    label: "Registrar cobrança ou recebível interno",
    route: "/financeiro?action=novo",
    expected: "Salvar lançamento como controle interno, sem PIX, boleto, gateway ou cobrança bancária real.",
  },
  {
    id: "reports",
    label: "Gerar relatório executivo",
    route: "/relatorios?type=socios_operacional",
    expected: "Gerar saída com revisão humana obrigatória, dados fictícios quando em demo e sem envio externo automático.",
  },
  {
    id: "central",
    label: "Usar Central LEX.OS como apoio operacional",
    route: "/central-lexos",
    expected: "Executar apoio determinístico/local, copiar resultado com feedback e não prometer IA externa ativa.",
  },
  {
    id: "partners",
    label: "Visualizar Painel dos Sócios",
    route: "/socios",
    expected: "Comparar indicadores consolidados com clientes, processos, tarefas, agenda, financeiro, relatórios e Central.",
  },
  {
    id: "implantation",
    label: "Revisar implantação e primeiros passos",
    route: "/configuracoes/release",
    expected: "Validar checklist, limitações do ambiente seguro para teste e rota de Primeiros Passos.",
  },
];
