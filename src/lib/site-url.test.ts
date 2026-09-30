import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { inviteRedirectUrl, siteOrigin } = await import("./site-url");

describe("siteOrigin", () => {
  it.each([
    ["https://gkp.example.org", "https://gkp.example.org"],
    ["https://gkp.example.org/", "https://gkp.example.org"],
    ["  https://GKP.example.org  ", "https://gkp.example.org"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ])("accepts %j", (value, expected) => {
    expect(siteOrigin(value)).toBe(expected);
  });

  it.each([
    [undefined],
    [""],
    ["gkp.example.org"],
    ["http://gkp.example.org"],
    ["https://gkp.example.org/admin"],
    ["https://gkp.example.org?x=1"],
    ["https://gkp.example.org#x"],
    ["https://user:pass@gkp.example.org"],
    ["javascript:alert(1)"],
  ])("rejects %j (fails closed)", (value) => {
    expect(siteOrigin(value)).toBeNull();
  });
});

describe("inviteRedirectUrl", () => {
  it("is built from the configured origin only", () => {
    expect(inviteRedirectUrl("https://gkp.example.org")).toBe(
      "https://gkp.example.org/auth/callback?next=/auth/set-password",
    );
  });
});
