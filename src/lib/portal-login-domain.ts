import "server-only";

/**
 * PORTAL_LOGIN_DOMAIN (brief §18.7): the domain of the internal auth email of
 * username accounts, `{username}@{domain}`. A subdomain the church controls,
 * with no mailbox, e.g. "masuk.gkprangkasbitung.org". Server-only, never
 * shown to jemaat.
 *
 * A bare lowercase hostname: at least two labels, each 1–63 of a–z0–9 and
 * inner hyphens, no scheme, port, path, or "@". Checked at server start
 * (src/instrumentation.ts) and again on every use.
 */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function parsePortalLoginDomain(value: string | undefined): string | null {
  if (!value) return null;
  const domain = value.trim();
  if (domain.length > 200 || domain !== domain.toLowerCase()) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  if (/^[0-9]+$/.test(labels[labels.length - 1]!)) return null;
  return domain;
}

const INVALID =
  "PORTAL_LOGIN_DOMAIN must be set to a bare lowercase domain without a mailbox (e.g. masuk.gkprangkasbitung.org).";

/** The configured domain; throws when missing or invalid (fail closed). */
export function portalLoginDomain(): string {
  const domain = parsePortalLoginDomain(process.env.PORTAL_LOGIN_DOMAIN);
  if (!domain) throw new Error(INVALID);
  return domain;
}

/** The internal auth email of a username account. */
export function portalAuthEmail(username: string): string {
  return `${username}@${portalLoginDomain()}`;
}
