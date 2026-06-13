import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

type WorkspaceMembership = {
  workspace_id?: string | null;
  workspaces?: { id?: string | null; status?: string | null } | { id?: string | null; status?: string | null }[] | null;
};

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export function hasSupabaseProxyConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseAnonKey());
}

function createProxyClient(request: NextRequest, response: NextResponse) {
  const supabaseAnonKey = getSupabaseAnonKey();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseAnonKey) return null;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
}

export async function updateSupabaseSession(request: NextRequest, response: NextResponse) {
  const supabase = createProxyClient(request, response);
  if (!supabase) return response;

  await supabase.auth.getUser();
  return response;
}

export async function hasValidSupabaseOperationalAccess(request: NextRequest, response: NextResponse) {
  const supabase = createProxyClient(request, response);
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, status)")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;

  const membership = data as WorkspaceMembership;
  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces;

  return Boolean(membership.workspace_id && workspace?.id && workspace.status === "active");
}
