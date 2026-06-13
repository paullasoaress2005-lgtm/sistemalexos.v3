import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_ACCESS_COOKIE,
  DEMO_ACCESS_COOKIE_VALUE,
  isOperationalRoute,
} from "@/lib/auth/routes";
import {
  hasValidSupabaseOperationalAccess,
  updateSupabaseSession,
} from "@/lib/supabase/proxy";

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isOperationalRoute(request.nextUrl.pathname)) {
    return updateSupabaseSession(request, response);
  }

  const isLocalDemo = request.cookies.get(DEMO_ACCESS_COOKIE)?.value === DEMO_ACCESS_COOKIE_VALUE;
  if (isLocalDemo) return response;

  if (await hasValidSupabaseOperationalAccess(request, response)) return response;

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
