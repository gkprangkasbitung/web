/**
 * Tempat, Wilayah, Label Jemaat route handlers (brief §9.8) against the local
 * stack: auth (401/403), validation, friendly unique errors, one activity log
 * row per mutation, and delete clearing references.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actAs, call, CLIENT_IP, signIn, type Session } from "./harness";

const tempatCollection = await import("@/app/api/admin/tempat/route");
const tempatItem = await import("@/app/api/admin/tempat/[id]/route");
const wilayahCollection = await import("@/app/api/admin/wilayah/route");
const wilayahItem = await import("@/app/api/admin/wilayah/[id]/route");
const labelCollection = await import("@/app/api/admin/label-jemaat/route");
const labelItem = await import("@/app/api/admin/label-jemaat/[id]/route");

const MODULES = [
  { module: "tempat", logNoun: "tempat", collection: tempatCollection, item: tempatItem, table: "tempat" },
  { module: "wilayah", logNoun: "wilayah", collection: wilayahCollection, item: wilayahItem, table: "wilayah" },
  { module: "label_jemaat", logNoun: "label jemaat", collection: labelCollection, item: labelItem, table: "label_jemaat" },
] as const;

// Unique per run: activity_logs are append-only, so earlier runs' rows stay.
const RUN = `E2E ${Date.now().toString(36)}`;
const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";

let editor: Session;
let viewer: Session;
let superadmin: Session;
const created: { table: "tempat" | "wilayah" | "label_jemaat"; id: string }[] = [];
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
  for (const { table, id } of created) await superadmin.supabase.from(table).delete().eq("id", id);
});

describe.each(MODULES)("$module", ({ module, logNoun, collection, item, table }) => {
  it("answers 401 to every request without a session", async () => {
    actAs(null);
    expect((await call(collection.GET, { method: "GET" })).status).toBe(401);
    expect((await call(collection.POST, { method: "POST", body: { nama: "x" } })).status).toBe(401);
    expect((await call(item.PATCH, { method: "PATCH", body: { nama: "x" }, params: { id: MISSING_ID } })).status).toBe(401);
    expect((await call(item.DELETE, { method: "DELETE", params: { id: MISSING_ID } })).status).toBe(401);
  });

  it("lets the viewer read but answers 403 to add, edit, and delete", async () => {
    actAs(editor);
    const seeded = await call(collection.POST, { method: "POST", body: { nama: `${RUN} ${module} viewer` } });
    expect(seeded.status).toBe(201);
    const id = (seeded.body.data as unknown as { id: string }).id;
    created.push({ table, id });

    actAs(viewer);
    const list = await call(collection.GET, { method: "GET" });
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));

    for (const response of [
      await call(collection.POST, { method: "POST", body: { nama: `${RUN} viewer add` } }),
      await call(item.PATCH, { method: "PATCH", body: { nama: `${RUN} viewer edit` }, params: { id } }),
      await call(item.DELETE, { method: "DELETE", params: { id } }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
    }

    const { data } = await superadmin.supabase.from(table).select("nama").eq("id", id).single();
    expect(data?.nama).toBe(`${RUN} ${module} viewer`);
  });

  it("adds last, renames, and deletes, logging one row per mutation", async () => {
    actAs(editor);
    const nama = `${RUN} ${module} satu`;

    const before = await call(collection.GET, { method: "GET" });
    const maxBefore = Math.max(-1, ...(before.body.data as unknown as { sort_order: number }[]).map((r) => r.sort_order));

    const add = await call(collection.POST, { method: "POST", body: { nama: `  ${nama}  ` } });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; nama: string; sort_order: number };
    created.push({ table, id: row.id });
    expect(row.nama).toBe(nama);
    expect(row.sort_order).toBe(maxBefore + 1);

    const after = await call(collection.GET, { method: "GET" });
    expect((after.body.data as unknown as { id: string }[]).at(-1)?.id).toBe(row.id);

    const addLog = await logRows(`Menambah ${logNoun} "${nama}"`);
    expect(addLog).toEqual([{ module, activity: `Menambah ${logNoun} "${nama}"`, user_email: "editor@gkp.test", ip_address: CLIENT_IP }]);

    const renamed = `${nama} diubah`;
    const edit = await call(item.PATCH, { method: "PATCH", body: { nama: renamed }, params: { id: row.id } });
    expect(edit.status).toBe(200);
    expect(await logRows(`Mengubah ${logNoun} "${nama}" menjadi "${renamed}"`)).toHaveLength(1);

    const unchanged = await call(item.PATCH, { method: "PATCH", body: { nama: renamed }, params: { id: row.id } });
    expect(unchanged.status).toBe(200);
    expect(await logRows(`Mengubah ${logNoun} "${renamed}"`)).toHaveLength(1);

    const remove = await call(item.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(200);
    const removeLog = await logRows(`Menghapus ${logNoun} "${renamed}"`);
    expect(removeLog).toHaveLength(1);
    expect(removeLog[0]?.module).toBe(module);
  });

  it("answers 400 with a plain message for a blank name, and writes nothing", async () => {
    actAs(editor);
    const response = await call(collection.POST, { method: "POST", body: { nama: "   " } });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/wajib diisi\.$/);
  });

  it("answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(item.PATCH, { method: "PATCH", body: { nama: "x" }, params: { id } })).status).toBe(404);
      expect((await call(item.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
    }
  });
});

describe("label_jemaat uniqueness", () => {
  it("refuses a duplicate name, ignoring case, with a friendly message", async () => {
    actAs(editor);
    const nama = `${RUN} Pendeta`;
    const first = await call(labelCollection.POST, { method: "POST", body: { nama } });
    expect(first.status).toBe(201);
    const id = (first.body.data as unknown as { id: string }).id;
    created.push({ table: "label_jemaat", id });

    for (const duplicate of [nama, nama.toUpperCase(), `  ${nama.toLowerCase()} `]) {
      const response = await call(labelCollection.POST, { method: "POST", body: { nama: duplicate } });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Nama label sudah digunakan." });
    }

    const other = await call(labelCollection.POST, { method: "POST", body: { nama: `${RUN} Penatua` } });
    created.push({ table: "label_jemaat", id: (other.body.data as unknown as { id: string }).id });
    const rename = await call(labelItem.PATCH, {
      method: "PATCH",
      body: { nama: nama.toLowerCase() },
      params: { id: (other.body.data as unknown as { id: string }).id },
    });
    expect(rename.status).toBe(400);
    expect(rename.body).toEqual({ error: "Nama label sudah digunakan." });

    // Saving a label under its own name (or a case change of it) is fine.
    const self = await call(labelItem.PATCH, { method: "PATCH", body: { nama: nama.toUpperCase() }, params: { id } });
    expect(self.status).toBe(200);
  });

  it("treats LIKE wildcards literally", async () => {
    actAs(editor);
    const response = await call(labelCollection.POST, { method: "POST", body: { nama: `${RUN}%` } });
    expect(response.status).toBe(201);
    created.push({ table: "label_jemaat", id: (response.body.data as unknown as { id: string }).id });
  });

  it("maps a raw unique violation (a concurrent add) to the same message", async () => {
    // The app-level check can't see a row another request inserts at the same moment;
    // the database constraint catches it, and the handler must still answer kindly.
    actAs(editor);
    const nama = `${RUN} Serentak`;
    const results = await Promise.all([
      call(labelCollection.POST, { method: "POST", body: { nama } }),
      call(labelCollection.POST, { method: "POST", body: { nama } }),
    ]);
    for (const result of results) {
      if (result.status === 201) created.push({ table: "label_jemaat", id: (result.body.data as unknown as { id: string }).id });
      else expect(result.body).toEqual({ error: "Nama label sudah digunakan." });
    }
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });
});

describe("tempat keterangan", () => {
  it("stores trimmed keterangan and turns blank into null", async () => {
    actAs(editor);
    const add = await call(tempatCollection.POST, {
      method: "POST",
      body: { nama: `${RUN} Gedung`, keterangan: "  Jl. Contoh  " },
    });
    const row = add.body.data as unknown as { id: string; keterangan: string | null };
    created.push({ table: "tempat", id: row.id });
    expect(row.keterangan).toBe("Jl. Contoh");

    const edit = await call(tempatItem.PATCH, {
      method: "PATCH",
      body: { nama: `${RUN} Gedung`, keterangan: "   " },
      params: { id: row.id },
    });
    expect((edit.body.data as unknown as { keterangan: string | null }).keterangan).toBeNull();
  });
});

describe("deleting clears references", () => {
  it("deleting a tempat used by peribadahan_items leaves the row with tempat_id null", async () => {
    actAs(editor);
    const tempat = await call(tempatCollection.POST, { method: "POST", body: { nama: `${RUN} Dipakai` } });
    const tempatId = (tempat.body.data as unknown as { id: string }).id;
    created.push({ table: "tempat", id: tempatId });

    const wilayah = await call(wilayahCollection.POST, { method: "POST", body: { nama: `${RUN} Dipakai` } });
    const wilayahId = (wilayah.body.data as unknown as { id: string }).id;
    created.push({ table: "wilayah", id: wilayahId });

    const { data: category } = await editor.supabase.from("peribadahan_categories").select("id").eq("key", "krt").single();
    const { data: schedule, error } = await editor.supabase
      .from("peribadahan_items")
      .insert({ category_id: category!.id, tanggal: "2031-01-05", tempat_id: tempatId, wilayah_id: wilayahId })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdItems.push(schedule!.id);

    expect((await call(tempatItem.DELETE, { method: "DELETE", params: { id: tempatId } })).status).toBe(200);
    expect((await call(wilayahItem.DELETE, { method: "DELETE", params: { id: wilayahId } })).status).toBe(200);

    const { data: after } = await editor.supabase
      .from("peribadahan_items")
      .select("tempat_id, wilayah_id")
      .eq("id", schedule!.id)
      .single();
    expect(after).toEqual({ tempat_id: null, wilayah_id: null });
  });
});
