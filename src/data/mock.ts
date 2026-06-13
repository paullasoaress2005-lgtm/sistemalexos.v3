export const workspace = {
  firmName: "Escritório Demonstração LEX.OS",
  product: "LEX.OS Control",
  user: "Dra. Helena Moraes",
  role: "Sócia fundadora",
};

export const dashboardStats = [
  { label: "Processos ativos", value: "148", detail: "+12 este mês", tone: "neutral" },
  { label: "Prazos urgentes", value: "9", detail: "próximas 72h", tone: "urgent" },
  { label: "Tarefas pendentes", value: "37", detail: "16 com dono definido", tone: "warning" },
  { label: "Tarefas atrasadas", value: "6", detail: "revisar hoje", tone: "urgent" },
  { label: "Valores a receber", value: "R$ 184 mil", detail: "contratos recorrentes", tone: "positive" },
  { label: "Valores vencidos", value: "R$ 28 mil", detail: "4 clientes", tone: "urgent" },
  { label: "Clientes sem retorno", value: "11", detail: "há mais de 7 dias", tone: "warning" },
  { label: "Uso da Central LEX.OS", value: "82%", detail: "52 execuções simuladas", tone: "premium" },
] as const;

export const todayOffice = [
  { time: "09:00", title: "Audiência de instrução", meta: "Proc. 1023387-44 • Sala 4", status: "urgente" },
  { time: "11:30", title: "Reunião com cliente estratégico", meta: "Grupo Ápice • Contratos", status: "confirmado" },
  { time: "15:00", title: "Revisão de parecer", meta: "Tributário • Dra. Helena", status: "em andamento" },
  { time: "17:20", title: "Follow-up de proposta", meta: "Cliente prospect • Societário", status: "pendente" },
];

export const smartAlerts = [
  "Prazo urgente em processo trabalhista vence em 2 dias úteis.",
  "Cliente Villa Norte está sem retorno registrado há 12 dias.",
  "Há 4 honorários vencidos que podem impactar o fluxo do mês.",
  "Dossiê rápido sugerido para reunião do Grupo Ápice amanhã.",
];

export const legalProduction = [
  { label: "Peças protocoladas", value: 18 },
  { label: "Pareceres entregues", value: 7 },
  { label: "Contratos revisados", value: 11 },
  { label: "Reuniões registradas", value: 24 },
];

export const weekAgenda = [
  { day: "Seg", items: 6, highlight: "2 prazos" },
  { day: "Ter", items: 8, highlight: "audiência" },
  { day: "Qua", items: 5, highlight: "reuniões" },
  { day: "Qui", items: 7, highlight: "3 entregas" },
  { day: "Sex", items: 4, highlight: "financeiro" },
];

export const recentActivities = [
  { title: "Dra. Camila atualizou tarefa", detail: "Contestação preliminar marcada como concluída", when: "há 12 min" },
  { title: "Novo andamento cadastrado", detail: "Processo 1009288-21 recebeu despacho", when: "há 38 min" },
  { title: "Central LEX.OS utilizada", detail: "Prompt de resumo para reunião com cliente", when: "há 1h" },
  { title: "Financeiro revisado", detail: "Honorários recorrentes de maio conferidos", when: "há 2h" },
];

export const financeQuick = [
  { label: "Receita prevista", value: 312000, status: "positivo" },
  { label: "A receber em 7 dias", value: 76000, status: "neutro" },
  { label: "Vencido", value: 28000, status: "urgente" },
];

export const centralCards = [
  {
    title: "Biblioteca de Prompts",
    href: "/central-lexos/prompts",
    description: "Modelos validados para petições, dossiês, atendimento, análise de documentos, cobrança, audiência e gestão jurídica.",
    metric: "Prompts ativos",
  },
  {
    title: "Dossiê Rápido",
    href: "/central-lexos/dossie-rapido",
    description: "Gere visão executiva com cliente, processo, tarefas, riscos, pendências e próximos passos.",
    metric: "Dossiês gerados",
  },
  {
    title: "Agentes LEX.OS",
    href: "/central-lexos/agentes",
    description: "Assistentes guiados para organizar informações e sugerir próximos passos sem substituir o advogado.",
    metric: "Agentes guiados",
  },
  {
    title: "Fluxos Guiados",
    href: "/central-lexos/fluxos",
    description: "Roteiros para intake, due diligence, cobrança consultiva, preparação de audiência e acompanhamento de carteira.",
    metric: "Fluxos disponíveis",
  },
  {
    title: "Playbooks",
    href: "/central-lexos/playbooks",
    description: "Padrões do escritório para entregar qualidade consistente em casos recorrentes.",
    metric: "Playbooks ativos",
  },
  {
    title: "Relatórios Inteligentes",
    href: "/relatorios",
    description: "Análises executivas de carteira, produtividade, financeiro, prazos, riscos e movimentos recentes.",
    metric: "Relatórios inteligentes",
  },
];

