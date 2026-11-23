import "server-only";

import { createHash } from "node:crypto";

import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Wrong-password limits for /portal/masuk (brief §18.7, stage 14d), on top of
 * 0034's auth_throttle (limits in private.auth_throttle_limits, 0039):
 *
 * - `login_fail_akun`: 5 wrong passwords per 15 minutes per account, then
 *   locked until the oldest of them is 15 minutes old. The subject is the
 *   auth email, so both tabs count together (a username maps to its internal
 *   email first). An account that doesn't exist counts exactly the same way.
 * - `login_fail_ip`: 30 wrong passwords per 15 minutes per IP. Supabase sees
 *   every sign-in from the app server's IP, so this is the only per-visitor
 *   limit.
 *
 * Subjects are SHA-256 digests, so no email, username, or IP is stored.
 */
const BUCKETS = ["login_fail_akun", "login_fail_ip"] as const;

/** Seconds to wait when the throttle can't be checked: fail closed. */
const UNAVAILABLE_WAIT = 60;

function digest(prefix: string, value: string): string {
  return createHash("sha256").update(`${prefix}:${value}`).digest("hex");
}

function subjects(authEmail: string, ip: string | null): string[] {
  return [digest("akun", authEmail.toLowerCase()), digest("ip", ip ?? "unknown")];
}

/** Seconds until another try is allowed for this account and IP; 0 = now. */
export async function loginWait(supabase: ServerSupabase, authEmail: string, ip: string | null): Promise<number> {
  const { data, error } = await supabase.rpc("auth_throttle", {
    p_buckets: [...BUCKETS],
    p_subjects: subjects(authEmail, ip),
    p_record: false,
  });
  if (error || typeof data !== "number") {
    console.error("[login-throttle] check failed:", error?.code ?? "no data");
    return UNAVAILABLE_WAIT;
  }
  return data;
}

/** Counts one wrong password against the account and the IP. */
export async function recordLoginFailure(supabase: ServerSupabase, authEmail: string, ip: string | null): Promise<void> {
  const { error } = await supabase.rpc("auth_throttle", {
    p_buckets: [...BUCKETS],
    p_subjects: subjects(authEmail, ip),
    p_record: true,
  });
  if (error) console.error("[login-throttle] record failed:", error.code);
}

/** "Coba lagi dalam 15 menit." for a wait in seconds (at least one minute). */
export function waitMessage(seconds: number): string {
  return `Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.max(1, Math.ceil(seconds / 60))} menit.`;
}
