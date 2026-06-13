import { listAgendaEvents, listAgendaEventsAsync } from "./agenda";
import { CENTRAL_REVIEW_NOTICE } from "./centralExecutions";
import { FALLBACK_WORKSPACE_ID, listClients, listClientsAsync, type Client } from "./clients";
import { formatCurrency, formatDate, listFinancialRecords, listFinancialRecordsAsync, sumFinancialAmount, type FinancialRecord } from "./finance";
import { listPartnerships, listPartnershipsAsync, type ProcessPartnership } from "./partnerships";
import { listProcesses, listProcessesAsync, type Process } from "./processes";
import { listReports, listReportsAsync, type Report } from "./reports";
import { listTasks, listTasksAsync, resolveEffectiveTaskStatus, type Task } from "./tasks";

export type CentralContext = {
  clients: Client[];
  processes: Process[];
  partnerships: ProcessPartnership[];
  tasks: Task[];
  agenda: ReturnType<typeof listAgendaEvents>;
  finance: FinancialRecord[];
  reports: Report[];
};

export type CentralSelection = {
  clientId?: string;
  processId?: string;
  partnershipId?: string;
  taskId?: string;
  financeId?: string;
  reportId?: string;
};

export type PromptTemplate = { id: string; title: string; description: string; purposeOptions: string[]; sourceModule: string };
export type AgentTemplate = { id: string; name: string; description: string; scope: string };
export type FlowTemplate = { id: string; name: string; objective: string; steps: string[]; suggestedOwner: string };
export type PlaybookTemplate = { id: string; name: string; objective: string; whenToUse: string; checklist: string[]; suggestedOwner: string; commonRisks: string[]; message?: string };

export const promptTemplates: PromptTemplate[] = [
  { id: "process-summary", title: "Resumo executivo de processo para reunião com cliente", description: "Consolida fase, risco, prazo, tarefas e parcerias vinculadas.", purposeOptions: ["Preparação de reunião", "Atualização ao cliente", "Alinhamento interno"], sourceModule: "Processos" },
  { id: "doc-charge", title: "Mensagem humana de cobrança de documentos pendentes", description: "Gera texto consultivo com impacto prático da pendência.", purposeOptions: ["Solicitar documentos", "Follow-up", "Desbloquear prazo"], sourceModule: "Clientes" },
  { id: "contract-risk", title: "Checklist de riscos para contrato/prestação de serviços", description: "Lista pontos de atenção antes de assinatura ou revisão.", purposeOptions: ["Contrato", "Due diligence", "Revisão interna"], sourceModule: "Clientes" },
  { id: "hearing-script", title: "Roteiro de audiência", description: "Organiza preparação, documentos, perguntas e responsáveis.", purposeOptions: ["Audiência", "Reunião de prova", "Preparação de testemunhas"], sourceModule: "Agenda" },
  { id: "weekly-partners", title: "Relatório semanal para sócios", description: "Resumo executivo de carteira, prazos, financeiro e gargalos.", purposeOptions: ["Reunião de sócios", "Fechamento semanal", "Gestão"], sourceModule: "Relatórios" },
  { id: "intake-dossier", title: "Dossiê rápido de triagem inicial", description: "Organiza sinais iniciais, lacunas e próximos passos.", purposeOptions: ["Triagem", "Proposta", "Intake"], sourceModule: "Clientes" },
  { id: "labor-initial", title: "Análise inicial de demanda trabalhista", description: "Estrutura dados básicos, documentos e riscos iniciais.", purposeOptions: ["Trabalhista", "Triagem", "Reunião"], sourceModule: "Processos" },
  { id: "human-follow-up", title: "Follow-up humanizado para cliente sem retorno", description: "Texto objetivo e cuidadoso para retomar andamento.", purposeOptions: ["Relacionamento", "Pendência", "Atendimento"], sourceModule: "Clientes" },
  { id: "partner-message", title: "Mensagem para parceiro jurídico", description: "Alinha responsabilidades, prazo, repasse e documentação.", purposeOptions: ["Parceria", "Correspondente", "Repasse"], sourceModule: "Parcerias" },
  { id: "partnership-checklist", title: "Checklist de parceria processual", description: "Formaliza tipo de parceria, honorários, documentos e próximos atos.", purposeOptions: ["Formalização", "Auditoria", "Repasse"], sourceModule: "Parcerias" },
];

