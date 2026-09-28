import { describe, expect, it } from "vitest";

import { safeCallbackPath, safeNextPath } from "./safe-next";

describe("safeNextPath() (acceptance check 15)", () => {
  it("never redirects to another site", () => {
    expect(safeNextPath("https://example.com")).toBe("/admin");
    expect(safeNextPath("//example.com")).toBe("/admin");
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
});

describe("safeCallbackPath()", () => {
  it("also allows the invite landing page", () => {
    expect(safeCallbackPath("/auth/set-password")).toBe("/auth/set-password");
    expect(safeCallbackPath("/auth/set-password/../x")).toBe("/admin");
    expect(safeCallbackPath("https://example.com")).toBe("/admin");
    expect(safeCallbackPath(null)).toBe("/admin");
  });
});
