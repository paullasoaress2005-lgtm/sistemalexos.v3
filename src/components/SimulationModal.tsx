"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function SimulationModal({
  title,
  eyebrow = "Prévia demonstrativa",
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-lexos-ink/88 p-3 pt-4 backdrop-blur-md sm:pt-6" role="dialog" aria-modal="true">
      <div className={cn("my-auto max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-[1.5rem] border border-lexos-gold/35 bg-[#0a1424]/[0.99] p-4 shadow-[0_34px_120px_rgba(0,0,0,0.72)] ring-1 ring-white/5 premium-scrollbar sm:p-5", wide ? "max-w-5xl" : "max-w-3xl")}>
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-lexos-line/80 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lexos-gold">{eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            className="rounded-full border border-lexos-line bg-lexos-card/90 px-3 py-1.5 text-sm font-semibold text-lexos-silver transition hover:border-lexos-gold hover:bg-lexos-gold/10 hover:text-lexos-gold"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-lexos-line/80 bg-lexos-card/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-lexos-silver">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
