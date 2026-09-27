/**
 * Peribadahan route handlers (brief §9.5) against the local stack: auth,
 * "Tambah Jadwal"'s sort_order counting across categories, the category
 * layout nulling out disallowed fields on save, the SMKA grid's atomic
 * upsert through HTTP, and one activity log row per mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";

import { actAs, call, signIn, type Session } from "./harness";

const collection = await import("@/app/api/admin/peribadahan/route");
const item = await import("@/app/api/admin/peribadahan/[id]/route");

const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
// activity_logs is append-only, so earlier runs' rows stay: pick dates unique
// to this run (far in the future, spread from the current time) so an exact
// "Menambah/Mengubah/Menghapus jadwal ... tanggal ..." sentence can't already
// exist from a previous run.
const RUN_BASE = addDays("2030-01-01", Math.floor(Date.now() / 1000) % 100_000);
const TANGGAL = RUN_BASE;
const SORT_ORDER_TANGGAL = addDays(RUN_BASE, 1);

const SMKA_GROUPS = ["batita", "balita", "kecil", "tanggung", "besar", "tunas_remaja", "guru_sekolah_minggu", "orang_tua"];

let editor: Session;
let viewer: Session;
let superadmin: Session;
const createdItems: string[] = [];

/** Activity rows written by this run with exactly this sentence (read as super_admin, who has activity_log:read). */
async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
});

afterAll(async () => {
  for (const id of createdItems) await superadmin.supabase.from("peribadahan_items").delete().eq("id", id);
});

