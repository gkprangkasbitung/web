import { describe, expect, it } from "vitest";

import { homePath, isJemaat, isStaff } from "./portal";

describe("portal access (stage 11f)", () => {
  it("staff = at least one role, jemaat = a linked jemaat", () => {
    expect(isStaff({ roles: [{ id: "r" }] })).toBe(true);
    expect(isStaff({ roles: [] })).toBe(false);
    expect(isJemaat({ jemaatId: "j" })).toBe(true);
    expect(isJemaat({ jemaatId: null })).toBe(false);
  });

  it("sends staff to /admin first, a jemaat-only account to /jemaat, and anyone else nowhere", () => {
    expect(homePath({ roles: ["r"], jemaatId: "j" })).toBe("/admin");
    expect(homePath({ roles: ["r"], jemaatId: null })).toBe("/admin");
    expect(homePath({ roles: [], jemaatId: "j" })).toBe("/jemaat");
    expect(homePath({ roles: [], jemaatId: null })).toBeNull();
  });
});
