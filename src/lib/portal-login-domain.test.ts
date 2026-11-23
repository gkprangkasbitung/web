import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parsePortalLoginDomain, portalAuthEmail, portalLoginDomain } = await import("./portal-login-domain");

describe("PORTAL_LOGIN_DOMAIN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a bare lowercase domain", () => {
    expect(parsePortalLoginDomain("masuk.gkprangkasbitung.org")).toBe("masuk.gkprangkasbitung.org");
    expect(parsePortalLoginDomain(" login.gkp-rangkas.or.id ")).toBe("login.gkp-rangkas.or.id");
    expect(parsePortalLoginDomain("masuk.gkp.test")).toBe("masuk.gkp.test");
  });

  it("refuses anything else", () => {
    for (const bad of [
      undefined,
      "",
      "localhost",
      "https://masuk.gkp.org",
      "masuk.gkp.org:443",
      "masuk.gkp.org/",
      "a@masuk.gkp.org",
      "Masuk.gkp.org",
      "masuk..gkp.org",
      "-masuk.gkp.org",
      "masuk.gkp.org.",
      "127.0.0.1",
      "mas uk.gkp.org",
    ]) {
      expect(parsePortalLoginDomain(bad)).toBeNull();
    }
  });

  it("fails closed when unset or invalid, and builds the internal email", () => {
    vi.stubEnv("PORTAL_LOGIN_DOMAIN", "");
    expect(() => portalLoginDomain()).toThrow(/PORTAL_LOGIN_DOMAIN/);
    vi.stubEnv("PORTAL_LOGIN_DOMAIN", "https://x.org");
    expect(() => portalAuthEmail("sri")).toThrow(/PORTAL_LOGIN_DOMAIN/);
    vi.stubEnv("PORTAL_LOGIN_DOMAIN", "masuk.gkp.test");
    expect(portalAuthEmail("yohanes.santoso")).toBe("yohanes.santoso@masuk.gkp.test");
  });
});
