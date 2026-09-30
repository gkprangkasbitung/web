import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { fail } from "@/lib/api";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

import { can, permissionKey, type Action, type PermissionKey, type Resource } from "./permissions";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  jemaatId: string | null;
  roles: { id: string; name: string }[];
  permissions: PermissionKey[];
};

/**
 * The signed-in user with their profile, roles, and the union of their
 * permissions, or null. Verifies the session with Supabase Auth (getUser),
 * not just the cookie. Cached per request.
 *
 * Fails closed: if roles/permissions can't be loaded the user has none.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const [profileResult, accessResult] = await Promise.all([
    supabase.from("profiles").select("email, full_name, jemaat_id").eq("id", user.id).maybeSingle(),
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
    roles: [...roles].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    permissions: [...permissions].sort(),
  };
});

export function displayName(user: Pick<AuthUser, "fullName" | "email">): string {
  return user.fullName ?? user.email;
}

/** For pages open to every signed-in user (Dashboard, Profil Saya). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects to /admin?error=forbidden when the permission is missing. */
export async function requirePermission(resource: Resource, action: Action): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, resource, action)) redirect("/admin?error=forbidden");
  return user;
}

export type ApiAuth =
  | { ok: true; user: AuthUser; supabase: ServerSupabase }
  | { ok: false; response: ReturnType<typeof fail> };

const SESSION_EXPIRED = "Sesi kamu sudah berakhir. Silakan masuk kembali.";

/** For route handlers open to every signed-in user (Profil Saya): 401 without a session. */
export async function requireUserApi(): Promise<ApiAuth> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: fail(SESSION_EXPIRED, 401) };
  return { ok: true, user, supabase: await createClient() };
}

/**
 * For route handlers: 401 without a session, 403 without the permission.
 * Usage: `const auth = await requirePermissionApi("warta", "update"); if (!auth.ok) return auth.response;`
 */
export async function requirePermissionApi(resource: Resource, action: Action): Promise<ApiAuth> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: fail(SESSION_EXPIRED, 401) };
  if (!can(user, resource, action)) {
    return { ok: false, response: fail("Kamu tidak punya akses untuk tindakan ini.", 403) };
  }
  return { ok: true, user, supabase: await createClient() };
}