export const promptHighlights = [
  "Resumo executivo de processo para reunião com cliente",
  "Mensagem humana de cobrança de documentos pendentes",
  "Checklist de riscos para contrato de prestação de serviços",
];

export const agentExamples = [
  { name: "Agente de Intake", description: "Organiza informações iniciais e indica pendências para triagem humana." },
  { name: "Agente de Prazos", description: "Simula alertas de prazos e dependências para conferência da equipe." },
  { name: "Agente Financeiro", description: "Apoia leitura de valores a receber, vencidos e previsões." },
];

export const routes = [
  ["/dashboard", "Visão Geral"],
  ["/clientes", "Clientes"],
  ["/processos", "Processos"],
  ["/tarefas", "Tarefas"],
  ["/minha-semana", "Minha Semana"],
  ["/agenda", "Agenda"],
  ["/financeiro", "Financeiro"],
  ["/central-lexos", "Central LEX.OS"],
  ["/socios", "Painel dos Sócios"],
  ["/relatorios", "Relatórios"],
  ["/configuracoes", "Configurações"],
];

export const clientStats = [
  { label: "Clientes ativos", value: "42", detail: "carteira em acompanhamento", tone: "positive" },
  { label: "Clientes sem retorno", value: "11", detail: "há mais de 7 dias", tone: "warning" },
  { label: "Aguardando documento", value: "8", detail: "bloqueiam próximos passos", tone: "urgent" },
  { label: "Prospects em triagem", value: "6", detail: "potencial de contratação", tone: "premium" },
] as const;

export const clientPortfolio = [
  { name: "Grupo Ápice", type: "empresa", status: "prioritário", owner: "Dra. Helena", lastContact: "07/05/2026", pending: "Aprovar minuta de aditivo", linkedCase: "Contrato master 2026", suggestedAction: "Agendar reunião executiva" },
  { name: "Marina Salles", type: "pessoa física", status: "ativo", owner: "Dr. Rafael", lastContact: "06/05/2026", pending: "Enviar comprovantes trabalhistas", linkedCase: "Proc. 1023387-44", suggestedAction: "Reforçar checklist de documentos" },
  { name: "Villa Norte SPE", type: "empresa", status: "aguardando documento", owner: "Dra. Camila", lastContact: "29/04/2026", pending: "Contrato social atualizado", linkedCase: "Due diligence societária", suggestedAction: "Enviar lembrete humanizado" },
  { name: "Clínica Aurum", type: "prospect", status: "em triagem", owner: "Atendimento", lastContact: "08/05/2026", pending: "Validar escopo consultivo", linkedCase: "Proposta LGPD", suggestedAction: "Preparar diagnóstico inicial" },
  { name: "João Henrique Prado", type: "pessoa física", status: "ativo", owner: "Dra. Bianca", lastContact: "03/05/2026", pending: "Conferir procuração", linkedCase: "Inventário extrajudicial", suggestedAction: "Solicitar assinatura digital" },
] as const;

export const processStats = [
  { label: "Processos ativos", value: "148", detail: "contencioso e consultivo", tone: "neutral" },
  { label: "Prazos urgentes", value: "9", detail: "próximas 72h", tone: "urgent" },
  { label: "Em produção", value: "23", detail: "peças e pareceres", tone: "warning" },
  { label: "Aguardando documento", value: "14", detail: "dependência do cliente", tone: "premium" },
] as const;

export const processPortfolio = [
  { number: "1023387-44.2024.5.02.0001", client: "Marina Salles", area: "Trabalhista", phase: "Instrução", owner: "Dr. Rafael", internalDeadline: "10/05/2026", finalDeadline: "13/05/2026", risk: "alto", nextAction: "Revisar rol de testemunhas" },
  { number: "5009123-18.2023.8.26.0100", client: "Grupo Ápice", area: "Cível estratégico", phase: "Réplica", owner: "Dra. Helena", internalDeadline: "12/05/2026", finalDeadline: "16/05/2026", risk: "médio", nextAction: "Consolidar documentos de defesa" },
  { number: "0008821-77.2025.8.26.0562", client: "Villa Norte SPE", area: "Societário", phase: "Due diligence", owner: "Dra. Camila", internalDeadline: "09/05/2026", finalDeadline: "20/05/2026", risk: "médio", nextAction: "Cobrar contrato social atualizado" },
  { number: "9001120-02.2026.4.03.6100", client: "Clínica Aurum", area: "Regulatório", phase: "Triagem", owner: "Dr. Lucas", internalDeadline: "14/05/2026", finalDeadline: "24/05/2026", risk: "baixo", nextAction: "Mapear obrigações setoriais" },
  { number: "1009288-21.2022.8.26.0002", client: "João Henrique Prado", area: "Família e sucessões", phase: "Documentos", owner: "Dra. Bianca", internalDeadline: "11/05/2026", finalDeadline: "18/05/2026", risk: "baixo", nextAction: "Conferir procuração e certidões" },
] as const;

