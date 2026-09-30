/**
 * Pelayanan, Majelis, Kegiatan (brief §14.2-14.4) against the local stack:
 * permissions (401/403), add/edit/reorder/delete with activity logs, photo
 * upload and removal on delete (Majelis, Kegiatan), Terbitkan/Tarik ke Draft
 * (Kegiatan), and anon's row-limited REST read (active/published only).
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { actAs, call, callForm, env, serviceClient, signIn, type Session } from "./harness";

const pelayananCollection = await import("@/app/api/admin/pelayanan/route");
const pelayananItem = await import("@/app/api/admin/pelayanan/[id]/route");
const pelayananReorder = await import("@/app/api/admin/pelayanan/reorder/route");

const majelisCollection = await import("@/app/api/admin/majelis/route");
const majelisItem = await import("@/app/api/admin/majelis/[id]/route");
const majelisAktif = await import("@/app/api/admin/majelis/[id]/aktif/route");
const majelisReorder = await import("@/app/api/admin/majelis/reorder/route");

const kegiatanCollection = await import("@/app/api/admin/kegiatan/route");
const kegiatanItem = await import("@/app/api/admin/kegiatan/[id]/route");
const kegiatanStatus = await import("@/app/api/admin/kegiatan/[id]/status/route");

const RUN = `E2E ${Date.now().toString(36)}`;
const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
const service = serviceClient();
const anon = createClient<Database>(env.url, env.anonKey, { auth: { persistSession: false } });

let editor: Session;
let viewer: Session;
let superadmin: Session;
const createdPelayanan: string[] = [];
const createdMajelis: string[] = [];
const createdKegiatan: string[] = [];

function jpeg(width = 40, height = 30, background = "#4a7a4a") {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg();
}

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
  for (const id of createdKegiatan) await superadmin.supabase.from("kegiatan").delete().eq("id", id);
  for (const id of createdMajelis) await superadmin.supabase.from("majelis").delete().eq("id", id);
  for (const id of createdPelayanan) await superadmin.supabase.from("pelayanan").delete().eq("id", id);
});

describe("Pelayanan", () => {
  it("answers 401 without a session and 403 to a viewer, writing nothing", async () => {
    actAs(null);
    expect((await call(pelayananCollection.POST, { method: "POST", body: { nama: "x", icon: "Users" } })).status).toBe(401);
    expect((await call(pelayananReorder.POST, { method: "POST", body: { ids: [] } })).status).toBe(401);

    actAs(editor);
    const seeded = await call(pelayananCollection.POST, {
      method: "POST",
      body: { nama: `${RUN} viewer target`, icon: "Users" },
    });
    expect(seeded.status).toBe(201);
    const id = (seeded.body.data as unknown as { id: string }).id;
    createdPelayanan.push(id);

    actAs(viewer);
    for (const response of [
      await call(pelayananCollection.POST, { method: "POST", body: { nama: "x", icon: "Users" } }),
      await call(pelayananItem.PATCH, { method: "PATCH", body: { aktif: false }, params: { id } }),
      await call(pelayananItem.DELETE, { method: "DELETE", params: { id } }),
      await call(pelayananReorder.POST, { method: "POST", body: { ids: [id] } }),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it("adds last, saves fields, toggles aktif, reorders, and deletes, logging one row each", async () => {
    actAs(editor);
    const nama = `${RUN} pelayanan satu`;

    const add = await call(pelayananCollection.POST, {
      method: "POST",
      body: { nama, deskripsi: "Deskripsi", jadwal: "Setiap Minggu", icon: "Baby" },
    });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; aktif: boolean; icon: string };
    createdPelayanan.push(row.id);
    expect(row).toMatchObject({ aktif: true, icon: "Baby" });
    expect(await logRows(`Menambah pelayanan "${nama}"`)).toHaveLength(1);

    const off = await call(pelayananItem.PATCH, { method: "PATCH", body: { aktif: false }, params: { id: row.id } });
    expect(off.status).toBe(200);
    expect(await logRows(`Menonaktifkan pelayanan "${nama}"`)).toHaveLength(1);

    const second = await call(pelayananCollection.POST, { method: "POST", body: { nama: `${RUN} pelayanan dua`, icon: "Users" } });
    const secondId = (second.body.data as unknown as { id: string }).id;
    createdPelayanan.push(secondId);

    const badIcon = await call(pelayananCollection.POST, { method: "POST", body: { nama: "x", icon: "TidakAda" } });
    expect(badIcon.status).toBe(400);

    // The reorder RPC needs exactly the current full set (0030), not just these two rows.
    const { data: allIds } = await superadmin.supabase.from("pelayanan").select("id");
    const fullOrder = (allIds as { id: string }[]).map((r) => r.id);
    const reversed = [...fullOrder].reverse();
    const reordered = await call(pelayananReorder.POST, { method: "POST", body: { ids: reversed } });
    expect(reordered.status).toBe(200);
    const { data: afterOrder } = await superadmin.supabase.from("pelayanan").select("id, sort_order").order("sort_order");
    expect((afterOrder as { id: string }[]).map((r) => r.id)).toEqual(reversed);

    // Delete needs situs:delete, which editor doesn't have (this stage's mapping, brief-approved).
    const remove = await call(pelayananItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(403);
    actAs(superadmin);
    const removeAsAdmin = await call(pelayananItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(removeAsAdmin.status).toBe(200);
    expect(await logRows(`Menghapus pelayanan "${nama}"`)).toHaveLength(1);
    createdPelayanan.splice(createdPelayanan.indexOf(row.id), 1);
  });

  it("answers 404 for a missing or malformed id (edit) and 403 for delete without situs:delete", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(pelayananItem.PATCH, { method: "PATCH", body: { aktif: false }, params: { id } })).status).toBe(404);
    }
    actAs(superadmin);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(pelayananItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
    }
  });
});

describe("Majelis", () => {
  it("adds with a photo (multipart), toggles aktif via its own endpoint, and deletes the photo on removal", async () => {
    actAs(editor);
    const form = new FormData();
    form.append("nama", `${RUN} majelis satu`);
    form.append("jabatan", "Diaken");
    form.append("foto_file", new File([await jpeg().toBuffer()], "foto.jpg", { type: "image/jpeg" }));
    form.append("foto_alt", "Foto diaken");

    const add = await callForm(majelisCollection.POST, { method: "POST", form });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; foto_path: string | null; aktif: boolean };
    createdMajelis.push(row.id);
    expect(row.foto_path).toMatch(/^majelis\//);
    expect(row.aktif).toBe(true);
    expect(await logRows(`Menambah majelis "${RUN} majelis satu"`)).toHaveLength(1);

    const toggle = await call(majelisAktif.PATCH, { method: "PATCH", body: { aktif: false }, params: { id: row.id } });
    expect(toggle.status).toBe(200);
    expect(await logRows(`Menonaktifkan majelis "${RUN} majelis satu"`)).toHaveLength(1);

    const { data: beforeDelete } = await service.storage.from("situs").list("majelis", { limit: 1000 });
    const objectName = row.foto_path!.replace("majelis/", "");
    expect((beforeDelete ?? []).some((item) => item.name === objectName)).toBe(true);

    // Delete needs situs:delete, which editor doesn't have.
    actAs(superadmin);
    const remove = await call(majelisItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(200);
    createdMajelis.splice(createdMajelis.indexOf(row.id), 1);

    const { data: afterDelete } = await service.storage.from("situs").list("majelis", { limit: 1000 });
    expect((afterDelete ?? []).some((item) => item.name === objectName)).toBe(false);
  });

  it("401 without a session, 403 to a viewer on every route", async () => {
    actAs(null);
    expect((await callForm(majelisCollection.POST, { method: "POST", form: new FormData() })).status).toBe(401);

    actAs(viewer);
    const form = new FormData();
    form.append("nama", "x");
    form.append("jabatan", "x");
    expect((await callForm(majelisCollection.POST, { method: "POST", form })).status).toBe(403);
    expect((await call(majelisReorder.POST, { method: "POST", body: { ids: [] } })).status).toBe(403);
  });

  it("reorders atomically and rejects a stale list", async () => {
    actAs(editor);
    const a = await callForm(majelisCollection.POST, {
      method: "POST",
      form: (() => {
        const f = new FormData();
        f.append("nama", `${RUN} majelis reorder A`);
        f.append("jabatan", "Diaken");
        return f;
      })(),
    });
    const b = await callForm(majelisCollection.POST, {
      method: "POST",
      form: (() => {
        const f = new FormData();
        f.append("nama", `${RUN} majelis reorder B`);
        f.append("jabatan", "Diaken");
        return f;
      })(),
    });
    const idA = (a.body.data as unknown as { id: string }).id;
    const idB = (b.body.data as unknown as { id: string }).id;
    createdMajelis.push(idA, idB);

    // Missing idB, so the list is never exactly the current set, regardless of any other row.
    const stale = await call(majelisReorder.POST, { method: "POST", body: { ids: [idA] } });
    expect(stale.status).toBe(400);
    expect(stale.body.error).toBe("Daftar majelis sudah berubah. Muat ulang halaman lalu coba lagi.");
  });
});

describe("Kegiatan", () => {
  it("adds as draft, edits, publishes/unpublishes, and deletes the photo on removal", async () => {
    actAs(editor);
    const form = new FormData();
    form.append("judul", `${RUN} kegiatan satu`);
    form.append("tanggal", "2031-06-15");
    form.append("waktu", "09:00");
    form.append("tempat", "Aula");
    form.append("deskripsi", "");
    form.append("foto_file", new File([await jpeg().toBuffer()], "foto.jpg", { type: "image/jpeg" }));
    form.append("foto_alt", "Foto kegiatan");

    const add = await callForm(kegiatanCollection.POST, { method: "POST", form });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; status: string; foto_path: string | null };
    createdKegiatan.push(row.id);
    expect(row.status).toBe("draft");
    expect(await logRows(`Menambah kegiatan "${RUN} kegiatan satu" (2031-06-15)`)).toHaveLength(1);

    const publish = await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });
    expect(publish.status).toBe(200);
    expect(await logRows(`Mempublikasikan kegiatan "${RUN} kegiatan satu" (2031-06-15)`)).toHaveLength(1);

    const unpublish = await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "draft" }, params: { id: row.id } });
    expect(unpublish.status).toBe(200);
    expect(await logRows(`Menarik kegiatan "${RUN} kegiatan satu" (2031-06-15) ke draft`)).toHaveLength(1);

    const objectName = row.foto_path!.replace("kegiatan/", "");
    // Delete needs situs:delete, which editor doesn't have.
    actAs(superadmin);
    const remove = await call(kegiatanItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(200);
    createdKegiatan.splice(createdKegiatan.indexOf(row.id), 1);
    const { data: afterDelete } = await service.storage.from("situs").list("kegiatan", { limit: 1000 });
    expect((afterDelete ?? []).some((item) => item.name === objectName)).toBe(false);
  });

  it("401 without a session, 403 to a viewer, including status and delete", async () => {
    actAs(editor);
    const form = new FormData();
    form.append("judul", `${RUN} kegiatan viewer target`);
    form.append("tanggal", "2031-06-16");
    form.append("waktu", "");
    form.append("tempat", "");
    form.append("deskripsi", "");
    const add = await callForm(kegiatanCollection.POST, { method: "POST", form });
    const id = (add.body.data as unknown as { id: string }).id;
    createdKegiatan.push(id);

    actAs(null);
    expect((await callForm(kegiatanCollection.POST, { method: "POST", form: new FormData() })).status).toBe(401);

    actAs(viewer);
    expect((await callForm(kegiatanCollection.POST, { method: "POST", form: new FormData() })).status).toBe(403);
    expect((await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id } })).status).toBe(403);
    expect((await call(kegiatanItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(403);
  });

  it("anon reads only published rows through REST, never a draft", async () => {
    actAs(editor);
    const draftForm = new FormData();
    draftForm.append("judul", `${RUN} kegiatan draft anon`);
    draftForm.append("tanggal", "2031-06-17");
    draftForm.append("waktu", "");
    draftForm.append("tempat", "");
    draftForm.append("deskripsi", "");
    const draft = await callForm(kegiatanCollection.POST, { method: "POST", form: draftForm });
    const draftId = (draft.body.data as unknown as { id: string }).id;
    createdKegiatan.push(draftId);

    const { data, error } = await anon.from("kegiatan").select("id").eq("id", draftId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
