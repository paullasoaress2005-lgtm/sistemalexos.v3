export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}


const operationalLabelMap: Record<string, string> = {
  riscoAltoCritico: "Risco alto/crítico",
  prazosProximos: "Prazos próximos",
  semRetorno: "Sem retorno",
  followUps: "Follow-ups",
  concluidosCancelados: "Concluídos/cancelados",
  clientesAtivos: "Clientes ativos",
  clientesAtencao: "Clientes em atenção",
  clientesProspects: "Clientes prospects",
  processosAtivos: "Carteira processual ativa",
  processosAtencao: "Processos em atenção",
  processosArquivados: "Processos arquivados",
  agendaHoje: "Agenda hoje",
  prazosSemana: "Prazos da semana",
  financeiroCritico: "Financeiro crítico",
  ativos: "Ativos",
  atencao: "Em atenção",
  atenção: "Em atenção",
  prospects: "Prospects",
  inativos: "Inativos",
  arquivados: "Arquivados",
  hoje: "Hoje",
  semana: "Semana",
  prazosUrgentes: "Prazos urgentes",
  audiencias: "Audiências",
  reunioes: "Reuniões",
  total: "Total",
  vencido: "Vencido",
  vencidos: "Vencidos",
  pagos: "Pagos",
  pendentes: "Pendentes",
  receber: "A receber",
  recebidos: "Recebidos",
  previstas: "Previstas",
  previstos: "Previstos",
  negociacao: "Em negociação",
  negociacaoAtiva: "Negociação ativa",
  repassesPendentes: "Repasses pendentes",
  execucoes: "Execuções",
  dossies: "Dossiês",
  agentes: "Agentes",
  fluxos: "Fluxos",
  playbooks: "Playbooks",
  promptsAtivos: "Prompts ativos",
  gerados: "Gerados",
  copiados: "Copiados",
  revisao: "Em revisão",
};

function capitalizeLabel(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function humanizeLabel(label: string): string {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) return "";
  if (operationalLabelMap[trimmed]) return operationalLabelMap[trimmed];

  if (trimmed.includes("•")) {
    return trimmed
      .split("•")
      .map((part) => humanizeLabel(part.trim()))
      .join(" • ");
  }

  if (/\s/.test(trimmed) && !/[A-Z_]/.test(trimmed)) return capitalizeLabel(trimmed);

  const normalized = trimmed
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/([a-záéíóúâêôãõç])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return capitalizeLabel(normalized);
}

export const formatOperationalLabel = humanizeLabel;
