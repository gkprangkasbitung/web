import type { PortalArea } from "./portal";

const AREA_ROOT: Record<PortalArea, "/admin" | "/jemaat"> = { admin: "/admin", jemaat: "/jemaat" };

// Control characters could smuggle extra headers or confuse URL parsing.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Backslashes (raw or encoded) and `//` can turn a path into another host in
// some browsers; `..` segments could leave the area. None is ever needed.
const SUSPICIOUS = /\\|%5c|\/\/|(^|\/)\.\.?(\/|$|\?|#)|%2e/i;

function isAreaPath(value: string, root: string): boolean {
  return value === root || value.startsWith(`${root}/`) || value.startsWith(`${root}?`) || value.startsWith(`${root}#`);
}

/**
 * Where to go after login (brief §6, stage 11f): `next` only when it is a
 * path inside the portal's own area (/admin for the admin login, /jemaat for
 * the Portal Jemaat), otherwise the area's root. Rejects absolute and
 * protocol-relative URLs, schemes, backslashes, and dot segments, so there
 * is no open redirect and no hop into the other portal.
 */
export function safeNextPath(next: string | null | undefined, area: PortalArea = "admin"): string {
  const root = AREA_ROOT[area];
  if (!next || CONTROL_CHARS.test(next) || SUSPICIOUS.test(next)) return root;
  return isAreaPath(next, root) ? next : root;
}

/**
 * For /auth/callback: the invite landing page (admin invites), or a path
 * inside either portal (the "Akun Jemaat" invite lands on /jemaat). Anything
 * else falls back to /admin.
 */
export function safeCallbackPath(next: string | null | undefined): string {
  if (next === "/auth/set-password") return next;
  const jemaat = safeNextPath(next, "jemaat");
  if (jemaat !== "/jemaat" || next === "/jemaat") return jemaat;
  return safeNextPath(next, "admin");
}