export const agentTemplates: AgentTemplate[] = [
  { id: "intake", name: "Agente de Intake", description: "Triagem demonstrativa de clientes/prospects e pendências.", scope: "clientes/prospects" },
  { id: "deadlines", name: "Agente de Prazos", description: "Riscos de prazo, tarefas urgentes e agenda.", scope: "tarefas e agenda" },
  { id: "finance", name: "Agente Financeiro", description: "Vencidos, pendentes, aguardando e ações sugeridas.", scope: "financeiro" },
  { id: "service", name: "Agente de Atendimento", description: "Clientes sem retorno, pendências e mensagens humanizadas.", scope: "clientes e tarefas" },
  { id: "auditor", name: "Agente Auditor Simples", description: "Lacunas operacionais em clientes, processos, parcerias e financeiro.", scope: "operação" },
  { id: "manager", name: "Agente Gestor Básico", description: "Resumo executivo para sócios com dados gerais.", scope: "gestão" },
  { id: "reports", name: "Agente de Relatórios", description: "Sugere relatórios conforme cenário atual.", scope: "relatórios" },
  { id: "partnerships", name: "Agente de Parcerias", description: "Parcerias em negociação, documentos, repasses e próximas ações.", scope: "parcerias" },
];

export const flowTemplates: FlowTemplate[] = [
  { id: "new-client", name: "Novo cliente", objective: "Registrar dados, triagem e próximos passos.", suggestedOwner: "Atendimento", steps: ["Confirmar dados cadastrais", "Classificar área e urgência", "Solicitar documentos mínimos", "Checar conflito de interesses", "Criar tarefa de próxima ação"] },
  { id: "due-diligence", name: "Due diligence documental", objective: "Reduzir lacunas antes da análise técnica.", suggestedOwner: "Advogado responsável", steps: ["Listar documentos esperados", "Conferir versões recebidas", "Apontar documentos faltantes", "Registrar risco de ausência", "Definir prazo de regularização"] },
  { id: "human-charge", name: "Cobrança humanizada", objective: "Cobrar sem romper confiança.", suggestedOwner: "Responsável da conta", steps: ["Identificar pendência", "Explicar impacto prático", "Definir data objetiva", "Registrar canal usado", "Criar follow-up"] },
  { id: "hearing", name: "Preparação de audiência", objective: "Organizar prova, roteiro e responsabilidades.", suggestedOwner: "Advogado de audiência", steps: ["Confirmar data/local", "Validar testemunhas", "Separar documentos", "Montar roteiro de perguntas", "Agendar revisão final"] },
  { id: "client-meeting", name: "Reunião com cliente", objective: "Conduzir reunião com pauta, decisão e ata.", suggestedOwner: "Advogado responsável", steps: ["Definir objetivo", "Preparar dossiê rápido", "Listar decisões necessárias", "Registrar encaminhamentos", "Enviar resumo humanizado"] },
  { id: "weekly-finance", name: "Fechamento financeiro semanal", objective: "Consolidar vencidos, próximos recebíveis e repasses.", suggestedOwner: "Financeiro", steps: ["Listar vencidos", "Separar pendentes", "Checar repasses de parceria", "Definir cobranças consultivas", "Salvar relatório interno"] },
  { id: "deadline-open", name: "Abertura de prazo", objective: "Criar controle interno seguro para prazo novo.", suggestedOwner: "Coordenação", steps: ["Registrar prazo fatal", "Definir prazo interno", "Vincular processo", "Atribuir responsável", "Criar revisão final"] },
  { id: "final-review", name: "Revisão final de peça", objective: "Reduzir erro formal antes de protocolo.", suggestedOwner: "Sócio revisor", steps: ["Conferir prazo", "Validar tese", "Checar pedidos", "Conferir anexos", "Registrar aprovação"] },
  { id: "partnership-formal", name: "Formalização de parceria jurídica", objective: "Estruturar parceria, honorários e responsabilidades.", suggestedOwner: "Sócio responsável", steps: ["Identificar parceiro", "Vincular cliente/processo", "Definir tipo de parceria", "Definir honorários/repasse", "Registrar responsabilidades", "Solicitar documentos", "Criar próxima ação", "Salvar execução"] },
  { id: "partner-align", name: "Alinhamento com correspondente/parceiro", objective: "Evitar ruído em entregas compartilhadas.", suggestedOwner: "Responsável interno", steps: ["Confirmar escopo", "Validar prazo", "Registrar documentos", "Alinhar repasse", "Definir canal de retorno"] },
];

