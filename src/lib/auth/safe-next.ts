const DEFAULT_PATH = "/admin";

// Control characters could smuggle extra headers or confuse URL parsing.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isAdminPath(value: string): boolean {
  return (
    value === "/admin" ||
    value.startsWith("/admin/") ||
    value.startsWith("/admin?") ||
    value.startsWith("/admin#")
  );
}

/**
 * Where to go after login (brief §6): `next` only when it is an /admin path,
 * otherwise /admin. Rejects absolute and protocol-relative URLs, so there is
 * no open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || CONTROL_CHARS.test(next)) return DEFAULT_PATH;
  return isAdminPath(next) ? next : DEFAULT_PATH;
}

/** Like safeNextPath, but also allows the invite landing page. */
export function safeCallbackPath(next: string | null | undefined): string {
  if (next === "/auth/set-password") return next;
  return safeNextPath(next);
}
