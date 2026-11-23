/**
 * Which portal an account may open (stage 11f). The only definitions of
 * "staff" and "jemaat" in the app; every page, route, and action asks these.
 * Which login page someone used never grants anything: access always comes
 * from the account's roles (user_roles) and profiles.jemaat_id.
 *
 * Safe to import on the client (no "server-only"); the server is the one
 * that loads the roles and jemaat link it is given.
 */

export type PortalArea = "admin" | "jemaat";

export type PortalAccount = { roles: readonly unknown[]; jemaatId: string | null };

/** Pengurus: at least one role. Opens /admin. */
export function isStaff(account: Pick<PortalAccount, "roles">): boolean {
  return account.roles.length > 0;
}

/** Jemaat: linked to a jemaat record. Opens /jemaat. */
export function isJemaat(account: Pick<PortalAccount, "jemaatId">): boolean {
  return account.jemaatId !== null;
}

/** Where a signed-in account belongs: /admin first, then /jemaat, else nowhere. */
export function homePath(account: PortalAccount): "/admin" | "/jemaat" | null {
  if (isStaff(account)) return "/admin";
  if (isJemaat(account)) return "/jemaat";
  return null;
}

export const LOGIN_PATH: Record<PortalArea, string> = { admin: "/login", jemaat: "/portal/masuk" };

/** Where a jemaat with a temporary password is held until they change it (brief §18.7). */
export const GANTI_PASSWORD_PATH = "/jemaat/ganti-password";

/**
 * How an account is named to its owner and in the portal: the username for
 * a username account (whose auth email is internal and never shown to
 * jemaat, §18.7), else the email.
 */
export function accountLabel(account: { username: string | null; email: string }): string {
  return account.username ?? account.email;
}

/** Where a non-staff account opening /admin, or a non-jemaat opening /jemaat, is sent. */
export const NO_ACCESS_PATH = "/portal?error=akses";

/** Activity log wording per portal (module `auth`). */
export const PORTAL_LABEL: Record<PortalArea, string> = { admin: "Portal Pengurus", jemaat: "Portal Jemaat" };