describe("auth", () => {
  it("answers 401 to every request without a session", async () => {
    actAs(null);
    expect((await call(collection.POST, { method: "POST", body: { categoryKey: "umum", tanggal: TANGGAL } })).status).toBe(401);
    expect((await call(item.PATCH, { method: "PATCH", body: {}, params: { id: MISSING_ID } })).status).toBe(401);
    expect((await call(item.DELETE, { method: "DELETE", params: { id: MISSING_ID } })).status).toBe(401);
  });

  it("lets the viewer read (RLS) but answers 403 to add, edit, and delete, with nothing written", async () => {
    actAs(editor);
    const seeded = await call(collection.POST, { method: "POST", body: { categoryKey: "umum", tanggal: TANGGAL } });
    expect(seeded.status).toBe(201);
    const id = (seeded.body.data as unknown as { id: string }).id;
    createdItems.push(id);

    actAs(viewer);
    const { data } = await viewer.supabase.from("peribadahan_items").select("id").eq("id", id).maybeSingle();
    expect(data?.id).toBe(id);

    for (const response of [
      await call(collection.POST, { method: "POST", body: { categoryKey: "umum", tanggal: TANGGAL } }),
      await call(item.PATCH, { method: "PATCH", body: { tema: "x" }, params: { id } }),
      await call(item.DELETE, { method: "DELETE", params: { id } }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
    }

    const { data: unchanged } = await superadmin.supabase.from("peribadahan_items").select("tema").eq("id", id).single();
    expect(unchanged?.tema).toBeNull();
  });
});

describe("Tambah Jadwal", () => {
  it("rejects an unknown Jenis", async () => {
    actAs(editor);
    const response = await call(collection.POST, { method: "POST", body: { categoryKey: "bukan-kategori", tanggal: TANGGAL } });
    expect(response.status).toBe(400);
  });

  it("sort_order is the count of rows already on that date, across categories, and logs one row each", async () => {
    actAs(editor);
    const tanggal = SORT_ORDER_TANGGAL;

    const first = await call(collection.POST, { method: "POST", body: { categoryKey: "umum", tanggal } });
    expect(first.status).toBe(201);
    const firstId = (first.body.data as unknown as { id: string }).id;
    createdItems.push(firstId);

    const second = await call(collection.POST, { method: "POST", body: { categoryKey: "pa", tanggal, jam: "10:30" } });
    expect(second.status).toBe(201);
    const secondId = (second.body.data as unknown as { id: string }).id;
    createdItems.push(secondId);

    const { data: rows } = await superadmin.supabase
      .from("peribadahan_items")
      .select("id, sort_order, jam")
      .in("id", [firstId, secondId])
      .order("sort_order");
    expect(rows).toEqual([
      { id: firstId, sort_order: 0, jam: null },
      { id: secondId, sort_order: 1, jam: "10:30:00" },
    ]);

    expect(await logRows(`Menambah jadwal Kebaktian Minggu tanggal ${tanggal}`)).toHaveLength(1);
    expect(await logRows(`Menambah jadwal Pemahaman Alkitab tanggal ${tanggal}`)).toHaveLength(1);
  });
});

describe("Mengubah jadwal", () => {
  it("only stores fields inside the row's category layout, nulling the rest", async () => {
    actAs(editor);
    // Kebaktian Pria: has Tempat/DPA/Tema but no Wilayah, and only Laki-laki attendance.
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "pria", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdItems.push(id);

    const edit = await call(item.PATCH, {
      method: "PATCH",
      body: {
        jam: "08:00",
        dpa: "Uji DPA",
        tema: "Uji Tema",
        wilayahId: null,
        kehadiranLakiLaki: 5,
        kehadiranPerempuan: 7,
        kehadiranAnak: 3,
      },
      params: { id },
    });
    expect(edit.status).toBe(200);

    const { data: row } = await superadmin.supabase
      .from("peribadahan_items")
      .select("kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, wilayah_id, tema, dpa")
      .eq("id", id)
      .single();
    expect(row).toEqual({
      kehadiran_laki_laki: 5,
      kehadiran_perempuan: null,
      kehadiran_anak: null,
      wilayah_id: null,
      tema: "Uji Tema",
      dpa: "Uji DPA",
    });

    expect(await logRows(`Mengubah jadwal Kebaktian Pria tanggal ${TANGGAL}`)).toHaveLength(1);
  });

  it("rejects a negative attendance count with a plain message", async () => {
    actAs(editor);
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "umum", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdItems.push(id);

    const response = await call(item.PATCH, { method: "PATCH", body: { kehadiranLakiLaki: -1 }, params: { id } });
    expect(response.status).toBe(400);
  });

  it("answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(item.PATCH, { method: "PATCH", body: {}, params: { id } })).status).toBe(404);
      expect((await call(item.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
    }
  });
});

describe("Kebaktian SMKA", () => {
  it("saves all 8 groups atomically through the RPC", async () => {
    actAs(editor);
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "smka", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdItems.push(id);

    const smkaKelompok = SMKA_GROUPS.map((kelompok) => ({ kelompok, pfId: null, lakiLaki: 1, perempuan: 2 }));
    const edit = await call(item.PATCH, { method: "PATCH", body: { smkaKelompok }, params: { id } });
    expect(edit.status).toBe(200);

    const { data: rows } = await superadmin.supabase.from("peribadahan_smka_kelompok").select("kelompok").eq("item_id", id);
    expect(rows).toHaveLength(8);
  });

  it("rejects an incomplete grid, leaving nothing written", async () => {
    actAs(editor);
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "smka", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdItems.push(id);

    const response = await call(item.PATCH, {
      method: "PATCH",
      body: { smkaKelompok: [{ kelompok: "batita", pfId: null, lakiLaki: 1, perempuan: 1 }] },
      params: { id },
    });
    expect(response.status).toBe(400);

    const { data: rows } = await superadmin.supabase.from("peribadahan_smka_kelompok").select("kelompok").eq("item_id", id);
    expect(rows).toHaveLength(0);
  });
});

describe("Hapus", () => {
  it("deletes the row, cascades its SMKA groups, and logs one row", async () => {
    actAs(editor);
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "smka", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    const smkaKelompok = SMKA_GROUPS.map((kelompok) => ({ kelompok, pfId: null, lakiLaki: 1, perempuan: 2 }));
    await call(item.PATCH, { method: "PATCH", body: { smkaKelompok }, params: { id } });

    const remove = await call(item.DELETE, { method: "DELETE", params: { id } });
    expect(remove.status).toBe(200);

    const { data } = await superadmin.supabase.from("peribadahan_items").select("id").eq("id", id).maybeSingle();
    expect(data).toBeNull();
    const { data: kelompok } = await superadmin.supabase.from("peribadahan_smka_kelompok").select("id").eq("item_id", id);
    expect(kelompok).toHaveLength(0);

    expect(await logRows(`Menghapus jadwal Kebaktian SMKA tanggal ${TANGGAL}`)).toHaveLength(1);
  });
});

describe("Pencarian ('Cari tema/DPA/catatan...')", () => {
  it("escapes % and _ so they match literally, and tolerates commas/parens without erroring or broadening the match", async () => {
    actAs(editor);
    const { loadPeribadahanOverview } = await import("@/lib/peribadahan-routes");
    const marker = `uji-cari-${Date.now().toString(36)}`;

    // Kebaktian Rumah Tangga has a Tema field (Kebaktian Minggu doesn't).
    const add = await call(collection.POST, { method: "POST", body: { categoryKey: "krt", tanggal: TANGGAL } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdItems.push(id);
    // No literal "%" or "_" anywhere in this tema.
    const patched = await call(item.PATCH, { method: "PATCH", body: { tema: `${marker}AXB` }, params: { id } });
    expect(patched.status).toBe(200);

    // Unescaped, "%" and "_" are ILIKE wildcards that would match this tema anyway.
    const percentAsWildcard = await loadPeribadahanOverview(editor.supabase, `${marker}A%B`);
    expect(percentAsWildcard.error).toBeNull();
    expect(percentAsWildcard.data?.rows.map((r) => r.id) ?? []).not.toContain(id);

    const underscoreAsWildcard = await loadPeribadahanOverview(editor.supabase, `${marker}A_B`);
    expect(underscoreAsWildcard.error).toBeNull();
    expect(underscoreAsWildcard.data?.rows.map((r) => r.id) ?? []).not.toContain(id);

    // The real substring still matches.
    const realMatch = await loadPeribadahanOverview(editor.supabase, `${marker}AXB`);
    expect(realMatch.data?.rows.map((r) => r.id)).toContain(id);

    // Commas and parentheses cause no error (no PostgREST `.or()` filter string is built from this input).
    const noError = await loadPeribadahanOverview(editor.supabase, `${marker}),(select 1) --`);
    expect(noError.error).toBeNull();
    expect(noError.data?.rows.map((r) => r.id) ?? []).not.toContain(id);
  });
});
