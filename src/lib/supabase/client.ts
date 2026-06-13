import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function hasSupabaseBrowserConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}

export function getSupabasePublicStatus() {
  return {
    configured: hasSupabaseBrowserConfig(),
    urlConfigured: Boolean(supabaseUrl),
    anonKeyConfigured: Boolean(supabaseAnonKey),
  };
}
