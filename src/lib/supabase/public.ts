import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * Supabase client for the public site: the anon key and **no cookies**, so
 * every query runs as `anon` even when the visitor is signed in to the admin.
 * With the cookie client, a signed-in admin would get `warta:read` through
 * RLS and see draft warta on public pages.
 *
 * What anon may read is limited by RLS (0019: published warta and their
 * Litbang and Kesaksian rows) and the public functions (0020, 0027). Never
 * the service-role key here.
 *
 * `cache: "no-store"` keeps Next's fetch cache out of it: the public pages
 * render per request (docs/progress.md, stage 9b).
 */
export function createPublicClient() {
  const { url, anonKey } = supabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export type PublicSupabase = ReturnType<typeof createPublicClient>;