export const financeStats = [
  { label: "Receita prevista", value: "R$ 312 mil", detail: "maio/2026", tone: "positive" },
  { label: "Valores a receber", value: "R$ 184 mil", detail: "contratos recorrentes", tone: "premium" },
  { label: "Valores vencidos", value: "R$ 28 mil", detail: "4 clientes", tone: "urgent" },
  { label: "Clientes inadimplentes", value: "4", detail: "em cobrança consultiva", tone: "warning" },
  { label: "Parcelas próximas", value: "17", detail: "próximos 10 dias", tone: "neutral" },
  { label: "Cobranças pendentes", value: "6", detail: "aguardando retorno", tone: "warning" },
] as const;

export const financeRows = [
  { client: "Grupo Ápice", contract: "Contrato master 2026", contracted: "R$ 96.000", paid: "R$ 64.000", pending: "R$ 32.000", due: "15/05/2026", status: "parcialmente pago" },
  { client: "Villa Norte SPE", contract: "Due diligence societária", contracted: "R$ 42.000", paid: "R$ 14.000", pending: "R$ 28.000", due: "30/04/2026", status: "vencido" },
  { client: "Clínica Aurum", contract: "Proposta LGPD", contracted: "R$ 18.000", paid: "R$ 0", pending: "R$ 18.000", due: "20/05/2026", status: "em aberto" },
  { client: "Marina Salles", contract: "Proc. 1023387-44", contracted: "R$ 24.000", paid: "R$ 24.000", pending: "R$ 0", due: "05/05/2026", status: "pago" },
  { client: "João Henrique Prado", contract: "Inventário extrajudicial", contracted: "R$ 36.000", paid: "R$ 18.000", pending: "R$ 18.000", due: "25/05/2026", status: "renegociado" },
] as const;

export const partnerHighlights = [
  { title: "Gargalos da semana", value: "3 frentes", detail: "documentos de clientes e revisão final de peças" },
  { title: "Prazos urgentes", value: "9", detail: "priorização sugerida para as próximas 72h" },
  { title: "Tarefas atrasadas", value: "6", detail: "redistribuição pontual pode destravar entregas" },
  { title: "Clientes sem retorno", value: "11", detail: "acionar régua de relacionamento consultiva" },
  { title: "Financeiro vencido", value: "R$ 28 mil", detail: "cobranças humanizadas em aberto" },
  { title: "Carga da equipe", value: "82%", detail: "capacidade saudável com pico em contencioso" },
  { title: "Uso da Central LEX.OS", value: "52", detail: "execuções simuladas no mês" },
] as const;

export const executiveRecommendations = [
  "Reordenar a pauta da equipe para antecipar os 9 prazos urgentes sem pressionar agendas já críticas.",
  "Transformar pendências documentais recorrentes em comunicação única, clara e rastreável para clientes estratégicos.",
  "Concentrar a cobrança dos valores vencidos em abordagem consultiva, preservando relacionamento e previsibilidade de caixa.",
  "Estimular o uso de dossiês rápidos antes de reuniões com clientes prioritários para aumentar clareza e reduzir retrabalho.",
] as const;

export const reportCards = [
  { title: "Relatório Financeiro da Semana", purpose: "Sintetizar receita prevista, recebíveis, valores vencidos e cobranças pendentes.", audience: "Sócios e financeiro", status: "pronto para simulação" },
  { title: "Relatório para Cliente", purpose: "Gerar visão executiva de andamento, próximos passos e pendências sem linguagem excessivamente técnica.", audience: "Cliente e responsável da conta", status: "modelo controlado" },
  { title: "Relatório Operacional da Semana", purpose: "Consolidar entregas, gargalos, tarefas e capacidade da equipe.", audience: "Coordenação jurídica", status: "atualizado com dados estruturados" },
  { title: "Relatório de Prazos", purpose: "Mapear prazos urgentes, prazos fatais e dependências internas.", audience: "Advogados e sócios", status: "simulação disponível" },
  { title: "Relatório dos Sócios", purpose: "Apoiar decisões estratégicas com carteira, risco, financeiro e uso da Central LEX.OS.", audience: "Sócios", status: "restrito" },
  { title: "Relatório de Uso da Central LEX.OS", purpose: "Mostrar módulos mais usados, ganhos operacionais simulados e oportunidades de adoção.", audience: "Sócios e gestão", status: "controlado" },
] as const;

export const workspaceUsers = [
  { name: "Dra. Helena Moraes", profile: "Sócio", permission: "Visão estratégica, configurações e relatórios restritos" },
  { name: "Dr. Rafael Brito", profile: "Advogado", permission: "Processos, clientes, tarefas e Central LEX.OS" },
  { name: "Carla Nogueira", profile: "Financeiro", permission: "Recebíveis, cobranças e relatórios financeiros" },
  { name: "Lívia Ramos", profile: "Atendimento", permission: "Intake, follow-ups e pendências documentais" },
] as const;
