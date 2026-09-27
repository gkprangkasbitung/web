import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

const { logActivity } = await import("./activity-log");

const USER = { id: "u1", email: "editor@gkp.test" };

function supabaseWith(insert: () => Promise<{ error: { message: string } | null }>) {
  const spy = vi.fn(insert);
  return { client: { from: () => ({ insert: spy }) } as never, insert: spy };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("logActivity", () => {
  it("inserts one row with the module, sentence, email, and first forwarded IP", async () => {
    const { client, insert } = supabaseWith(async () => ({ error: null }));
    await logActivity({ supabase: client, user: USER, module: "tempat", activity: 'Menambah tempat "Gedung"' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      user_email: "editor@gkp.test",
      module: "tempat",
      activity: 'Menambah tempat "Gedung"',
      ip_address: "203.0.113.7",
    });
  });

  it("resolves when the insert returns an error", async () => {
    const { client } = supabaseWith(async () => ({ error: { message: "rls" } }));
    await expect(
      logActivity({ supabase: client, user: USER, module: "tempat", activity: "x" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("resolves when the insert throws", async () => {
    const { client } = supabaseWith(async () => {
      throw new Error("network");
    });
    await expect(
      logActivity({ supabase: client, user: USER, module: "tempat", activity: "x" }),
    ).resolves.toBeUndefined();
  });
});
