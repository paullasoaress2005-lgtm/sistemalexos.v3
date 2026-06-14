"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authStorageKeys, demoWorkspace, getCurrentSessionOrFallback, type LexosSession } from "@/lib/auth";
import { getDataSourceStatus } from "@/lib/data/source";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Operação",
    items: [{ href: "/dashboard", label: "Visão Geral", icon: "VG" }],
  },
  {
    label: "Carteira",
    items: [
      { href: "/clientes", label: "Clientes", icon: "CL" },
      { href: "/processos", label: "Processos", icon: "PR" },
      { href: "/tarefas", label: "Tarefas", icon: "TF" },
      { href: "/agenda", label: "Agenda", icon: "AG" },
    ],
  },
  {
    label: "Controle",
    items: [
      { href: "/financeiro", label: "Financeiro", icon: "FI" },
      { href: "/socios", label: "Sócios", icon: "SO" },
      { href: "/relatorios", label: "Relatórios", icon: "RL" },
    ],
  },
  {
    label: "LEX.OS",
    items: [
      { href: "/central-lexos", label: "Central LEX.OS", icon: "LX" },
      { href: "/configuracoes", label: "Configurações", icon: "CF" },
      { href: "/configuracoes/release", label: "Implantação", icon: "IM" },
      { href: "/onboarding", label: "Primeiros passos", icon: "ON" },
    ],
  },
];

const mobileItems = [
  { href: "/dashboard", label: "Início" },
  { href: "/clientes", label: "Clientes" },
  { href: "/processos", label: "Processos" },
  { href: "/tarefas", label: "Tarefas" },
  { href: "/central-lexos", label: "Central" },
];

function isSidebarItemActive(pathname: string, href: string) {
  if (href === "/configuracoes") {
    return pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/configuracoes/release"));
  }
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
  if (session.mode === "supabase") return isResolvedSupabaseWorkspace(session) ? session.workspace.name : "Carregando escritório...";
  return "Escritório";
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] border-r border-lexos-line/60 bg-[#071525]/95 px-4 py-5 shadow-[18px_0_60px_rgba(0,0,0,0.28)] lg:block">
        <Link className="flex items-center gap-3 rounded-[16px] border border-lexos-line/70 bg-white/[0.025] p-3 transition hover:border-lexos-gold/45 hover:bg-white/[0.04]" href="/dashboard" aria-label="Ir para visão geral LEX.OS Control">
          <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border border-lexos-gold/35 bg-lexos-ink/70">
            <Image alt="LEX.OS" className="h-11 w-11 object-contain" height={44} src="/lexos-logo.png" width={44} priority />
          </span>
          <span className="min-w-0">
            <strong className="block text-[15px] leading-5 text-white">LEX.OS Control</strong>
            <span className="mt-0.5 block truncate text-[11px] text-lexos-muted">{workspaceDisplayName}</span>
            <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.22em] text-lexos-gold">Produto LEX.OS</span>
          </span>
        </Link>

        <nav className="mt-6 max-h-[calc(100vh-190px)] overflow-y-auto pr-1 premium-scrollbar" aria-label="Navegação principal">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-lexos-muted">{group.label}</p>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = isSidebarItemActive(pathname, item.href);
                    return (
                      <Link
                        className={cn(
                          "flex min-h-10 items-center gap-3 rounded-[10px] border px-3 text-sm transition",
                          active
                            ? "border-lexos-gold/42 bg-lexos-gold/12 font-bold text-lexos-goldSoft shadow-[inset_3px_0_0_rgba(202,165,91,0.75)]"
                            : "border-transparent font-semibold text-lexos-silver hover:border-lexos-line/80 hover:bg-white/[0.035] hover:text-white",
                        )}
                        href={item.href}
                        key={item.href}
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-current/20 font-mono text-[10px]" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-[14px] border border-lexos-line/70 bg-lexos-ink/55 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-lexos-goldSoft">Piloto controlado</p>
            <span className={cn("h-2 w-2 rounded-full", dataStatus.effective === "supabase" ? "bg-lexos-green" : "bg-lexos-gold")} />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-lexos-muted">Nenhuma ação externa é enviada automaticamente.</p>
        </div>
      </aside>

      <nav className="fixed inset-x-2 bottom-2 z-50 flex gap-1 overflow-x-auto rounded-[12px] border border-lexos-line/55 bg-lexos-ink/94 p-1 shadow-[0_16px_48px_rgba(0,0,0,.42)] backdrop-blur-xl lg:hidden" aria-label="Navegação mobile">
        {mobileItems.map((item) => {
          const active = isSidebarItemActive(pathname, item.href);
          return (
            <Link
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-2 text-[11px] font-bold transition",
                active ? "border border-lexos-gold/40 bg-lexos-gold/14 text-lexos-goldSoft" : "border border-transparent text-lexos-muted hover:bg-white/[0.04] hover:text-white",
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
