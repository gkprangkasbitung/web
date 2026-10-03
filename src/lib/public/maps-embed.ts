import "server-only";

/**
 * Turns Profil Gereja's Google Maps URL (brief §14.1: a google.com/maps or
 * maps.app.goo.gl link) into a keyless embed `src`, so the public pages can
 * show the map itself instead of only a link.
 *
 * A share link (maps.app.goo.gl) can't be embedded directly, so the server
 * follows its one redirect to the full google.com/maps URL and reads the
 * place from that. When nothing usable comes out, the embed searches for the
 * alamat instead; with neither, there is no map.
 */

const GOOGLE_MAPS_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com"]);
const SHORT_LINK_HOST = "maps.app.goo.gl";
const RESOLVE_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Short link → resolved full URL (or null), per server instance. Share links never change target. */
const resolved = new Map<string, { url: string | null; at: number }>();

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isGoogleMapsUrl(url: URL): boolean {
  return url.protocol === "https:" && GOOGLE_MAPS_HOSTS.has(url.hostname) && url.pathname.startsWith("/maps");
}

/**
 * What to search for in the embed, from a full google.com/maps URL: the
 * place name of a `/place/<name>/` link (with its pin's coordinates as the
 * center), else the pin's or the view's coordinates, else a `q`/`query`
 * parameter. Exported for tests.
 */
export function embedQueryFromMapsUrl(value: string): { q: string; ll: string | null } | null {
  const url = parseUrl(value);
  if (!url || !isGoogleMapsUrl(url)) return null;

  // `!3d<lat>!4d<lng>` is the place's own pin; `@lat,lng` is only where the view was centered.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.pathname + url.search);
  const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname);
  const coords = pin ? `${pin[1]},${pin[2]}` : view ? `${view[1]},${view[2]}` : null;

  const place = /\/maps\/place\/([^/]+)/.exec(url.pathname);
  if (place) {
    const name = decodeURIComponent(place[1]!.replace(/\+/g, " ")).trim();
    if (name) return { q: name, ll: coords };
  }
  if (coords) return { q: coords, ll: null };

  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  return q?.trim() ? { q: q.trim(), ll: null } : null;
}

async function resolveShortLink(value: string): Promise<string | null> {
  const cached = resolved.get(value);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.url;

  let url: string | null = null;
  try {
    const response = await fetch(value, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    url = location && isGoogleMapsUrl(new URL(location, value)) ? new URL(location, value).toString() : null;
  } catch (error) {
    console.error("[maps-embed] Failed to resolve the Google Maps share link:", error);
  }
  resolved.set(value, { url, at: Date.now() });
  return url;
}

function embedSrc(q: string, ll: string | null): string {
  const params = new URLSearchParams({ q, z: "16", output: "embed" });
  if (ll) params.set("ll", ll);
  return `https://www.google.com/maps?${params.toString()}`;
}

export async function mapsEmbedSrc(mapsUrl: string | null, alamat: string | null): Promise<string | null> {
  if (mapsUrl) {
    const url = parseUrl(mapsUrl);
    const full = url?.protocol === "https:" && url.hostname === SHORT_LINK_HOST ? await resolveShortLink(mapsUrl) : mapsUrl;
    const query = full ? embedQueryFromMapsUrl(full) : null;
    if (query) return embedSrc(query.q, query.ll);
  }
  return alamat?.trim() ? embedSrc(alamat.trim().replace(/\s+/g, " "), null) : null;
}
