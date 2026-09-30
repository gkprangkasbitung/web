import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * The service-role key bypasses RLS, so it is used only for what brief §3
 * allows: inviting and deleting auth users. The client itself is never
 * exported; callers get these two operations and nothing else. Permission
 * checks happen in the route handlers before either is called.
 */
function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  const { url } = supabaseEnv();
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type InviteResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "exists" | "rate_limited" | "failed"; message: string };

/** auth.admin.inviteUserByEmail with `full_name` metadata (brief §6). */
export async function inviteUser({
  email,
  fullName,
  redirectTo,
}: {
  email: string;
  fullName: string | null;
  redirectTo: string;
}): Promise<InviteResult> {
  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : {},
    redirectTo,
  });
  if (error || !data.user) {
    const message = error?.message ?? "no user returned";
    const exists = error?.code === "email_exists" || /already (been )?registered/i.test(message);
    const rateLimited = error?.code === "over_email_send_rate_limit" || error?.status === 429;
    return { ok: false, reason: exists ? "exists" : rateLimited ? "rate_limited" : "failed", message };
  }
  return { ok: true, userId: data.user.id };
}

/** Deletes the auth user; profiles and user_roles cascade (brief §9.11). */
export async function deleteAuthUser(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  return error ? { ok: false, message: error.message } : { ok: true };
}
