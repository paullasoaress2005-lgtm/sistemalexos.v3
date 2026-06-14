import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("premium-surface rounded-[18px] border border-lexos-line/70 bg-lexos-card/24 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.18)] backdrop-blur lg:p-5", className)}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-lexos-goldSoft">{eyebrow}</p> : null}
          <h2 className="font-serif text-2xl font-semibold leading-tight tracking-[-0.035em] text-white">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "border-lexos-line text-lexos-silver",
    urgent: "border-lexos-wine/60 text-lexos-red",
    warning: "border-lexos-gold/45 text-lexos-goldSoft",
    positive: "border-lexos-green/50 text-lexos-green",
    premium: "border-lexos-gold/60 text-lexos-goldSoft",
  };
  return (
    <div className={cn("rounded-[14px] border bg-gradient-to-br from-lexos-card/72 to-lexos-navy/72 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.16)]", tones[tone] ?? tones.neutral)}>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-lexos-muted">{label}</p>
      <p className="mt-3 font-serif text-3xl font-semibold leading-none tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em]">{detail}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = (() => {
    if (["urgente", "máxima", "risco alto", "alto", "atrasada", "atrasado", "vencido", "crítico", "cancelado"].some((item) => normalized.includes(item))) return "critical";
    if (["atenção", "pendente", "aguardando", "em negociação", "parcial", "próximo", "revisão"].some((item) => normalized.includes(item))) return "warning";
    if (["pago", "concluído", "concluída", "ativo", "ativa", "gerado", "ambiente conectado", "piloto controlado"].some((item) => normalized.includes(item))) return "positive";
    if (["arquivado", "inativo", "rascunho"].some((item) => normalized.includes(item))) return "muted";
    return "neutral";
  })();
  const classes: Record<string, string> = {
    critical: "border-lexos-wine/70 bg-lexos-wine/18 text-lexos-red",
    warning: "border-lexos-gold/55 bg-lexos-gold/14 text-lexos-goldSoft",
    positive: "border-lexos-green/55 bg-lexos-green/14 text-lexos-green",
    muted: "border-lexos-line bg-lexos-card/68 text-lexos-silver",
    neutral: "border-lexos-line bg-lexos-ink/58 text-lexos-silver",
  };
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-[10px] font-bold capitalize shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]", classes[tone])}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "baixa" | "média" | "alta" | "urgente" | "máxima" }) {
  return <StatusBadge status={priority} />;
}

