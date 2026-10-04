import { describe, expect, it } from "vitest";

import { safeCallbackPath, safeNextPath } from "./safe-next";

describe("safeNextPath() (acceptance check 15)", () => {
  it("never redirects to another site", () => {
    expect(safeNextPath("https://example.com")).toBe("/admin");
    expect(safeNextPath("//example.com")).toBe("/admin");
    expect(safeNextPath("//evil.com")).toBe("/admin");
    expect(safeNextPath("/\\example.com")).toBe("/admin");
    expect(safeNextPath("javascript:alert(1)")).toBe("/admin");
  });

  it("keeps /admin paths", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/admin/warta")).toBe("/admin/warta");
    expect(safeNextPath("/admin/jemaat?q=budi")).toBe("/admin/jemaat?q=budi");
    expect(safeNextPath("/admin?error=forbidden")).toBe("/admin?error=forbidden");
  });

  it("falls back to /admin for anything else", () => {
    expect(safeNextPath(null)).toBe("/admin");
    expect(safeNextPath("")).toBe("/admin");
    expect(safeNextPath("/warta")).toBe("/admin");
    expect(safeNextPath("/administrator")).toBe("/admin");
    expect(safeNextPath("/admin/\nSet-Cookie:x")).toBe("/admin");
  });

  it("refuses backslashes, double slashes, and dot segments even inside the area", () => {
    expect(safeNextPath("/admin/\\evil.com")).toBe("/admin");
    expect(safeNextPath("/admin/%5Cevil.com")).toBe("/admin");
    expect(safeNextPath("/admin//evil.com")).toBe("/admin");
    expect(safeNextPath("/admin/../login")).toBe("/admin");
    expect(safeNextPath("/admin/%2e%2e/login")).toBe("/admin");
  });
});

describe("safeNextPath(…, 'jemaat')", () => {
  it("keeps only /jemaat paths", () => {
    expect(safeNextPath("/jemaat", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("/jemaat/profil?tab=1", "jemaat")).toBe("/jemaat/profil?tab=1");
  });

  it("never sends a Portal Jemaat login into /admin or off-site", () => {
    expect(safeNextPath("/admin", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("/admin/users", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("https://example.com", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("//example.com", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("/jemaatku", "jemaat")).toBe("/jemaat");
    expect(safeNextPath("/jemaat\\@evil.com", "jemaat")).toBe("/jemaat");
  });

  it("and the admin login never into /jemaat", () => {
    expect(safeNextPath("/jemaat", "admin")).toBe("/admin");
  });
});

describe("safeCallbackPath()", () => {
  it("allows the invite landing page and both portals", () => {
    expect(safeCallbackPath("/auth/set-password")).toBe("/auth/set-password");
    expect(safeCallbackPath("/jemaat")).toBe("/jemaat");
    expect(safeCallbackPath("/admin/warta")).toBe("/admin/warta");
  });

  it("falls back to /admin for anything else", () => {
    expect(safeCallbackPath("/auth/set-password/../x")).toBe("/admin");
    expect(safeCallbackPath("https://example.com")).toBe("/admin");
    expect(safeCallbackPath("//example.com")).toBe("/admin");
    expect(safeCallbackPath(null)).toBe("/admin");
  });
});
