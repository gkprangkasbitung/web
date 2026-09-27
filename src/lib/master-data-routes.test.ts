import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePermissionApi: vi.fn() }));

const { requirePermissionApi } = await import("@/lib/auth/session");
const { fail } = await import("@/lib/api");
const { LABEL_JEMAAT, TEMPAT, WILAYAH } = await import("@/lib/master-data");
const { masterDataCollectionRoutes, masterDataItemRoutes } = await import("./master-data-routes");

const ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const context = { params: Promise.resolve({ id: ID }) };
const request = (method: string) =>
  new Request("http://localhost/api", { method, body: method === "DELETE" ? undefined : JSON.stringify({ nama: "x" }) });

beforeEach(() => {
  vi.mocked(requirePermissionApi).mockReset();
  vi.mocked(requirePermissionApi).mockResolvedValue({ ok: false, response: fail("Kamu tidak punya akses untuk tindakan ini.", 403) });
});

// RLS would also refuse a viewer's write, so the integration tests can't tell
// whether the app checked first. This pins the app-level check (CLAUDE.md).
describe.each([TEMPAT, WILAYAH, LABEL_JEMAAT])("$module routes", (config) => {
  it("GET needs warta:read", async () => {
    await masterDataCollectionRoutes(config).GET();
    expect(requirePermissionApi).toHaveBeenCalledWith("warta", "read");
  });

  it.each(["POST", "PATCH", "DELETE"] as const)("%s needs warta:update", async (method) => {
    const handler =
      method === "POST" ? masterDataCollectionRoutes(config).POST : masterDataItemRoutes(config)[method];
    const response = await handler(request(method), context);
    expect(response.status).toBe(403);
    expect(requirePermissionApi).toHaveBeenCalledWith("warta", "update");
  });
});
