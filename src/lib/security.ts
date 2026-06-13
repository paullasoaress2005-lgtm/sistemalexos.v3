export type ChecklistStatus = "concluido" | "atencao" | "manual";

export type SecurityChecklistItem = {
  title: string;
  detail: string;
  status: ChecklistStatus;
};

export const lgpdChecklistItems: SecurityChecklistItem[] = [
  { title: "Usar apenas dados necessários", detail: "Evite registrar informações sem utilidade operacional clara para o piloto.", status: "manual" },
  { title: "Evitar documentos sensíveis desnecessários", detail: "Não insira documentos sigilosos fora do escopo do LEX.OS Control.", status: "atencao" },
  { title: "Revisar permissões de usuários", detail: "Confirme owner/admin/sócio/financeiro/leitura antes de liberar o workspace.", status: "manual" },
  { title: "Inativar acessos indevidos", detail: "Remova ou inative usuários que não devem acessar o escritório piloto.", status: "manual" },
  { title: "Arquivar dados de teste", detail: "Revise registros TESTE/DEMO e arquive manualmente quando necessário.", status: "atencao" },
  { title: "Explicar piloto controlado", detail: "Alinhe que o ambiente ainda não é produto público final.", status: "concluido" },
  { title: "Revisar relatórios antes de uso externo", detail: "Validação humana é recomendada antes de compartilhar qualquer saída.", status: "manual" },
  { title: "Não inserir senhas, tokens ou chaves em prompts", detail: "Prompts e metadados não devem receber credenciais ou segredos.", status: "atencao" },
  { title: "Não armazenar documentos sigilosos fora do escopo", detail: "Use campos do LEX.OS Control apenas para dados operacionais necessários.", status: "manual" },
  { title: "Validar comunicação externa com responsável", detail: "Informações jurídicas externas dependem de revisão do advogado responsável.", status: "manual" },
  { title: "Backup/exportação manual periódica", detail: "Enquanto backup automatizado avançado não existir, mantenha rotina manual acordada.", status: "atencao" },
  { title: "Revisar política de acesso do escritório", detail: "Defina quem pode ver financeiro, relatórios estratégicos e configurações avançadas.", status: "manual" },
];

export const productionReadinessItems: SecurityChecklistItem[] = [
  { title: "Login real funcionando", detail: "Validar Supabase Auth com usuário real do escritório.", status: "manual" },
  { title: "Modo demo separado", detail: "Sessão demo usa somente dados locais/fictícios.", status: "concluido" },
  { title: "Workspace configurado", detail: "Nome, status e membros vinculados ao workspace correto.", status: "manual" },
  { title: "Usuários e permissões revisados", detail: "Matriz mínima aplicada para áreas sensíveis.", status: "manual" },
  { title: "Dados de teste revisados", detail: "Sem exclusão automática; arquivamento manual quando necessário.", status: "atencao" },
  { title: "Activity logs funcionando", detail: "Ações operacionais registram auditoria quando a RLS permitir.", status: "manual" },
  { title: "Módulos principais persistindo", detail: "Clientes, processos, tarefas, agenda, financeiro, relatórios, Central e prompts por workspace.", status: "manual" },
  { title: "Avisos de revisão em saídas", detail: "Relatórios e Central exibem orientação de revisão humana.", status: "concluido" },
  { title: "Sem chaves sensíveis no repositório", detail: "Revisar .env.local, credenciais e chaves administrativas antes do release.", status: "manual" },
  { title: "RLS/policies revisadas", detail: "Policies devem exigir membro ativo do workspace.", status: "manual" },
  { title: "README atualizado", detail: "Produção/piloto, limitações e segurança básica documentadas.", status: "concluido" },
  { title: "Limitações conhecidas documentadas", detail: "Sem billing, e-mail, integrações externas, IA real, SSO ou MFA customizado nesta etapa.", status: "concluido" },
];

export const realDataModules = [
  "Configurações / workspace / perfil",
  "Usuários e permissões",
  "Clientes",
  "Processos e parcerias",
  "Tarefas",
  "Agenda/Prazos",
  "Financeiro",
  "Dashboard e Painel dos Sócios",
  "Relatórios",
  "Central LEX.OS",
  "Biblioteca/Gerenciador de Prompts",
  "Activity logs/Auditoria",
  "Onboarding de escritório real",
];

export const currentSecurityLimitations = [
  "Piloto controlado: o LEX.OS Control não deve ser apresentado como produto público final.",
  "Sem IA real/API externa ou integrações OpenAI/Claude/Gemini; saídas da Central são controladas/determinísticas.",
  "Sem WhatsApp, e-mail real, Google Calendar, portal do cliente ou marketplace nesta etapa.",
  "Sem billing real, gateway de pagamento, boleto, PIX ou contabilidade oficial integrada.",
  "Sem backup automático avançado, importação em massa, SSO/MFA customizado ou criptografia campo a campo.",
  "Sem contrato jurídico automático, termos públicos definitivos ou política pública definitiva nesta etapa.",
  "Relatórios, prompts e saídas da Central exigem revisão humana antes de uso externo.",
  "Financeiro é controle interno do escritório, não gateway, cobrança bancária ou parecer contábil.",
  "Checklist LGPD é apoio operacional e não substitui parecer jurídico completo.",
  "Arquivamento de dados de teste deve ser manual e revisado por responsável; não há exclusão automática.",
];

export function sanitizeSensitiveText(value: string) {
  const sensitiveKey = /(password|senha|token|secret|api[_-]?key|authorization|bearer|chave)/i;
  return value
    .split("\n")
    .map((line) => (sensitiveKey.test(line) ? "[conteúdo sensível omitido para proteção operacional]" : line))
    .join("\n");
}
