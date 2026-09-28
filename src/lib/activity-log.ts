import "server-only";

import { headers } from "next/headers";

import type { ActivityModule } from "@/lib/activity-modules";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Wraps a record name for an activity sentence: Membuat warta "Minggu Adven I". */
export function quote(value: string): string {
  return `"${value}"`;
}

/** First entry of x-forwarded-for, else x-real-ip. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || null;
}

/**
 * Writes one activity_logs row after a successful mutation (brief §7).
 * Uses the user's own session client: RLS only lets users insert rows for
 * themselves. Never throws; a failure is logged to the server console so it
 * can't break the action that already succeeded.
 */
export async function logActivity({
  supabase,
  user,
  module,
  activity,
}: {
  supabase: ServerSupabase;
  user: { id: string; email: string };
  module: ActivityModule;
  activity: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      user_id: user.id,
      user_email: user.email,
      module,
      activity,
      ip_address: await getClientIp(),
    });
    if (error) console.error(`[activity-log] ${module}: ${activity} -`, error.message);
  } catch (error) {
    console.error(`[activity-log] ${module}: ${activity} -`, error);
  }
}