export const playbookTemplates: PlaybookTemplate[] = [
  { id: "initial-service", name: "Atendimento inicial", objective: "Padronizar acolhimento e triagem.", whenToUse: "Novo contato, prospect ou demanda sem histórico claro.", checklist: ["Dados completos", "Área jurídica", "Urgência", "Documentos mínimos"], suggestedOwner: "Atendimento", commonRisks: ["Prometer resultado", "Ignorar conflito", "Não registrar pendência"], message: "Vamos organizar as informações essenciais para avaliar o melhor encaminhamento com segurança." },
  { id: "docs-charge", name: "Cobrança de documentos", objective: "Reduzir pendências com tom consultivo.", whenToUse: "Documento bloqueando prazo, contrato ou análise.", checklist: ["Documento faltante", "Impacto", "Prazo", "Follow-up"], suggestedOwner: "Responsável da conta", commonRisks: ["Mensagem vaga", "Sem prazo", "Sem registro"], message: "Para avançarmos com segurança, precisamos dos documentos abaixo até a data combinada." },
  { id: "alignment-meeting", name: "Reunião de alinhamento", objective: "Pauta, decisões e responsáveis claros.", whenToUse: "Antes de decisões estratégicas ou entregas relevantes.", checklist: ["Pauta", "Dossiê", "Decisões", "Ata"], suggestedOwner: "Advogado responsável", commonRisks: ["Reunião sem decisão", "Pendência sem dono"], message: "Segue pauta objetiva da reunião e pontos que dependem de validação." },
  { id: "piece-review", name: "Revisão de peça", objective: "Evitar erro formal e alinhar tese.", whenToUse: "Antes de protocolo ou envio para cliente.", checklist: ["Prazo", "Tese", "Pedidos", "Anexos"], suggestedOwner: "Sócio revisor", commonRisks: ["Anexo faltante", "Pedido incoerente", "Prazo interno ignorado"] },
  { id: "closing", name: "Encerramento de demanda", objective: "Formalizar conclusão e cuidados futuros.", whenToUse: "Ao concluir entrega, acordo ou fase relevante.", checklist: ["Resultado", "Documentos", "Financeiro", "Mensagem final"], suggestedOwner: "Responsável da conta", commonRisks: ["Saldo aberto", "Cliente sem orientação futura"] },
  { id: "client-report", name: "Relatório para cliente", objective: "Traduzir andamento técnico em visão executiva.", whenToUse: "Atualização periódica ou reunião externa.", checklist: ["Andamento", "Riscos", "Pendências", "Próximo passo"], suggestedOwner: "Advogado responsável", commonRisks: ["Jargão excessivo", "Ausência de ação concreta"], message: "Preparamos um resumo objetivo para facilitar sua tomada de decisão." },
  { id: "weekly-org", name: "Organização semanal do escritório", objective: "Alinhar prioridades, prazos e capacidade.", whenToUse: "Fechamento de sexta ou início de semana.", checklist: ["Prazos", "Tarefas", "Financeiro", "Responsáveis"], suggestedOwner: "Coordenação", commonRisks: ["Gargalo invisível", "Prioridade conflitante"] },
  { id: "hearing-prep", name: "Preparação de audiência", objective: "Preparar prova oral e logística.", whenToUse: "Audiências próximas ou instruções críticas.", checklist: ["Data/local", "Testemunhas", "Documentos", "Roteiro"], suggestedOwner: "Advogado de audiência", commonRisks: ["Testemunha sem alinhamento", "Documento fora de ordem"] },
  { id: "partnership-management", name: "Gestão de parceria processual", objective: "Formalizar escopo, repasse e responsabilidades.", whenToUse: "Atuação conjunta, correspondente ou indicação.", checklist: ["Parceiro", "Escopo", "Honorários", "Documentos", "Próxima ação"], suggestedOwner: "Sócio responsável", commonRisks: ["Repasse indefinido", "Responsável externo sem prazo"], message: "Vamos alinhar escopo, documentos e regra de repasse para evitar ruídos operacionais." },
  { id: "partner-transfer-charge", name: "Cobrança de repasse/parceiro", objective: "Tratar repasse pendente com rastreabilidade.", whenToUse: "Repasse parcial, pendente ou documento fiscal faltante.", checklist: ["Valor esperado", "Valor recebido", "Documento", "Prazo", "Registro"], suggestedOwner: "Financeiro", commonRisks: ["Cobrança sem memória", "Sem conferência de valores"], message: "Identificamos pendência de repasse/documentação e sugerimos regularização até a data abaixo." },
];

