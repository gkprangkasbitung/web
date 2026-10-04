import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * The signed-in account's own linked jemaat, name only (get_my_jemaat, 0034).
 * jemaat itself stays readable only with warta:read; this function reads
 * nothing but the caller's own row.
 */
export async function loadMyJemaat(supabase: ServerSupabase): Promise<{ id: string; nama: string } | null> {
  const { data, error } = await supabase.rpc("get_my_jemaat");
  if (error) {
    console.error("[/jemaat] get_my_jemaat failed:", error.message);
    return null;
  }
  return data?.[0] ?? null;
}
