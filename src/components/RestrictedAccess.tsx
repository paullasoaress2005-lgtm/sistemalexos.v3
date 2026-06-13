"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";
import { canAccessModule, type WorkspaceModule } from "@/lib/permissions";

export function RestrictedAccess({ module, children }: { module: WorkspaceModule; children: React.ReactNode }) {
  const [session, setSession] = useState<LexosSession | null>(null);

  useEffect(() => {
    setSession(getCurrentSessionOrFallback());
  }, []);

  if (!session) return null;

  if (canAccessModule(session.user.profile, module)) return <>{children}</>;

  return (
    <section className="rounded-3xl border border-lexos-gold/24 bg-gradient-to-br from-lexos-panel/96 via-lexos-navy/92 to-lexos-ink p-8 text-center shadow-premium">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">Permissões do escritório</p>
      <h1 className="mt-4 text-3xl font-semibold text-white">Acesso restrito neste escritório.</h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-lexos-muted">
        Seu papel atual não libera este módulo. Se precisar apoiar esta rotina, solicite a revisão de permissões a um gestor autorizado do escritório.
      </p>
      <Link className="mt-6 inline-flex rounded-2xl border border-lexos-gold/50 bg-lexos-gold/12 px-5 py-3 text-sm font-semibold text-lexos-goldSoft transition hover:-translate-y-0.5 hover:bg-lexos-gold/18 hover:text-white focus:outline-none focus:ring-2 focus:ring-lexos-gold/40" href="/dashboard">
        Voltar ao Dashboard
      </Link>
    </section>
  );
}
