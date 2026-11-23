/**
 * Runs once when a server instance starts, before it serves requests. Config
 * the app can't work without is checked here, so a bad deploy fails at start
 * instead of at someone's first login.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { portalLoginDomain } = await import("@/lib/portal-login-domain");
  // Throws with the variable's name when PORTAL_LOGIN_DOMAIN is missing or invalid (brief §18.7).
  portalLoginDomain();
}
