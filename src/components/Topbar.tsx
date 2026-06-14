"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { consumePendingToast, endDemoSession, getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";

const routeLabels: Array<[string, string]> = [
  ["/dashboard", "Visão Geral"],
  ["/clientes", "Clientes"],
  ["/processos", "Processos"],
  ["/tarefas", "Tarefas"],
  ["/agenda", "Agenda"],
  ["/financeiro", "Financeiro"],
  ["/socios", "Sócios"],
  ["/relatorios", "Relatórios"],
  ["/central-lexos", "Central LEX.OS"],
  ["/configuracoes", "Configurações"],
  ["/onboarding", "Primeiros passos"],
];

function resolveRouteLabel(pathname: string) {
  const match = routeLabels
    .filter(([route]) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? "LEX.OS Control";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "LX";
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<LexosSession>(() => getCurrentSessionOrFallback());
  const [toast, setToast] = useState<string | null>(null);
  const routeLabel = useMemo(() => resolveRouteLabel(pathname), [pathname]);

  useEffect(() => {
    setSession(getCurrentSessionOrFallback());
    const pending = consumePendingToast();
    if (pending) setToast(pending);
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function handleLogout() {
    endDemoSession();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-lexos-line/55 bg-[#06111f]/88 backdrop-blur-xl">
      <div className="flex min-h-[68px] items-center justify-between gap-3 px-4 lg:px-8">
        <div className="min-w-0">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-lexos-cyan/25 bg-lexos-cyan/8 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-lexos-cyan">
            <span className="h-2 w-2 shrink-0 rounded-full bg-lexos-cyan shadow-[0_0_18px_rgba(92,201,213,0.75)]" />
            <span className="truncate">Ambiente de demonstração - dados fictícios</span>
          </div>
          <p className="mt-1 hidden text-xs text-lexos-muted sm:block">{routeLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link className="hidden min-h-10 items-center justify-center rounded-[12px] border border-lexos-line/65 bg-white/[0.035] px-4 text-sm font-bold text-lexos-silver transition hover:border-lexos-gold/45 hover:text-white md:inline-flex" href="/central-lexos/dossie-rapido">
            Novo dossiê
          </Link>
          <div className="flex items-center gap-3 rounded-full border border-lexos-line/70 bg-white/[0.035] py-2 pl-2 pr-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lexos-gold/20 text-xs font-extrabold text-lexos-goldSoft">
              {initials(session.user.name)}
            </span>
            <span className="hidden text-right sm:block">
              <strong className="block text-xs text-white">{session.user.name || "Usuário LEX.OS"}</strong>
              <span className="text-[11px] text-lexos-muted">{session.user.role || "Perfil demonstrativo"}</span>
            </span>
          </div>
          <button className="hidden min-h-10 rounded-[12px] border border-lexos-line/65 bg-white/[0.025] px-3 text-xs font-bold text-lexos-muted transition hover:border-lexos-gold/45 hover:text-white sm:inline-flex sm:items-center" type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </div>
      {toast ? (
        <div className="fixed right-4 top-20 z-[70] rounded-[14px] border border-lexos-gold/40 bg-lexos-panel/98 px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium ring-1 ring-white/5">
          {toast}
        </div>
      ) : null}
    </header>
  );
}
