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

/** redirectTo for auth.admin.inviteUserByEmail (brief §6). */
export function inviteRedirectUrl(origin: string): string {
  return `${origin}/auth/callback?next=/auth/set-password`;
}
