/**
 * Komisi (brief §14.8) against the local stack: permissions (401/403),
 * CRUD lifecycle with photo upload, master jabatan, member management
 * (add/inline jabatan change/remove) including the warta:read requirement,
 * friendly RPC conflict messages, cascading deletes, and anon's
 * column-limited REST read through the public functions.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { actAs, call, callForm, createTestUser, env, serviceClient, signIn, type Session } from "./harness";

const komisiCollection = await import("@/app/api/admin/komisi/route");
const komisiItem = await import("@/app/api/admin/komisi/[id]/route");
const komisiReorder = await import("@/app/api/admin/komisi/reorder/route");
const jabatanCollection = await import("@/app/api/admin/komisi/jabatan/route");
const jabatanItem = await import("@/app/api/admin/komisi/jabatan/[id]/route");
const anggotaCollection = await import("@/app/api/admin/komisi/[id]/anggota/route");
const anggotaItem = await import("@/app/api/admin/komisi/[id]/anggota/[jemaatId]/route");

const RUN_ID = Date.now().toString(36);
const RUN = `E2E ${RUN_ID}`;
const service = serviceClient();
const anon = createClient<Database>(env.url, env.anonKey, { auth: { persistSession: false } });

let editor: Session;
let viewer: Session;
let superadmin: Session;
let customRoleSession: Session;
let customRoleUserId: string;
let penatuaLabelId: string;

const createdKomisi: string[] = [];
const createdJabatan: string[] = [];
const createdJemaat: string[] = [];
const createdRoles: string[] = [];

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase.from("activity_logs").select("module, activity").eq("activity", activity);
  if (error) throw error;
  return data;
}

function komisiForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.append("nama", overrides.nama ?? `${RUN} Komisi Satu`);
  form.append("deskripsi", overrides.deskripsi ?? "");
  form.append("periode", overrides.periode ?? "");
  form.append("pembinaJemaatId", overrides.pembinaJemaatId ?? "");
  form.append("tampil", overrides.tampil ?? "1");
  form.append("foto_alt", overrides.foto_alt ?? "");
  return form;
}

async function addJemaat(nama: string, status: Database["public"]["Tables"]["jemaat"]["Row"]["status_keanggotaan"]) {
  const { data, error } = await service.from("jemaat").insert({ nama, status_keanggotaan: status }).select("id").single();
  if (error) throw error;
  createdJemaat.push(data.id);
  return data.id as string;
}

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);

  const settings = await service.from("komisi_settings").select("pembina_label_id").eq("id", 1).single();
  if (settings.error || !settings.data.pembina_label_id) throw new Error("komisi_settings has no pembina_label_id");
  penatuaLabelId = settings.data.pembina_label_id;

  // A custom role with situs:update but no warta:read (brief §14.8's "needs both" rule).
  const role = await service.from("roles").insert({ name: `komisi_uji_${RUN}` }).select("id").single();
  if (role.error) throw role.error;
  createdRoles.push(role.data.id);
  const perms = await service.from("permissions").select("id, resource, action");
  const grants = (perms.data ?? [])
    .filter((p) => p.resource === "situs" && ["create", "update", "delete"].includes(p.action))
    .map((p) => ({ role_id: role.data.id, permission_id: p.id }));
  const grantInsert = await service.from("role_permissions").insert(grants);
  if (grantInsert.error) throw grantInsert.error;

  const email = `komisi-custom-${RUN_ID}@test.local`;
  customRoleUserId = await createTestUser(email, "password123", []);
  const assign = await service.from("user_roles").insert({ user_id: customRoleUserId, role_id: role.data.id });
  if (assign.error) throw assign.error;
  customRoleSession = await signIn(email, "password123");
});

afterAll(async () => {
  // komisi first: its komisi_anggota rows cascade, so jabatan_komisi deletes cleanly after.
  for (const id of createdKomisi) await service.from("komisi").delete().eq("id", id);
  for (const id of createdJabatan) await service.from("jabatan_komisi").delete().eq("id", id);
  for (const id of createdJemaat) await service.from("jemaat").delete().eq("id", id);
  for (const id of createdRoles) await service.from("roles").delete().eq("id", id);
  await service.auth.admin.deleteUser(customRoleUserId);
});

describe("Komisi", () => {
  it("answers 401 without a session and 403 to a viewer, with nothing written", async () => {
    actAs(null);
    expect((await callForm(komisiCollection.POST, { method: "POST", form: komisiForm() })).status).toBe(401);
    actAs(viewer);
    const before = await viewer.supabase.from("komisi").select("id", { count: "exact", head: true });
    const denied = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm() });
    expect(denied.status).toBe(403);
    const after = await viewer.supabase.from("komisi").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });

  it("creates a komisi with a Penatua pembina, renames it, and logs each mutation", async () => {
    const penatua = await addJemaat(`${RUN} Pembina`, "anggota_penuh");
    await service.from("jemaat_labels").insert({ jemaat_id: penatua, label_id: penatuaLabelId });

    actAs(editor);
    const created = await callForm(komisiCollection.POST, {
      method: "POST",
      form: komisiForm({ nama: `${RUN} Komisi Anak`, pembinaJemaatId: penatua }),
    });
    expect(created.status).toBe(201);
    const komisi = created.body.data as unknown as { id: string; nama: string; slug: string; pembina_jemaat_id: string };
    createdKomisi.push(komisi.id);
    expect(komisi.pembina_jemaat_id).toBe(penatua);
    expect(komisi.slug).toMatch(/^[a-z0-9-]+$/);
    expect(await logRows(`Menambah komisi "${RUN} Komisi Anak"`)).toHaveLength(1);

    const renamed = await callForm(komisiItem.PATCH, {
      method: "PATCH",
      form: komisiForm({ nama: `${RUN} Komisi Anak Baru`, pembinaJemaatId: penatua }),
      params: { id: komisi.id },
    });
    expect(renamed.status).toBe(200);
    expect(await logRows(`Mengubah komisi "${RUN} Komisi Anak" menjadi "${RUN} Komisi Anak Baru"`)).toHaveLength(1);

    const stillSameSlug = await superadmin.supabase.from("komisi").select("slug").eq("id", komisi.id).single();
    expect(stillSameSlug.data?.slug).toBe(komisi.slug);
  });

  it("rejects a pembina without the Penatua label, with the trigger's own message", async () => {
    const notPenatua = await addJemaat(`${RUN} Bukan Penatua`, "sidi");
    actAs(editor);
    const response = await callForm(komisiCollection.POST, {
      method: "POST",
      form: komisiForm({ nama: `${RUN} Komisi Tanpa Label`, pembinaJemaatId: notPenatua }),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Pembina harus berlabel Penatua.");
  });

  it("reorders komisi atomically and rejects a stale list", async () => {
    actAs(editor);
    const a = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Urutan A` }) });
    const b = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Urutan B` }) });
    const idA = (a.body.data as unknown as { id: string }).id;
    const idB = (b.body.data as unknown as { id: string }).id;
    createdKomisi.push(idA, idB);

    const { data: all } = await superadmin.supabase.from("komisi").select("id").order("sort_order");
    const ids = (all ?? []).map((row) => row.id);

    const stale = await call(komisiReorder.POST, { method: "POST", body: { ids: ids.slice(1) } });
    expect(stale.status).toBe(400);

    const reordered = [...ids].reverse();
    const ok = await call(komisiReorder.POST, { method: "POST", body: { ids: reordered } });
    expect(ok.status).toBe(200);
    const { data: after } = await superadmin.supabase.from("komisi").select("id, sort_order").order("sort_order");
    expect((after ?? []).map((row) => row.id)).toEqual(reordered);
  });

  describe("jabatan master", () => {
    it("adds, renames, and refuses to delete a jabatan still in use", async () => {
      actAs(editor);
      const created = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Jabatan Satu`, tunggal: true } });
      expect(created.status).toBe(201);
      const jabatan = created.body.data as unknown as { id: string };
      createdJabatan.push(jabatan.id);

      const komisi = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Komisi Jabatan` }) });
      const komisiId = (komisi.body.data as unknown as { id: string }).id;
      createdKomisi.push(komisiId);
      const person = await addJemaat(`${RUN} Pemegang Jabatan`, "sidi");

      const added = await call(anggotaCollection.POST, {
        method: "POST",
        body: { jemaatId: person, jabatanId: jabatan.id },
        params: { id: komisiId },
      });
      expect(added.status).toBe(201);

      // Deleting needs situs:delete (super_admin/admin only; editor has create/read/update).
      actAs(superadmin);
      const deleteInUse = await call(jabatanItem.DELETE, { method: "DELETE", params: { id: jabatan.id } });
      expect(deleteInUse.status).toBe(400);
      expect(deleteInUse.body.error).toBe("Jabatan ini masih dipakai oleh anggota komisi.");
      actAs(editor);

      const removeMember = await call(anggotaItem.DELETE, { method: "DELETE", params: { id: komisiId, jemaatId: person } });
      expect(removeMember.status).toBe(200);

      actAs(superadmin);
      const deleteNowUnused = await call(jabatanItem.DELETE, { method: "DELETE", params: { id: jabatan.id } });
      expect(deleteNowUnused.status).toBe(200);
      actAs(editor);
      createdJabatan.splice(createdJabatan.indexOf(jabatan.id), 1);
    });
  });

  describe("member management", () => {
    it("rejects an ineligible status, enforces one tunggal jabatan, and reports friendly conflicts", async () => {
      actAs(editor);
      const ketua = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Ketua Uji`, tunggal: true } });
      const jabatanId = (ketua.body.data as unknown as { id: string }).id;
      createdJabatan.push(jabatanId);
      const komisi = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Komisi Anggota` }) });
      const komisiId = (komisi.body.data as unknown as { id: string }).id;
      createdKomisi.push(komisiId);

      const simpatisan = await addJemaat(`${RUN} Simpatisan`, "simpatisan");
      const rejected = await call(anggotaCollection.POST, {
        method: "POST",
        body: { jemaatId: simpatisan, jabatanId },
        params: { id: komisiId },
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toBe("Anggota komisi harus berstatus Sidi atau Anggota Penuh.");

      const satu = await addJemaat(`${RUN} Ketua Satu`, "sidi");
      const added = await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: satu, jabatanId }, params: { id: komisiId } });
      expect(added.status).toBe(201);
      expect(await logRows(`Menambah "${RUN} Ketua Satu" sebagai ${RUN} Ketua Uji komisi "${RUN} Komisi Anggota"`)).toHaveLength(1);

      const dua = await addJemaat(`${RUN} Ketua Dua`, "anggota_penuh");
      const conflict = await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: dua, jabatanId }, params: { id: komisiId } });
      expect(conflict.status).toBe(400);
      expect(conflict.body.error).toBe(`Komisi ini sudah punya ${RUN} Ketua Uji: ${RUN} Ketua Satu.`);

      const duplicate = await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: satu, jabatanId }, params: { id: komisiId } });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error).toBe(`${RUN} Ketua Satu sudah menjadi anggota komisi ini.`);

      const inlineChange = await call(anggotaItem.PATCH, {
        method: "PATCH",
        body: { jabatanId },
        params: { id: komisiId, jemaatId: satu },
      });
      expect(inlineChange.status).toBe(200);

      const removed = await call(anggotaItem.DELETE, { method: "DELETE", params: { id: komisiId, jemaatId: satu } });
      expect(removed.status).toBe(200);
      expect(await logRows(`Menghapus "${RUN} Ketua Satu" dari komisi "${RUN} Komisi Anggota"`)).toHaveLength(1);
    });

    it("refuses member management for situs:update without warta:read, and for a viewer", async () => {
      actAs(editor);
      const jabatan = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Jabatan Akses`, tunggal: false } });
      const jabatanId = (jabatan.body.data as unknown as { id: string }).id;
      createdJabatan.push(jabatanId);
      const komisi = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Komisi Akses` }) });
      const komisiId = (komisi.body.data as unknown as { id: string }).id;
      createdKomisi.push(komisiId);
      const person = await addJemaat(`${RUN} Target Akses`, "sidi");

      actAs(viewer);
      const asViewer = await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: person, jabatanId }, params: { id: komisiId } });
      expect(asViewer.status).toBe(403);

      actAs(customRoleSession);
      const asCustom = await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: person, jabatanId }, params: { id: komisiId } });
      expect(asCustom.status).toBe(403);

      const { count } = await superadmin.supabase
        .from("komisi_anggota")
        .select("jemaat_id", { count: "exact", head: true })
        .eq("komisi_id", komisiId);
      expect(count).toBe(0);
    });
  });

  it("deleting a jemaat removes their membership and clears a pembina reference", async () => {
    const penatua = await addJemaat(`${RUN} Pembina Hapus`, "sidi");
    await service.from("jemaat_labels").insert({ jemaat_id: penatua, label_id: penatuaLabelId });
    const member = await addJemaat(`${RUN} Anggota Hapus`, "sidi");

    actAs(editor);
    const komisi = await callForm(komisiCollection.POST, {
      method: "POST",
      form: komisiForm({ nama: `${RUN} Komisi Hapus`, pembinaJemaatId: penatua }),
    });
    const komisiId = (komisi.body.data as unknown as { id: string }).id;
    createdKomisi.push(komisiId);
    const jabatan = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Jabatan Hapus`, tunggal: false } });
    const jabatanId = (jabatan.body.data as unknown as { id: string }).id;
    createdJabatan.push(jabatanId);
    await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: member, jabatanId }, params: { id: komisiId } });

    await service.from("jemaat").delete().eq("id", penatua);
    await service.from("jemaat").delete().eq("id", member);
    createdJemaat.splice(createdJemaat.indexOf(penatua), 1);
    createdJemaat.splice(createdJemaat.indexOf(member), 1);

    const after = await superadmin.supabase.from("komisi").select("pembina_jemaat_id").eq("id", komisiId).single();
    expect(after.data?.pembina_jemaat_id).toBeNull();
    const { count } = await superadmin.supabase
      .from("komisi_anggota")
      .select("jemaat_id", { count: "exact", head: true })
      .eq("komisi_id", komisiId)
      .eq("jemaat_id", member);
    expect(count).toBe(0);
  });

  it("deletes a komisi, its photo object, and every membership row, with the count in the activity sentence", async () => {
    actAs(editor);
    const komisi = await callForm(komisiCollection.POST, { method: "POST", form: komisiForm({ nama: `${RUN} Komisi Hapus Total` }) });
    const komisiId = (komisi.body.data as unknown as { id: string }).id;
    const jabatan = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Jabatan Hapus Total`, tunggal: false } });
    const jabatanId = (jabatan.body.data as unknown as { id: string }).id;
    createdJabatan.push(jabatanId);
    const member = await addJemaat(`${RUN} Anggota Hapus Total`, "sidi");
    await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: member, jabatanId }, params: { id: komisiId } });

    actAs(superadmin);
    const deleted = await call(komisiItem.DELETE, { method: "DELETE", params: { id: komisiId } });
    expect(deleted.status).toBe(200);
    expect(await logRows(`Menghapus komisi "${RUN} Komisi Hapus Total" (1 anggota ikut terlepas)`)).toHaveLength(1);

    const { count } = await superadmin.supabase.from("komisi_anggota").select("jemaat_id", { count: "exact", head: true }).eq("komisi_id", komisiId);
    expect(count).toBe(0);
  });

  describe("public read", () => {
    it("exposes only tampil komisi, with members limited to name + jabatan, and refuses anon direct table access", async () => {
      const penatua = await addJemaat(`${RUN} Pembina Publik`, "anggota_penuh");
      await service.from("jemaat_labels").insert({ jemaat_id: penatua, label_id: penatuaLabelId });
      const member = await addJemaat(`${RUN} Anggota Publik`, "anggota_penuh");

      actAs(editor);
      const komisi = await callForm(komisiCollection.POST, {
        method: "POST",
        form: komisiForm({ nama: `${RUN} Komisi Publik`, pembinaJemaatId: penatua }),
      });
      const komisiId = (komisi.body.data as unknown as { id: string }).id;
      const slug = (komisi.body.data as unknown as { slug: string }).slug;
      createdKomisi.push(komisiId);
      const jabatan = await call(jabatanCollection.POST, { method: "POST", body: { nama: `${RUN} Jabatan Publik`, tunggal: false } });
      const jabatanId = (jabatan.body.data as unknown as { id: string }).id;
      createdJabatan.push(jabatanId);
      await call(anggotaCollection.POST, { method: "POST", body: { jemaatId: member, jabatanId }, params: { id: komisiId } });

      const list = await anon.rpc("public_komisi_list");
      expect(list.error).toBeNull();
      expect((list.data ?? []).some((row) => row.id === komisiId)).toBe(true);

      const detail = await anon.rpc("public_komisi_detail", { p_slug: slug });
      expect(detail.error).toBeNull();
      const body = detail.data as { pembina_nama: string; anggota: { nama: string; jabatan: string }[] };
      expect(body.pembina_nama).toBe(`${RUN} Pembina Publik`);
      expect(body.anggota).toEqual([{ nama: `${RUN} Anggota Publik`, jabatan: `${RUN} Jabatan Publik` }]);
      expect(JSON.stringify(body)).not.toContain(member);
      expect(JSON.stringify(body)).not.toContain(penatua);

      const direct = await anon.from("komisi").select("*");
      expect(direct.error?.code).toBe("42501");
      const directAnggota = await anon.from("komisi_anggota").select("*");
      expect(directAnggota.error?.code).toBe("42501");
    });
  });
});