export function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-lexos-line/70 bg-lexos-card/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="overflow-x-auto premium-scrollbar">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-lexos-navy/80 font-mono text-[10px] uppercase tracking-[0.18em] text-lexos-muted">
            <tr>
              {columns.map((column) => (
                <th className="border-b border-lexos-line/80 px-4 py-3 font-semibold" key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-lexos-silver">
            {rows.map((row) => (
              <tr className="group transition hover:bg-white/[0.035]" key={row.join("-")}>
                {row.map((cell) => (
                  <td className="border-b border-lexos-line/55 px-4 py-3 group-last:border-b-0" key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PromptCard({ title, description }: { title: string; description: string }) {
  return <div className="rounded-[14px] border border-lexos-line/70 bg-lexos-card/30 p-4 transition hover:border-lexos-gold/45 hover:bg-white/[0.035]"><p className="font-semibold text-white">{title}</p><p className="mt-1.5 text-sm leading-5 text-lexos-muted">{description}</p></div>;
}

export function AgentCard({ name, description }: { name: string; description: string }) {
  return <div className="rounded-[14px] border border-lexos-gold/24 bg-gradient-to-br from-lexos-card/52 to-lexos-navy/78 p-4 transition hover:border-lexos-gold/45"><p className="font-semibold text-white">{name}</p><p className="mt-1.5 text-sm leading-5 text-lexos-muted">{description}</p></div>;
}

export function ReportCard({ title, value }: { title: string; value: string }) {
  return <div className="rounded-[14px] border border-lexos-line/70 bg-lexos-card/24 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"><p className="text-sm text-lexos-muted">{title}</p><p className="mt-1.5 font-serif text-2xl font-semibold text-lexos-goldSoft">{value}</p></div>;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const actionClass = "mt-4 inline-flex min-h-10 items-center rounded-[12px] border border-lexos-gold/45 bg-lexos-gold/10 px-4 text-sm font-bold text-lexos-goldSoft transition hover:bg-lexos-gold/16";
  return (
    <div className="rounded-[16px] border border-dashed border-lexos-gold/35 bg-lexos-card/18 p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="font-serif text-xl font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-lexos-muted">{description}</p>
      {actionLabel && actionHref ? <Link className={actionClass} href={actionHref}>{actionLabel}</Link> : null}
      {actionLabel && onAction ? <button className={actionClass} onClick={onAction} type="button">{actionLabel}</button> : null}
    </div>
  );
}

export function FormField({ label, placeholder }: { label: string; placeholder: string }) {
  return <label className="block text-sm text-lexos-muted">{label}<input className="mt-2 w-full rounded-[12px] border border-lexos-line bg-lexos-ink/88 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold" placeholder={placeholder} /></label>;
}

export function Modal({ title }: { title: string }) {
  return <div className="rounded-[16px] border border-lexos-line bg-lexos-panel p-4"><p className="font-semibold text-white">{title}</p><p className="mt-1.5 text-sm text-lexos-muted">Área preparada para complementar o fluxo do escritório com segurança e revisão humana.</p></div>;
}

export function KanbanBoard() {
  return <div className="grid gap-3 md:grid-cols-3">{["A fazer", "Em andamento", "Concluídas"].map((col) => <div className="rounded-[14px] border border-lexos-line/70 bg-lexos-card/24 p-4" key={col}><p className="font-semibold text-white">{col}</p><div className="mt-3 rounded-[12px] border border-lexos-line/50 bg-lexos-ink/55 p-3 text-sm text-lexos-muted">Demanda em acompanhamento</div></div>)}</div>;
}

export function CalendarView() {
  return <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">{["Seg", "Ter", "Qua", "Qui", "Sex"].map((day) => <div className="rounded-[14px] border border-lexos-line bg-lexos-card/30 p-4 text-center transition hover:border-lexos-gold/45" key={day}><p className="font-semibold text-white">{day}</p><p className="mt-1.5 text-sm text-lexos-muted">agenda organizada</p></div>)}</div>;
}

export function PremiumLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="text-sm font-semibold text-lexos-goldSoft transition hover:text-white hover:underline hover:underline-offset-4" href={href}>{children}</Link>;
}

export function PaginationControls({
  currentPage,
  onPageChange,
  pageSize,
  totalItems,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
}) {
  if (totalItems <= pageSize) {
    return (
      <div className="rounded-[14px] border border-lexos-line/55 bg-white/[0.025] px-3 py-2 text-xs text-lexos-muted">
        Exibindo {totalItems} registro{totalItems === 1 ? "" : "s"} no recorte atual.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-lexos-line/55 bg-white/[0.025] px-3 py-2 text-xs text-lexos-muted sm:flex-row sm:items-center sm:justify-between">
      <span>
        Exibindo {start}-{end} de {totalItems} registros filtrados.
      </span>
      <div className="flex items-center gap-2">
        <button
          className="rounded-full border border-lexos-line/70 px-3 py-1 font-semibold text-lexos-silver transition hover:border-lexos-gold/45 hover:text-lexos-goldSoft disabled:cursor-not-allowed disabled:opacity-45"
          disabled={safePage === 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          type="button"
        >
          Anterior
        </button>
        <span className="font-semibold text-lexos-goldSoft">{safePage}/{totalPages}</span>
        <button
          className="rounded-full border border-lexos-line/70 px-3 py-1 font-semibold text-lexos-silver transition hover:border-lexos-gold/45 hover:text-lexos-goldSoft disabled:cursor-not-allowed disabled:opacity-45"
          disabled={safePage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          type="button"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
