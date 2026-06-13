import { createActivityLog } from "@/lib/data/activityLogs";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export const DEMO_SEED_MARKER = "[DEMO_SEED_LEXOS]";

export type DemoSeedResult = { status: "created" | "exists" | "none"; message: string };

function toDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toStartAt(dateOnly: string, time = "10:00:00") {
  return `${dateOnly}T${time}.000Z`;
}

export async function generateDemoSeed(workspaceId: string, userId: string | null): Promise<DemoSeedResult> {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase indisponível.");

  const { data: existingClient } = await (supabase as any)
    .from("clients")
    .select("id")
    .eq("workspace_id", workspaceId)
    .or(`name.ilike.%DEMO - %,notes.ilike.%${DEMO_SEED_MARKER}%`)
    .limit(1)
    .maybeSingle();

  if (existingClient) {
    return { status: "exists", message: "Já existem dados fictícios ativos. Limpe antes de gerar novamente." };
  }

  const clientNotes = `${DEMO_SEED_MARKER} Cliente fictício para validação visual do sistema.`;
  const { data: client, error: clientError } = await (supabase as any).from("clients").insert({
    workspace_id: workspaceId,
    name: "DEMO - Clínica Aurora Saúde Integrada",
    type: "pessoa_juridica",
    email: "contato@clinicaaurora.demo",
    phone: "(98) 90000-0001",
    status: "ativo",
    notes: clientNotes,
  }).select("id,name").single();
  if (clientError) throw clientError;

  const processNotes = `${DEMO_SEED_MARKER} Processo fictício para testar cards, dashboard e movimentações.`;
  const { data: process, error: processError } = await (supabase as any).from("processes").insert({
    workspace_id: workspaceId,
    client_id: client.id,
    client_name: "DEMO - Clínica Aurora Saúde Integrada",
    title: "DEMO - Obrigação de Fazer c/c Tutela de Urgência",
    area: "civel",
    status: "ativo",
    risk: "médio",
    priority: "alta",
    responsible: "Responsável padrão",
    notes: processNotes,
    main_issue: "Cobertura negada em procedimento urgente.",
    next_deadline_at: toDateOffset(1),
    next_action: "Protocolar manifestação com laudos atualizados.",
  }).select("id").single();
  if (processError) throw processError;

  const { data: task1, error: task1Error } = await (supabase as any).from("tasks").insert({
    workspace_id: workspaceId, client_id: client.id, client_name: client.name, process_id: process.id,
    title: "DEMO - Revisar documentos médicos enviados pelo cliente",
    description: "Revisar anexos para a tutela.", type: "revisão", status: "a_fazer", priority: "média", responsible: "Responsável padrão",
    due_at: toDateOffset(0), next_action: "Consolidar pendências", notes: `${DEMO_SEED_MARKER} Tarefa fictícia pendente.`,
  }).select("id").single();
  if (task1Error) throw task1Error;

  const { error: task2Error } = await (supabase as any).from("tasks").insert({
    workspace_id: workspaceId, client_id: client.id, client_name: client.name, process_id: process.id,
    title: "DEMO - Retornar contato sobre pendência documental",
    description: "Pendência documental crítica.", type: "atendimento", status: "a_fazer", priority: "alta", responsible: "Responsável padrão",
    due_at: toDateOffset(-1), next_action: "Ligar para o cliente", notes: `${DEMO_SEED_MARKER} Tarefa fictícia atrasada.`,
  });
  if (task2Error) throw task2Error;

  const { error: agendaError } = await (supabase as any).from("agenda_events").insert({
    workspace_id: workspaceId, client_id: client.id, client_name: client.name, process_id: process.id,
    title: "DEMO - Reunião de alinhamento com cliente", description: "Reunião de status.", type: "reuniao", status: "agendado", priority: "alta", responsible: "Responsável padrão",
    starts_at: toStartAt(toDateOffset(1)), next_action: "Alinhar próximos passos", notes: `${DEMO_SEED_MARKER} Evento fictício de agenda.`,
  });
  if (agendaError) throw agendaError;

  const { error: finance1Error } = await (supabase as any).from("financial_records").insert({ workspace_id: workspaceId, client_id: client.id, client_name: client.name, process_id: process.id, title: "DEMO - Honorários iniciais", description: `${DEMO_SEED_MARKER} Cobrança fictícia a receber.`, direction: "receita", status: "pendente", amount: 1500, due_date: toDateOffset(7), notes: `${DEMO_SEED_MARKER} Cobrança fictícia a receber.` });
  if (finance1Error) throw finance1Error;
  const { error: finance2Error } = await (supabase as any).from("financial_records").insert({ workspace_id: workspaceId, client_id: client.id, client_name: client.name, process_id: process.id, title: "DEMO - Parcela vencida de honorários", description: `${DEMO_SEED_MARKER} Cobrança fictícia vencida.`, direction: "receita", status: "vencido", amount: 750, due_date: toDateOffset(-5), notes: `${DEMO_SEED_MARKER} Cobrança fictícia vencida.` });
  if (finance2Error) throw finance2Error;

  const { data: partnership, error: partnershipError } = await (supabase as any).from("process_partnerships").insert({ workspace_id: workspaceId, partner_name: "DEMO - Correspondente Jurídico São Luís", partner_firm: "DEMO - Correspondente Jurídico São Luís", status: "aguardando_documento", partnership_type: "correspondente", fee_model: "valor_fixo", expected_amount: 300, repasse_status: "repasse_pendente", internal_responsible: "Responsável padrão", external_responsible: "DEMO - Correspondente Jurídico São Luís", next_action: "Aguardar documento e confirmar repasse", main_pending: "Documento pendente", notes: `${DEMO_SEED_MARKER} Parceria fictícia para testar módulo de correspondentes.` }).select("id").single();
  if (partnershipError) throw partnershipError;

  const { error: centralError } = await (supabase as any).from("central_executions").insert({ workspace_id: workspaceId, created_by: userId, execution_type: "dossie_rapido", title: "DEMO - Dossiê rápido de negativa de cobertura", source_module: "Central LEX.OS", client_id: client.id, process_id: process.id, partnership_id: partnership.id, task_id: task1.id, input_summary: `${DEMO_SEED_MARKER} Registro fictício da Central LEX.OS.`, output_text: "Dossiê de demonstração concluído.", status: "generated", metadata: { demo_seed: true, marker: DEMO_SEED_MARKER } });
  if (centralError) throw centralError;

  await createActivityLog({ workspaceId, entityType: "clients", action: "demo_seed_created", entityId: client.id, title: "Cliente fictício criado", description: `${DEMO_SEED_MARKER} Cliente fictício criado` });
  await createActivityLog({ workspaceId, entityType: "processes", action: "demo_seed_created", entityId: process.id, title: "Processo fictício criado", description: `${DEMO_SEED_MARKER} Processo fictício criado` });
  return { status: "created", message: "Dados fictícios criados com sucesso." };
}

export async function clearDemoSeed(workspaceId: string): Promise<DemoSeedResult> {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error("Supabase indisponível.");

  const tables = ["central_executions", "agenda_events", "financial_records", "process_partnerships", "tasks", "processes", "clients"];
  let foundAny = false;
  for (const table of tables) {
    const { data } = await (supabase as any).from(table).select("id").eq("workspace_id", workspaceId).or(`title.ilike.%DEMO - %,name.ilike.%DEMO - %,notes.ilike.%${DEMO_SEED_MARKER}%,description.ilike.%${DEMO_SEED_MARKER}%`);
    const ids = (data ?? []).map((row: any) => row.id);
    if (ids.length) {
      foundAny = true;
      const { error } = await (supabase as any).from(table).delete().in("id", ids).eq("workspace_id", workspaceId);
      if (error) throw error;
    }
  }
  if (!foundAny) return { status: "none", message: "Nenhum dado fictício encontrado." };
  return { status: "created", message: "Dados fictícios removidos com sucesso." };
}
