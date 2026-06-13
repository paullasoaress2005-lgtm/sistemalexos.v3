"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { authStorageKeys, demoWorkspace, getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";
import { getDataSourceStatus } from "@/lib/data/source";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: "VG" },
      { href: "/clientes", label: "Clientes", icon: "CL" },
      { href: "/processos", label: "Processos", icon: "PR" },
      { href: "/tarefas", label: "Tarefas", icon: "TF" },
      { href: "/agenda", label: "Agenda", icon: "AG" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/financeiro", label: "Financeiro", icon: "FI" },
      { href: "/socios", label: "Sócios", icon: "SO" },
      { href: "/relatorios", label: "Relatórios", icon: "RL" },
    ],
  },
  {
    label: "LEX.OS",
    items: [
      { href: "/central-lexos", label: "Central", icon: "LX" },
      { href: "/configuracoes", label: "Configurações", icon: "CF" },
      { href: "/configuracoes/release", label: "Implantação", icon: "IM" },
      { href: "/onboarding", label: "Primeiros passos", icon: "ON" },
    ],
  },
];

const mobileItems = [
  { href: "/dashboard", label: "Início", icon: "VG" },
  { href: "/clientes", label: "Clientes", icon: "CL" },
  { href: "/processos", label: "Casos", icon: "PR" },
  { href: "/tarefas", label: "Criar", icon: "+", primary: true },
  { href: "/central-lexos", label: "LEX.OS", icon: "LX" },
];

function isSidebarItemActive(pathname: string, href: string) {
  if (href === "/configuracoes") return pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/configuracoes/release"));
  if (href === "/configuracoes/release") return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isResolvedSupabaseWorkspace(session: LexosSession) {
  return Boolean(
    session.mode === "supabase" &&
      session.workspace.id &&
      session.user.workspaceId &&
      session.workspace.id === session.user.workspaceId &&
      session.workspace.id !== demoWorkspace.id &&
      session.workspace.name &&
      session.workspace.name !== demoWorkspace.name,
  );
}

function getWorkspaceDisplayName(session: LexosSession) {
  if (session.mode === "demo") return session.workspace.name || demoWorkspace.name;
  if (session.mode === "supabase") {
    return isResolvedSupabaseWorkspace(session) ? session.workspace.name : "Carregando escritório...";
  }
  return "Escritório";
}

function NavGlyph({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border text-[10px] font-semibold tracking-[0.08em]",
        active
          ? "border-lexos-cyan/45 bg-lexos-cyan/14 text-lexos-cyan"
          : "border-lexos-line/45 bg-lexos-ink/42 text-lexos-muted",
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const dataStatus = getDataSourceStatus();
  const [session, setSession] = useState<LexosSession>(() => getCurrentSessionOrFallback());
  const workspaceDisplayName = useMemo(() => getWorkspaceDisplayName(session), [session]);

  useEffect(() => {
    function refreshSession() {
      setSession(getCurrentSessionOrFallback());
    }

    refreshSession();
    window.addEventListener("storage", refreshSession);
    window.addEventListener(authStorageKeys.sessionUpdated, refreshSession);

    return () => {
      window.removeEventListener("storage", refreshSession);
      window.removeEventListener(authStorageKeys.sessionUpdated, refreshSession);
    };
  }, []);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-screen w-[17rem] flex-col border-r border-lexos-line/20 bg-[linear-gradient(180deg,rgba(3,11,19,0.94),rgba(5,17,29,0.88))] px-3 py-4 shadow-[8px_0_30px_rgba(0,0,0,0.20)] backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="block shrink-0 rounded-[8px] border border-lexos-line/10 bg-lexos-panel/22 px-3 py-3 transition hover:border-lexos-cyan/28" aria-label="Ir para visão geral LEX.OS Control">
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-lexos-cyan">LEX.OS</p>
          <h1 className="mt-1 text-[1.35rem] font-semibold leading-none tracking-[-0.04em] text-lexos-silver">Control</h1>
          <p className="mt-2 truncate text-[11px] text-lexos-muted" title={workspaceDisplayName}>{workspaceDisplayName}</p>
        </Link>

        <nav className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 premium-scrollbar" aria-label="Navegação principal">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-lexos-subtle text-lexos-muted">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isSidebarItemActive(pathname, item.href);
                    return (
                      <Link
                        className={cn(
                          "group flex items-center gap-2.5 rounded-[6px] border px-2 py-2 text-sm font-medium transition duration-150",
                          active
                            ? "border-lexos-cyan/28 bg-lexos-cyan/[0.085] text-lexos-cyan"
                            : "border-transparent text-lexos-silver hover:border-lexos-line/30 hover:bg-lexos-card/36 hover:text-white",
                        )}
                        href={item.href}
                        key={item.href}
                      >
                        <NavGlyph active={active}>{item.icon}</NavGlyph>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-lexos-cyan shadow-[0_0_10px_rgba(110,217,255,.7)]" /> : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-4 shrink-0 rounded-[8px] border border-lexos-line/16 bg-lexos-ink/46 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-lexos-muted">Unidade</p>
            <span className={cn("h-2 w-2 rounded-full", dataStatus.effective === "supabase" ? "bg-lexos-green" : "bg-lexos-gold")} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-lexos-silver">{session.user.name || "Usuário"}</p>
          <p className="mt-1 text-xs leading-5 text-lexos-muted">{dataStatus.effective === "supabase" ? "Dados do escritório ativos." : "Demonstração local auditável."}</p>
        </div>
      </aside>

      <nav className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-5 gap-1 rounded-[8px] border border-lexos-line/20 bg-lexos-ink/92 p-1 shadow-[0_16px_48px_rgba(0,0,0,.42)] backdrop-blur-xl lg:hidden" aria-label="Navegação mobile">
        {mobileItems.map((item) => {
          const active = isSidebarItemActive(pathname, item.href);
          return (
            <Link
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[6px] px-1 text-[10px] font-semibold transition",
                item.primary
                  ? "bg-lexos-cyan text-lexos-ink shadow-[0_0_24px_rgba(110,217,255,.22)]"
                  : active
                    ? "bg-lexos-cyan/12 text-lexos-cyan"
                    : "text-lexos-muted hover:bg-lexos-card/55 hover:text-white",
              )}
              href={item.href}
              key={item.href}
            >
              <span className="font-mono text-[11px]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
