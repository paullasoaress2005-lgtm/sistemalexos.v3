"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  consumePendingToast,
  signInWithEmail,
  startDemoSession,
} from "@/lib/auth";
import { getSupabasePublicStatus } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabaseStatus = getSupabasePublicStatus();

  useEffect(() => {
    const pendingToast = consumePendingToast();
    if (pendingToast) setToast(pendingToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await signInWithEmail(email, password);
    setIsSubmitting(false);

    if (!result.ok) {
      setToast(result.message);
      return;
    }

    setToast("Sessão conectada preparada.");
    router.push("/dashboard");
  }

  function handleDemoLogin() {
    startDemoSession();
    setToast("Demonstração iniciada.");
    router.push("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-lexos-ink bg-premium-radial p-6">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.014)_1px,transparent_1px)] bg-[size:64px_64px] opacity-35" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-lexos-gold/12 to-transparent" />
      <section className="relative z-10 grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <div className="rounded-[1.6rem] border border-lexos-gold/20 bg-gradient-to-br from-lexos-panel/95 via-lexos-navy/90 to-lexos-ink p-7 shadow-premium lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-lexos-gold">
            LEX.OS Control
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight text-white lg:text-6xl">
            Entre no comando premium do escritório jurídico.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-lexos-muted lg:text-base">
            Acesso inicial para validar escritório, perfil e permissões em modo
            controlado. A demonstração usa dados fictícios e mantém a fundação
            pronta para autenticação conectada.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Escritório", "Demonstração LEX.OS"],
              ["Plano", "Intelligence"],
              ["Status", "Piloto controlado"],
            ].map(([label, value]) => (
              <div
                className="rounded-2xl border border-lexos-line bg-lexos-card/76 p-4 shadow-glow"
                key={label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lexos-gold/85">
                  {label}
                </p>
                <p className="mt-2 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-lexos-gold/25 bg-lexos-ink/70 p-4 text-sm leading-6 text-lexos-silver">
            Ambiente de demonstração: dados fictícios separados do escritório conectado.
          </div>
        </div>

        <form
          className="rounded-[1.6rem] border border-lexos-gold/24 bg-lexos-panel/95 p-5 shadow-premium ring-1 ring-white/5 lg:p-6"
          onSubmit={handleEmailLogin}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lexos-gold">
            Porta de entrada
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Acesse o escritório
          </h2>
          <p className="mt-3 text-sm leading-5 text-lexos-muted">
            Entrar com e-mail usa autenticação conectada quando configurada, mas a demonstração segue disponível para validação segura.
          </p>

          <div className="mt-7 space-y-4">
            <label className="block text-sm text-lexos-muted">
              E-mail
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="advogado@escritorio.com.br"
                type="email"
                value={email}
              />
            </label>
            <label className="block text-sm text-lexos-muted">
              Senha
              <div className="relative mt-2">
                <input
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-lexos-line bg-lexos-ink/92 px-4 py-3 pr-12 text-white outline-none transition placeholder:text-lexos-muted/75 focus:border-lexos-gold"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-lexos-silver transition hover:bg-lexos-gold/10 hover:text-lexos-gold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-lexos-gold/70"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                      <path d="M9.9 4.24A10.62 10.62 0 0112 4c5 0 8.5 4.5 9.7 6.3a2.8 2.8 0 010 3.4 17.7 17.7 0 01-2.12 2.66" />
                      <path d="M6.62 6.62A17.6 17.6 0 002.3 10.3a2.8 2.8 0 000 3.4C3.5 15.5 7 20 12 20a10.8 10.8 0 004.32-.91" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path d="M2.3 10.3C3.5 8.5 7 4 12 4s8.5 4.5 9.7 6.3a2.8 2.8 0 010 3.4C20.5 15.5 17 20 12 20s-8.5-4.5-9.7-6.3a2.8 2.8 0 010-3.4z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
          </div>

          <div className="mt-7 space-y-3">
            <button
              className="w-full rounded-xl border border-lexos-line bg-lexos-card px-5 py-3 text-center font-semibold text-lexos-silver transition hover:border-lexos-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Validando..." : "Entrar no ambiente conectado"}
            </button>
            <button
              className="w-full rounded-xl bg-lexos-gold px-5 py-3 text-center font-semibold text-lexos-ink shadow-glow transition hover:-translate-y-0.5 hover:bg-lexos-goldSoft"
              onClick={handleDemoLogin}
              type="button"
            >
              Entrar na demonstração
            </button>
          </div>

          {!supabaseStatus.configured ? (
            <div className="mt-5 rounded-2xl border border-lexos-gold/20 bg-lexos-ink/70 p-3 text-center text-xs leading-5 text-lexos-silver">
              Ambiente conectado indisponível. Use a demonstração local.
            </div>
          ) : null}

          <p className="mt-6 text-center text-xs leading-5 text-lexos-muted">
            Sem chaves reais, sem chaves administrativas e sem integrações externas
            nesta rodada.
          </p>
        </form>
      </section>

      {toast ? (
        <div className="fixed right-4 top-6 z-50 rounded-2xl border border-lexos-gold/40 bg-lexos-panel/98 px-4 py-3 text-sm font-semibold text-lexos-gold shadow-premium ring-1 ring-white/5">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
