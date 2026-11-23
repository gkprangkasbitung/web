import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * The service-role key bypasses RLS, so it is used only for what brief §3
 * and §18.7 allow: inviting and deleting auth users, creating Portal Jemaat
 * username accounts, and setting a temporary password on a reset. The client
 * itself is never exported; callers get these operations and nothing else.
 * Permission checks happen in the route handlers before any is called.
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

/**
 * auth.admin.inviteUserByEmail with `full_name` metadata (brief §6).
 * `portalJemaat` sets the `portal_jemaat` flag the invite template reads to
 * word the email for the Portal Jemaat (stage 11f); it grants nothing.
 */
export async function inviteUser({
  email,
  fullName,
  redirectTo,
  portalJemaat = false,
}: {
  email: string;
  fullName: string | null;
  redirectTo: string;
  portalJemaat?: boolean;
}): Promise<InviteResult> {
  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    data: { ...(fullName ? { full_name: fullName } : {}), ...(portalJemaat ? { portal_jemaat: true } : {}) },
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

export type CreateUsernameAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "taken" | "failed"; message: string };

/**
 * A Portal Jemaat username account (brief §18.7): auth email
 * `{username}@{PORTAL_LOGIN_DOMAIN}`, already confirmed, with the temporary
 * password. The app_metadata keys make 0039's trigger link the jemaat, set
 * the username and the jemaat's name, and turn wajib_ganti_password on, in
 * the same transaction: if any of that fails, no auth user is left behind.
 * "taken" means the email (so the username) already exists; any database
 * refusal (jemaat already linked, a reserved word) comes back as "failed",
 * because GoTrue doesn't pass the Postgres error on.
 */
export async function createUsernameAccount({
  email,
  username,
  jemaatId,
  password,
}: {
  email: string;
  username: string;
  jemaatId: string;
  password: string;
}): Promise<CreateUsernameAccountResult> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { portal_username: username, portal_jemaat_id: jemaatId },
  });
  if (error || !data.user) {
    // Never the password: only GoTrue's own code and message.
    const message = error?.message ?? "no user returned";
    const taken = error?.code === "email_exists" || /already (been )?registered/i.test(message);
    return { ok: false, reason: taken ? "taken" : "failed", message };
  }
  return { ok: true, userId: data.user.id };
}

/** Sets a new (temporary) password on a password reset (§18.7). */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await adminClient().auth.admin.updateUserById(userId, { password });
  return error ? { ok: false, message: error.message } : { ok: true };
}
