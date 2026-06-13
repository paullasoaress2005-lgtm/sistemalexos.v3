"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearLocalSession, getCurrentSession, persistLocalSession, resolveSupabaseSession } from "@/lib/auth";
import { isOperationalRoute } from "@/lib/auth/routes";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isOperationalRoute(pathname)) {
      setIsChecking(false);
      return;
    }

    let isCancelled = false;

    async function validateSession() {
      const session = getCurrentSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      if (session.mode === "supabase") {
        const resolvedSession = await resolveSupabaseSession();
        if (!resolvedSession) {
          clearLocalSession();
          router.replace("/login");
          return;
        }
        persistLocalSession(resolvedSession);
      }

      if (!isCancelled) setIsChecking(false);
    }

    void validateSession();
    return () => {
      isCancelled = true;
    };
  }, [pathname, router]);

  if (isChecking && isOperationalRoute(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lexos-ink bg-premium-radial p-6">
        <div className="rounded-3xl border border-lexos-gold/25 bg-lexos-panel/95 p-6 text-center shadow-premium">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">
            LEX.OS Control
          </p>
          <p className="mt-3 text-sm text-lexos-muted">
            Validando sessão demonstrativa...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
