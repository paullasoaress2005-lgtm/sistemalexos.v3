import { AppLayout } from "@/components/AppLayout";
import { CalendarView, DataTable, EmptyState, KanbanBoard, SectionCard } from "@/components/ui";

export function PlaceholderPage({ title, description, variant = "table" }: { title: string; description: string; variant?: "table" | "kanban" | "calendar" | "empty" }) {
  return (
    <AppLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-lexos-gold/24 bg-gradient-to-br from-lexos-panel/96 via-lexos-navy/92 to-lexos-ink p-6 shadow-premium lg:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">LEX.OS Control</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white lg:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-lexos-muted">{description}</p>
        </section>
        <SectionCard title="Área operacional" eyebrow="Dados estruturados">
          {variant === "kanban" ? <KanbanBoard /> : null}
          {variant === "calendar" ? <CalendarView /> : null}
          {variant === "empty" ? <EmptyState title="Conteúdo preparado para próxima iteração" description="Esta rota já existe para navegação premium do protótipo, sem integrações reais." /> : null}
          {variant === "table" ? <DataTable columns={["Item", "Responsável", "Status"]} rows={[["Cliente exemplo", "Dra. Camila", "em andamento"], ["Processo em acompanhamento", "Dr. Rafael", "urgente"], ["Revisão interna", "Equipe", "pendente"]]} /> : null}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