export function loadCentralContext(workspaceId = FALLBACK_WORKSPACE_ID): CentralContext {
  return {
    clients: listClients(workspaceId),
    processes: listProcesses(workspaceId, { includeArchived: true }),
    partnerships: listPartnerships(workspaceId, { includeArchived: true }),
    tasks: listTasks(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    agenda: listAgendaEvents(workspaceId, { includeDerived: true }),
    finance: listFinancialRecords(workspaceId, { includeArchived: true }),
    reports: listReports(workspaceId, { includeArchived: true }),
  };
}

export async function loadCentralContextAsync(workspaceId = FALLBACK_WORKSPACE_ID): Promise<CentralContext> {
  const [clients, processes, partnerships, tasks, agenda, finance, reports] = await Promise.all([
    listClientsAsync(workspaceId, { includeArchived: true }),
    listProcessesAsync(workspaceId, { includeArchived: true }),
    listPartnershipsAsync(workspaceId, { includeArchived: true }),
    listTasksAsync(workspaceId, { status: "todas", includeArchived: true, includeCompleted: true }),
    listAgendaEventsAsync(workspaceId, { includeDerived: true }),
    listFinancialRecordsAsync(workspaceId, { includeArchived: true }),
    listReportsAsync(workspaceId, { includeArchived: true }),
  ]);

  return { clients, processes, partnerships, tasks, agenda, finance, reports };
}

function line(label: string, value?: string | number | null) {
  return `- ${label}: ${value ?? "não informado no workspace"}`;
}

function findSelected(context: CentralContext, selection: CentralSelection) {
  const client = context.clients.find((item) => item.id === selection.clientId) ?? null;
  const process = context.processes.find((item) => item.id === selection.processId) ?? null;
  const partnership = context.partnerships.find((item) => item.id === selection.partnershipId) ?? null;
  const task = context.tasks.find((item) => item.id === selection.taskId) ?? null;
  const finance = context.finance.find((item) => item.id === selection.financeId) ?? null;
  const report = context.reports.find((item) => item.id === selection.reportId) ?? null;
  const resolvedClient = client ?? (process?.client_id ? context.clients.find((item) => item.id === process.client_id) ?? null : null) ?? (partnership?.client_id ? context.clients.find((item) => item.id === partnership.client_id) ?? null : null);
  const resolvedProcess = process ?? (partnership?.process_id ? context.processes.find((item) => item.id === partnership.process_id) ?? null : null);
  return { client: resolvedClient, process: resolvedProcess, partnership, task, finance, report };
}

function related(context: CentralContext, selection: CentralSelection) {
  const selected = findSelected(context, selection);
  const clientId = selected.client?.id;
  const processId = selected.process?.id;
  const byClient = <T extends { client_id?: string }>(items: T[]) => (clientId ? items.filter((item) => item.client_id === clientId) : items);
  const byProcess = <T extends { process_id?: string; id?: string }>(items: T[]) => (processId ? items.filter((item) => item.process_id === processId || item.id === processId) : items);
  return {
    ...selected,
    relatedProcesses: byClient(context.processes).slice(0, 6),
    relatedPartnerships: byProcess(byClient(context.partnerships)).slice(0, 6),
    relatedTasks: byProcess(byClient(context.tasks)).slice(0, 8),
    relatedAgenda: byProcess(byClient(context.agenda)).slice(0, 8),
    relatedFinance: byProcess(byClient(context.finance)).slice(0, 6),
    relatedReports: byProcess(byClient(context.reports)).slice(0, 4),
  };
}

function bullets(items: string[], empty: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

export function buildSelectionSummary(context: CentralContext, selection: CentralSelection) {
  const selected = findSelected(context, selection);
  return [selected.client?.name, selected.process?.number, selected.partnership?.partner_name, selected.task?.title, selected.finance?.title].filter(Boolean).join(" • ") || "Base geral da demonstração local";
}

export function generatePromptOutput(template: PromptTemplate, purpose: string, context: CentralContext, selection: CentralSelection) {
  const data = related(context, selection);
  const linkedTasks = data.relatedTasks.map((task) => `${task.title} (${resolveEffectiveTaskStatus(task)}, ${task.responsible}, vence ${formatDate(task.due_at)})`);
  const linkedPartnerships = data.relatedPartnerships.map((partnership) => `${partnership.partner_name}/${partnership.partner_firm} (${partnership.status}, repasse ${partnership.repasse_status})`);
  return `${template.title}\nFinalidade: ${purpose}\n\nContexto selecionado\n${[
    line("Cliente", data.client?.name),
    line("Processo", data.process ? `${data.process.number} • ${data.process.area} • ${data.process.phase}` : undefined),
    line("Risco", data.process?.risk),
    line("Responsável", data.process?.responsible ?? data.client?.owner),
    line("Parceria", data.partnership ? `${data.partnership.partner_name} • ${data.partnership.status}` : undefined),
    line("Próxima ação", data.process?.next_action ?? data.client?.next_action ?? data.partnership?.next_action),
  ].join("\n")}\n\nLeitura operacional\n${bullets([
    data.client ? `Pendência principal do cliente: ${data.client.main_pending}.` : "Base geral usada para leitura executiva do escritório.",
    data.process ? `Processo em fase ${data.process.phase}, prioridade ${data.process.priority} e risco ${data.process.risk}.` : "Selecione um processo para detalhar fase, tese e prazo fatal.",
    data.relatedFinance.length ? `Impacto financeiro vinculado: ${formatCurrency(sumFinancialAmount(data.relatedFinance))} em registros locais.` : "Sem registro financeiro vinculado encontrado na seleção.",
  ], "Nenhuma leitura operacional encontrada.")}\n\nTarefas e prazos vinculados\n${bullets(linkedTasks, "Nenhuma tarefa vinculada encontrada.")}\n\nParcerias vinculadas\n${bullets(linkedPartnerships, "Nenhuma parceria vinculada encontrada.")}\n\nSaída sugerida\n${template.id.includes("message") || template.id.includes("charge") || template.id.includes("follow") ? `Olá, ${data.client?.name ?? "cliente"}. Passando para organizar o próximo passo: precisamos avançar com ${data.client?.main_pending ?? data.process?.next_action ?? "a pendência indicada"}. Isso ajuda a manter o cronograma seguro e evita retrabalho. Se puder confirmar até a data combinada, seguimos com a próxima etapa.` : `Priorizar ${data.process?.next_action ?? data.client?.next_action ?? data.partnership?.next_action ?? "a próxima ação cadastrada"}, registrar responsável e revisar os itens acima antes de qualquer comunicação externa.`}\n\nAviso\n${CENTRAL_REVIEW_NOTICE}`;
}

export function generateDossierOutput(context: CentralContext, selection: CentralSelection, objective: string, urgency: string, outputKind: string) {
  const data = related(context, selection);
  return `Dossiê Rápido LEX.OS\nObjetivo: ${objective}\nUrgência: ${urgency}\nSaída desejada: ${outputKind}\n\nResumo executivo\n${data.client?.name ?? "Cliente não selecionado"} está vinculado a ${data.relatedProcesses.length} processo(s), ${data.relatedTasks.length} tarefa(s), ${data.relatedPartnerships.length} parceria(s) e ${data.relatedFinance.length} registro(s) financeiro(s) no workspace.\n\nSituação atual\n${bullets([
    data.process ? `${data.process.title} • ${data.process.number} • fase ${data.process.phase} • risco ${data.process.risk}.` : "Sem processo específico selecionado; leitura feita pela carteira do cliente/base geral.",
    data.client ? `Responsável comercial/técnico: ${data.client.owner}. Último contato registrado em ${formatDate(data.client.last_contact_at)}.` : "Selecione cliente para personalizar contatos e pendências.",
  ], "Sem situação registrada.")}\n\nPontos de atenção\n${bullets([
    ...data.relatedTasks.filter((task) => ["alta", "urgente"].includes(task.priority)).map((task) => `${task.title} • prioridade ${task.priority} • ${task.responsible}`),
    ...data.relatedAgenda.filter((event) => ["alta", "urgente"].includes(event.priority)).map((event) => `${event.title} • ${formatDate(event.starts_at)} • ${event.responsible}`),
  ], "Nenhum ponto crítico localizado na base do workspace.")}\n\nPendências documentais\n${bullets([data.client?.main_pending, data.partnership?.main_pending].filter(Boolean) as string[], "Nenhuma pendência documental explícita encontrada.")}\n\nRiscos operacionais\n${bullets([
    data.process ? `Risco processual ${data.process.risk} em ${data.process.area}.` : "Risco processual depende de seleção de processo.",
    data.relatedFinance.some((record) => ["vencido", "pendente", "aguardando"].includes(record.status)) ? "Há financeiro aberto/vencido que pode exigir alinhamento antes de novas entregas." : "Sem alerta financeiro aberto na seleção.",
  ], "Sem riscos operacionais relevantes.")}\n\nParcerias relacionadas\n${bullets(data.relatedPartnerships.map((partnership) => `${partnership.partner_name} • ${partnership.status} • ${partnership.next_action}`), "Nenhuma parceria relacionada encontrada.")}\n\nImpacto financeiro\n${bullets(data.relatedFinance.map((record) => `${record.title} • ${formatCurrency(record.amount)} • ${record.status} • vence ${formatDate(record.due_at)}`), "Nenhum registro financeiro vinculado.")}\n\nPróximas ações sugeridas\n${bullets([data.process?.next_action, data.client?.next_action, data.partnership?.next_action, data.relatedTasks[0]?.next_action].filter(Boolean) as string[], "Definir próxima ação com responsável e prazo interno.")}\n\nVersão humanizada para cliente\nPreparamos uma visão objetiva do caso para manter clareza sobre o que já está organizado, o que depende de envio/validação e qual será o próximo passo. Antes de qualquer envio, a equipe deve revisar tecnicamente o conteúdo.\n\nAviso de revisão humana\n${CENTRAL_REVIEW_NOTICE}`;
}

export function generateAgentOutput(agent: AgentTemplate, context: CentralContext, selection: CentralSelection) {
  const data = related(context, selection);
  const urgentTasks = data.relatedTasks.filter((task) => ["atrasada", "a_fazer", "em_andamento"].includes(resolveEffectiveTaskStatus(task))).slice(0, 5);
  const openFinance = data.relatedFinance.filter((record) => ["vencido", "pendente", "aguardando"].includes(record.status));
  const partnerIssues = data.relatedPartnerships.filter((partnership) => ["em_negociacao", "aguardando_documento", "aguardando_repasse", "em_execucao"].includes(partnership.status) || ["repasse_pendente", "repasse_parcial"].includes(partnership.repasse_status));
  const linesByAgent: Record<string, string[]> = {
    intake: [`Prospects/clientes em atenção: ${context.clients.filter((client) => ["prospect", "atenção"].includes(client.status)).length}.`, `Pendência selecionada: ${data.client?.main_pending ?? "sem cliente selecionado"}.`, "Ação: confirmar dados, documentos mínimos e urgência antes de proposta."],
    deadlines: urgentTasks.map((task) => `${task.title} • ${resolveEffectiveTaskStatus(task)} • ${task.responsible} • ${formatDate(task.due_at)}`),
    finance: openFinance.map((record) => `${record.client_name ?? "Cliente"} • ${record.title} • ${formatCurrency(record.amount)} • ${record.status}`),
    service: data.relatedTasks.filter((task) => task.type === "atendimento" || task.status === "aguardando").map((task) => `${task.client_name ?? data.client?.name ?? "Cliente"}: retomar ${task.title} com tom humano.`),
    auditor: [`Clientes sem pendência resolvida: ${context.clients.filter((client) => client.main_pending).length}.`, `Processos em atenção: ${context.processes.filter((process) => process.status === "atenção").length}.`, `Parcerias com repasse/documento pendente: ${partnerIssues.length}.`, `Financeiro aberto/vencido: ${openFinance.length}.`],
    manager: [`Processos ativos/atenção: ${context.processes.filter((process) => process.status !== "arquivado").length}.`, `Tarefas operacionais: ${context.tasks.filter((task) => task.status !== "concluida" && task.status !== "arquivada").length}.`, `Recebíveis em aberto na seleção/base: ${formatCurrency(sumFinancialAmount(openFinance))}.`],
    reports: ["Sugerido: relatório semanal para sócios se houver prazos urgentes e financeiro aberto.", "Sugerido: relatório de inadimplência quando houver vencidos.", "Sugerido: relatório de parceria se houver repasse parcial ou documento pendente."],
    partnerships: partnerIssues.map((partnership) => `${partnership.partner_name} • ${partnership.status} • ${partnership.repasse_status} • próxima ação: ${partnership.next_action}`),
  };
  return `${agent.name}\nEscopo: ${agent.scope}\n\nLeitura demonstrativa\n${bullets(linesByAgent[agent.id] ?? [], "Nenhum item relevante encontrado para este agente na seleção atual.")}\n\nAções sugeridas\n${bullets(["Registrar responsável e prazo interno para cada item crítico.", "Usar mensagem humanizada apenas após revisão da equipe.", data.process?.next_action ?? data.client?.next_action ?? data.partnership?.next_action ?? "Atualizar o módulo de origem após a execução."], "Sem ações sugeridas.")}\n\nAviso\n${CENTRAL_REVIEW_NOTICE}`;
}

export function generateFlowOutput(flow: FlowTemplate, checked: string[], context: CentralContext, selection: CentralSelection) {
  const data = related(context, selection);
  const pending = flow.steps.filter((step) => !checked.includes(step));
  return `${flow.name}\nObjetivo: ${flow.objective}\nResponsável sugerido: ${flow.suggestedOwner}\n\nContexto\n${buildSelectionSummary(context, selection)}\n\nEtapas concluídas\n${bullets(checked, "Nenhuma etapa marcada como concluída.")}\n\nEtapas pendentes\n${bullets(pending, "Todas as etapas foram marcadas como concluídas.")}\n\nResumo operacional\nFluxo executado com os dados disponíveis para ${data.client?.name ?? "base geral"}. Próxima ação recomendada: ${data.process?.next_action ?? data.client?.next_action ?? data.partnership?.next_action ?? "registrar encaminhamento no módulo de origem"}.\n\nAviso\n${CENTRAL_REVIEW_NOTICE}`;
}

export function generatePlaybookOutput(playbook: PlaybookTemplate, context: CentralContext, selection: CentralSelection) {
  return `${playbook.name}\nObjetivo: ${playbook.objective}\nQuando usar: ${playbook.whenToUse}\nResponsável sugerido: ${playbook.suggestedOwner}\n\nContexto selecionado\n${buildSelectionSummary(context, selection)}\n\nChecklist\n${bullets(playbook.checklist, "Sem checklist cadastrado.")}\n\nRiscos comuns\n${bullets(playbook.commonRisks, "Sem riscos cadastrados.")}\n\nPadrão de mensagem\n${playbook.message ?? "Não há mensagem padrão obrigatória para este playbook; adaptar ao caso concreto."}\n\nAviso\n${CENTRAL_REVIEW_NOTICE}`;
}
