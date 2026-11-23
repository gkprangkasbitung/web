import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { fail } from "@/lib/api";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

import { can, permissionKey, type Action, type PermissionKey, type Resource } from "./permissions";
import { accountLabel, GANTI_PASSWORD_PATH, isJemaat, isStaff, LOGIN_PATH, NO_ACCESS_PATH } from "./portal";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  jemaatId: string | null;
  /** Portal Jemaat username (stage 14d); null for an email account. */
  username: string | null;
  /** A temporary password is in use: /jemaat forces a change first (§18.7). */
  wajibGantiPassword: boolean;
  roles: { id: string; name: string }[];
  permissions: PermissionKey[];
};

/**
 * Loads the user behind `supabase`'s session: verifies it with Supabase Auth
 * (getUser), not just the cookie, then the profile, roles, and the union of
 * their permissions. Fails closed: if roles/permissions can't be loaded the
 * user has none. Login actions call this with the client that just signed
 * in; everything else uses the per-request getAuthenticatedUser().
 */
export async function loadAuthUser(supabase: ServerSupabase): Promise<AuthUser | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const [profileResult, accessResult] = await Promise.all([
    supabase.from("profiles").select("email, full_name, jemaat_id, username, wajib_ganti_password").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_my_access"),
  ]);
  if (profileResult.error) console.error("[auth] Failed to load profile:", profileResult.error.message);
  if (accessResult.error) console.error("[auth] Failed to load roles and permissions:", accessResult.error.message);

  const roles = new Map<string, string>();
  const permissions = new Set<PermissionKey>();
  for (const row of accessResult.data ?? []) {
    roles.set(row.role_id, row.role_name);
    if (row.resource && row.action) permissions.add(permissionKey(row.resource, row.action));
  }

  const profile = profileResult.data;
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name?.trim() || null,
    jemaatId: profile?.jemaat_id ?? null,
    username: profile?.username ?? null,
    // Fails closed like roles: an unreadable profile counts as "must change".
    wajibGantiPassword: profile ? profile.wajib_ganti_password : true,
    roles: [...roles].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    permissions: [...permissions].sort(),
  };
}

/** The signed-in user (see loadAuthUser), or null. Cached per request. */
export const getAuthenticatedUser = cache(async (): Promise<AuthUser | null> => loadAuthUser(await createClient()));

/** Full name, else the username (username accounts), else the email. */
export function displayName(user: Pick<AuthUser, "fullName" | "email" | "username">): string {
  return user.fullName ?? accountLabel(user);
}

/** Any signed-in account, whatever its access. Only for /auth/set-password (the invite landing page). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect(LOGIN_PATH.admin);
  return user;
}

/**
 * For every /admin page, Dashboard and Profil Saya included (stage 11f):
 * staff only. Without a session → /login; signed in without a role →
 * /portal?error=akses.
 */
export async function requireStaff(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isStaff(user)) redirect(NO_ACCESS_PATH);
  return user;
}

/**
 * For /jemaat pages and actions: accounts linked to a jemaat only, and with a
 * temporary password, only after it was changed (§18.7): until then
 * everything goes to /jemaat/ganti-password.
 */
export async function requireJemaat(): Promise<AuthUser> {
  const user = await requireJemaatAccount();
  if (user.wajibGantiPassword) redirect(GANTI_PASSWORD_PATH);
  return user;
}

/** Like requireJemaat, without the temporary-password gate. Only for /jemaat/ganti-password itself. */
export async function requireJemaatAccount(): Promise<AuthUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect(LOGIN_PATH.jemaat);
  if (!isJemaat(user)) redirect(NO_ACCESS_PATH);
  return user;
}

/** For pages: staff only, then redirects to /admin?error=forbidden when the permission is missing. */
export async function requirePermission(resource: Resource, action: Action): Promise<AuthUser> {
  const user = await requireStaff();
  if (!can(user, resource, action)) redirect("/admin?error=forbidden");
  return user;
}

export type ApiAuth =
  | { ok: true; user: AuthUser; supabase: ServerSupabase }
  | { ok: false; response: ReturnType<typeof fail> };

const SESSION_EXPIRED = "Sesi kamu sudah berakhir. Silakan masuk kembali.";
const NOT_STAFF = "Akun ini tidak memiliki akses pengurus.";

/** For route handlers open to every staff account (Profil Saya): 401 without a session, 403 without a role. */
export async function requireStaffApi(): Promise<ApiAuth> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: fail(SESSION_EXPIRED, 401) };
  if (!isStaff(user)) return { ok: false, response: fail(NOT_STAFF, 403) };
  return { ok: true, user, supabase: await createClient() };
}

/**
 * For route handlers: 401 without a session, 403 without a role or without
 * the permission.
 * Usage: `const auth = await requirePermissionApi("warta", "update"); if (!auth.ok) return auth.response;`
 */
export async function requirePermissionApi(resource: Resource, action: Action): Promise<ApiAuth> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: fail(SESSION_EXPIRED, 401) };
  if (!isStaff(user)) return { ok: false, response: fail(NOT_STAFF, 403) };
  if (!can(user, resource, action)) {
    return { ok: false, response: fail("Kamu tidak punya akses untuk tindakan ini.", 403) };
  }
  return { ok: true, user, supabase: await createClient() };
}
