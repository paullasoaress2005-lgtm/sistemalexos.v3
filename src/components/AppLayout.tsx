"use client";

import { AuthGate } from "./AuthGate";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceTheme } from "./WorkspaceTheme";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <WorkspaceTheme>
        <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(92,201,213,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(92,201,213,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <Sidebar />
        <div className="relative z-10 min-h-screen lg:pl-[232px]">
          <Topbar />
          <main className="mx-auto max-w-[1260px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
            {children}
          </main>
        </div>
      </WorkspaceTheme>
    </AuthGate>
  );
}
