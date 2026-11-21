import "server-only";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The site's public origin from `SITE_URL`, e.g. "https://gkprangkasbitung.org".
 * Links that leave the app (invite emails) are built from this configured
 * value, never from the request's Host / Origin / X-Forwarded-Host headers,
 * so a forged header can't point a link at another domain.
 *
 * Must be an origin only (no path, query, or fragment) and https, except
 * http for localhost. Returns null when missing or invalid; callers fail
 * closed instead of falling back to the request.
 */
export function siteOrigin(value: string | undefined = process.env.SITE_URL): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  const originOnly = (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  if (!secure || !originOnly || url.username || url.password) return null;
  return url.origin;
}

/**
 * redirectTo for auth.admin.inviteUserByEmail (brief §6). Both kinds of
 * invite land on /auth/set-password now (jemaat login switched from an
 * email code to email + password); the `portal=jemaat` hint lets
 * /auth/callback send a *failed* jemaat link back to /portal/masuk instead
 * of /login, since by then the account itself can't be loaded to tell.
 */
export function inviteRedirectUrl(origin: string, kind: "pengurus" | "jemaat" = "pengurus"): string {
  const hint = kind === "jemaat" ? "&portal=jemaat" : "";
  return `${origin}/auth/callback?next=/auth/set-password${hint}`;
}
