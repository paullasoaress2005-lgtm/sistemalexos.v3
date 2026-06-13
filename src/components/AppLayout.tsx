"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "./AuthGate";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceTheme } from "./WorkspaceTheme";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [gridPosition, setGridPosition] = useState({ x: "50vw", y: "22vh" });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return undefined;

    function handlePointerMove(event: PointerEvent) {
      setGridPosition({ x: `${event.clientX}px`, y: `${event.clientY}px` });
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <AuthGate>
      <WorkspaceTheme>
        <div
          aria-hidden="true"
          className="ambient-grid"
          style={{ "--grid-x": gridPosition.x, "--grid-y": gridPosition.y } as React.CSSProperties}
        >
          <div className="grid-light" />
          <div className="grid-crosshair-x" />
          <div className="grid-crosshair-y" />
        </div>
        <Sidebar />
        <div className="relative z-10 lg:pl-[17rem]">
          <Topbar />
          <main className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 lg:px-5 lg:py-5 xl:px-6">
            {children}
          </main>
        </div>
      </WorkspaceTheme>
    </AuthGate>
  );
}
