export const DEMO_ACCESS_COOKIE = "lexos_control_demo_access";
export const DEMO_ACCESS_COOKIE_VALUE = "local-demo-v1";

export const operationalRoutePrefixes = [
  "/dashboard",
  "/clientes",
  "/processos",
  "/tarefas",
  "/agenda",
  "/financeiro",
  "/relatorios",
  "/central-lexos",
  "/configuracoes",
  "/socios",
  "/onboarding",
  "/minha-semana",
] as const;

export function isOperationalRoute(pathname: string) {
  return operationalRoutePrefixes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function hasDemoAccessCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .includes(`${DEMO_ACCESS_COOKIE}=${DEMO_ACCESS_COOKIE_VALUE}`);
}
