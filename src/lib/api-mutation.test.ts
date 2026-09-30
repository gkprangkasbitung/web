import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePermissionApi: vi.fn(), requireUserApi: vi.fn() }));

const { revalidatePath } = await import("next/cache");
const { logActivity } = await import("@/lib/activity-log");
const { requirePermissionApi, requireUserApi } = await import("@/lib/auth/session");
const { fail } = await import("@/lib/api");
const { ApiError, dbError, escapeLike, guardError, mutation, rpcError } = await import("./api-mutation");

const USER = { id: "u1", email: "editor@gkp.test", fullName: null, jemaatId: null, roles: [], permissions: [] };
const SUPABASE = { marker: "session-client" };
const ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

function signedIn() {
  vi.mocked(requirePermissionApi).mockResolvedValue({ ok: true, user: USER, supabase: SUPABASE } as never);
}

function request(body?: unknown, method = "POST") {
  return new Request("http://localhost/api/admin/label-jemaat", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

const createLabel = mutation({
  permission: ["warta", "update"],
  schema: z.object({ nama: z.string().trim().min(1, "Nama Label wajib diisi.") }),
  status: 201,
  run: vi.fn(async ({ input }) => ({
    data: { id: ID, nama: input.nama },
    log: { module: "label_jemaat" as const, activity: `Menambah label jemaat "${input.nama}"` },
    revalidate: ["/admin/label-jemaat", { path: "/admin/jemaat", type: "layout" as const }],
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("mutation", () => {
  it("answers 401 without a session and never runs", async () => {
    vi.mocked(requirePermissionApi).mockResolvedValue({ ok: false, response: fail("Sesi kamu sudah berakhir.", 401) });
    const response = await createLabel(request({ nama: "Pendeta" }), context());
    expect(response.status).toBe(401);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("answers 403 without the permission, checking warta:update", async () => {
    vi.mocked(requirePermissionApi).mockResolvedValue({ ok: false, response: fail("Tidak punya akses.", 403) });
    const response = await createLabel(request({ nama: "Pendeta" }), context());
    expect(response.status).toBe(403);
    expect(requirePermissionApi).toHaveBeenCalledWith("warta", "update");
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("checks the session before validating the body", async () => {
    vi.mocked(requirePermissionApi).mockResolvedValue({ ok: false, response: fail("Sesi kamu sudah berakhir.", 401) });
    const response = await createLabel(request("{not json"), context());
    expect(response.status).toBe(401);
  });

  it("answers 400 with the Zod message for a blank name", async () => {
    signedIn();
    const response = await createLabel(request({ nama: "   " }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Nama Label wajib diisi." });
  });

  it("answers 400 for a body that isn't JSON", async () => {
    signedIn();
    const response = await createLabel(request("{not json"), context());
    expect(response.status).toBe(400);
  });

  it("writes, logs exactly once, revalidates, and answers { data }", async () => {
    signedIn();
    const response = await createLabel(request({ nama: "  Pendeta  " }), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { id: ID, nama: "Pendeta" } });
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledWith({
      supabase: SUPABASE,
      user: USER,
      module: "label_jemaat",
      activity: 'Menambah label jemaat "Pendeta"',
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/label-jemaat");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jemaat", "layout");
  });

  it("answers 404 for a malformed id without running", async () => {
    signedIn();
    const run = vi.fn();
    const remove = mutation({ permission: ["warta", "update"], params: z.object({ id: z.uuid() }), notFound: "Label tidak ditemukan.", run });
    const response = await remove(request(undefined, "DELETE"), context({ id: "bukan-uuid" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Label tidak ditemukan." });
    expect(run).not.toHaveBeenCalled();
  });

  it("passes parsed params and skips the body when there is no schema", async () => {
    signedIn();
    const run = vi.fn(async ({ params }: { params: { id: string } }) => ({
      data: { id: params.id },
      log: { module: "tempat" as const, activity: 'Menghapus tempat "Gedung"' },
    }));
    const remove = mutation({ permission: ["warta", "update"], params: z.object({ id: z.uuid() }), run });
    const response = await remove(request(undefined, "DELETE"), context({ id: ID }));
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ params: { id: ID }, input: undefined }));
  });

  it("turns a thrown ApiError into { error } with its status, without logging", async () => {
    signedIn();
    const update = mutation({
      permission: ["warta", "update"],
      run: async () => {
        throw new ApiError(404, "Tempat tidak ditemukan.");
      },
    });
    const response = await update(request({}), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Tempat tidak ditemukan." });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("maps a unique violation to the friendly message, never the raw database text", async () => {
    signedIn();
    const create = mutation({
      permission: ["warta", "update"],
      run: async () => {
        throw dbError(
          { code: "23505", message: 'duplicate key value violates unique constraint "label_jemaat_nama_key"' },
          { unique: "Nama label sudah digunakan." },
        );
      },
    });
    const response = await create(request({}), context());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Nama label sudah digunakan." });
    expect(JSON.stringify(body)).not.toContain("duplicate key");
  });

  it("answers a generic 500 for unexpected errors and hides the details", async () => {
    signedIn();
    const create = mutation({
      permission: ["warta", "update"],
      run: async () => {
        throw dbError({ code: "XX000", message: "internal error: relation secret" });
      },
    });
    const response = await create(request({}), context());
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("mutation extras (stage 10)", () => {
  it('"signed-in" needs only a session, not a permission', async () => {
    vi.mocked(requireUserApi).mockResolvedValue({ ok: true, user: USER, supabase: SUPABASE } as never);
    const updateProfile = mutation({
      permission: "signed-in",
      schema: z.object({ fullName: z.string() }),
      run: async ({ input }) => ({ data: input, log: { module: "akun" as const, activity: "Mengubah nama lengkap" } }),
    });
    const response = await updateProfile(request({ fullName: "Uji" }, "PATCH"), context());
    expect(response.status).toBe(200);
    expect(requireUserApi).toHaveBeenCalledOnce();
    expect(requirePermissionApi).not.toHaveBeenCalled();
  });

  it('"signed-in" still answers 401 without a session', async () => {
    vi.mocked(requireUserApi).mockResolvedValue({ ok: false, response: fail("Sesi kamu sudah berakhir.", 401) });
    const updateProfile = mutation({
      permission: "signed-in",
      run: async () => ({ data: null, log: { module: "akun" as const, activity: "x" } }),
    });
    expect((await updateProfile(request(undefined, "PATCH"), context())).status).toBe(401);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("answers 207 with data and the follow-up error, and still logs the main write", async () => {
    signedIn();
    const invite = mutation({
      permission: ["users", "create"],
      status: 201,
      run: async () => ({
        data: { id: ID },
        log: { module: "users" as const, activity: 'Mengundang pengguna "a@test.local"' },
        partial: "Pengguna diundang, tapi gagal set role/jemaat: Role tidak ditemukan.",
      }),
    });
    const response = await invite(request({}), context());
    expect(response.status).toBe(207);
    expect(await response.json()).toEqual({
      data: { id: ID },
      error: "Pengguna diundang, tapi gagal set role/jemaat: Role tidak ditemukan.",
    });
    expect(logActivity).toHaveBeenCalledOnce();
  });
});

describe("access guard messages", () => {
  it("forwards the guards' own 42501 text and hides any other 42501", () => {
    const guard = { code: "42501", message: "Harus ada minimal satu super_admin." };
    const raw = { code: "42501", message: 'new row violates row-level security policy for table "roles"' };
    expect(rpcError(guard)).toMatchObject({ status: 403, message: guard.message });
    expect(guardError(guard)).toMatchObject({ status: 403, message: guard.message });
    expect(rpcError(raw)).toMatchObject({ status: 403, message: "Kamu tidak punya akses untuk tindakan ini." });
    expect(guardError(raw)).toMatchObject({ status: 403, message: "Kamu tidak punya akses untuk tindakan ini." });
  });

  it("guardError falls back to dbError's mapping", () => {
    expect(guardError({ code: "23505", message: "duplicate key" }, { unique: "Nama role sudah digunakan." })).toMatchObject({
      status: 400,
      message: "Nama role sudah digunakan.",
    });
  });
});

describe("dbError", () => {
  it.each([
    ["23505", 400, "Nama label sudah digunakan."],
    ["23503", 400, "Data ini masih dipakai oleh data lain."],
    ["42501", 403, "Kamu tidak punya akses untuk tindakan ini."],
    ["P0002", 404, "Label tidak ditemukan."],
    ["PGRST116", 404, "Label tidak ditemukan."],
    ["22P02", 404, "Label tidak ditemukan."],
    ["23514", 400, "Data yang dikirim tidak valid."],
  ])("maps %s to %i", (code, status, message) => {
    const error = dbError(
      { code, message: "raw" },
      { unique: "Nama label sudah digunakan.", notFound: "Label tidak ditemukan." },
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message });
  });

  it("uses a generic message when no specific one is given", () => {
    expect(dbError({ code: "23505", message: "raw" }).message).toBe("Data dengan nilai ini sudah ada.");
  });

  it("leaves unknown codes as plain errors, for the 500 path", () => {
    expect(dbError({ code: "XX000", message: "raw" })).not.toBeInstanceOf(ApiError);
  });
});

describe("escapeLike", () => {
  it("escapes ilike wildcards", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});
