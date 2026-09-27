/**
 * Data Jemaat + Keluarga route handlers (brief §9.9-9.10) against the local
 * stack: auth (401/403), family resolution and atomic labels, the author of
 * a pastoral note can't be forged from the client, one activity log row per
 * mutation, and deleting cascades/clears the right things.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actAs, call, CLIENT_IP, signIn, type Session } from "./harness";

const jemaatCollection = await import("@/app/api/admin/jemaat/route");
const jemaatItem = await import("@/app/api/admin/jemaat/[id]/route");
const catatanCollection = await import("@/app/api/admin/jemaat/[id]/catatan/route");
const catatanItem = await import("@/app/api/admin/jemaat/[id]/catatan/[catatanId]/route");
const keluargaCollection = await import("@/app/api/admin/keluarga/route");
const keluargaItem = await import("@/app/api/admin/keluarga/[id]/route");
const anggotaCollection = await import("@/app/api/admin/keluarga/[id]/anggota/route");
const anggotaItem = await import("@/app/api/admin/keluarga/[id]/anggota/[jemaatId]/route");

const RUN = `E2E JK ${Date.now().toString(36)}`;
const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";

let editor: Session;
let viewer: Session;
let superadmin: Session;

const createdJemaat: string[] = [];
const createdKeluarga: string[] = [];

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

function emptyProfile(overrides: Record<string, unknown> = {}) {
  return {
    nama: `${RUN} Jemaat`,
    nomorAnggota: null,
    jenisKelamin: null,
    statusKeanggotaan: null,
    wilayahId: null,
    pekerjaan: null,
    alamat: null,
    noHp: null,
    tanggalLahir: null,
    tanggalMasuk: null,
    keluargaNama: null,
    hubunganKeluarga: null,
    labelIds: [],
    ...overrides,
  };
}

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
});

afterAll(async () => {
  for (const id of createdJemaat) await superadmin.supabase.from("jemaat").delete().eq("id", id);
  for (const id of createdKeluarga) await superadmin.supabase.from("keluarga").delete().eq("id", id);
});

describe("auth", () => {
  it("answers 401 to every jemaat and keluarga request without a session", async () => {
    actAs(null);
    const checks = [
      call(jemaatCollection.POST, { method: "POST", body: emptyProfile() }),
      call(jemaatItem.PATCH, { method: "PATCH", body: emptyProfile(), params: { id: MISSING_ID } }),
      call(jemaatItem.DELETE, { method: "DELETE", params: { id: MISSING_ID } }),
      call(catatanCollection.POST, { method: "POST", body: {}, params: { id: MISSING_ID } }),
      call(keluargaCollection.POST, { method: "POST", body: { nama: "x" } }),
      call(keluargaItem.PATCH, { method: "PATCH", body: { nama: "x" }, params: { id: MISSING_ID } }),
      call(keluargaItem.DELETE, { method: "DELETE", params: { id: MISSING_ID } }),
      call(anggotaCollection.POST, { method: "POST", body: { jemaatId: MISSING_ID }, params: { id: MISSING_ID } }),
    ];
    for (const response of await Promise.all(checks)) expect(response.status).toBe(401);
  });

  it("answers 403 to a viewer's writes", async () => {
    actAs(viewer);
    const response = await call(jemaatCollection.POST, { method: "POST", body: emptyProfile() });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
  });
});

describe("save_jemaat via the route", () => {
  it("creates a jemaat, resolving a new family by name and setting labels atomically", async () => {
    actAs(editor);
    const nama = `${RUN} Satu`;
    const keluargaNama = `${RUN} Keluarga Baru`;

    const add = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama, nomorAnggota: `${RUN}-0001`, keluargaNama, hubunganKeluarga: "Kepala Keluarga" }),
    });
    expect(add.status).toBe(201);
    const id = (add.body.data as unknown as { id: string }).id;
    createdJemaat.push(id);

    const { data: jemaat } = await superadmin.supabase
      .from("jemaat")
      .select("nama, nomor_anggota, hubungan_keluarga, keluarga:keluarga_id(nama)")
      .eq("id", id)
      .single();
    expect(jemaat?.nama).toBe(nama);
    expect(jemaat?.nomor_anggota).toBe(`${RUN}-0001`);
    expect((jemaat as unknown as { keluarga: { nama: string } }).keluarga.nama).toBe(keluargaNama);
    createdKeluarga.push((await superadmin.supabase.from("keluarga").select("id").eq("nama", keluargaNama).single()).data!.id);

    expect(await logRows(`Menambah jemaat "${nama}"`)).toEqual([
      { module: "jemaat", activity: `Menambah jemaat "${nama}"`, user_email: "editor@gkp.test", ip_address: CLIENT_IP },
    ]);
  });

  it("resolves an existing family case-insensitively instead of creating a duplicate", async () => {
    actAs(editor);
    const keluargaNama = `${RUN} Keluarga Reuse`;
    const first = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Dua`, keluargaNama }),
    });
    const firstId = (first.body.data as unknown as { id: string }).id;
    createdJemaat.push(firstId);

    const second = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Tiga`, keluargaNama: `  ${keluargaNama.toUpperCase()}  ` }),
    });
    const secondId = (second.body.data as unknown as { id: string }).id;
    createdJemaat.push(secondId);

    const { data: keluargaRows } = await superadmin.supabase.from("keluarga").select("id").ilike("nama", keluargaNama);
    expect(keluargaRows).toHaveLength(1);
    createdKeluarga.push(keluargaRows![0]!.id);

    const { data: first2 } = await superadmin.supabase.from("jemaat").select("keluarga_id").eq("id", firstId).single();
    const { data: second2 } = await superadmin.supabase.from("jemaat").select("keluarga_id").eq("id", secondId).single();
    expect(first2?.keluarga_id).toBe(second2?.keluarga_id);
  });

  it("clearing the family name on an edit unlinks the jemaat", async () => {
    actAs(editor);
    const created = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Empat`, keluargaNama: `${RUN} Keluarga Lepas` }),
    });
    const id = (created.body.data as unknown as { id: string }).id;
    createdJemaat.push(id);
    const { data: withFamily } = await superadmin.supabase.from("jemaat").select("keluarga_id").eq("id", id).single();
    expect(withFamily?.keluarga_id).not.toBeNull();
    createdKeluarga.push(withFamily!.keluarga_id!);

    const edited = await call(jemaatItem.PATCH, {
      method: "PATCH",
      body: emptyProfile({ nama: `${RUN} Empat` }),
      params: { id },
    });
    expect(edited.status).toBe(200);
    const { data: after } = await superadmin.supabase
      .from("jemaat")
      .select("keluarga_id, hubungan_keluarga")
      .eq("id", id)
      .single();
    expect(after).toEqual({ keluarga_id: null, hubungan_keluarga: null });
  });

  it("replaces labels as one set: partial failure leaves nothing half-done", async () => {
    actAs(editor);
    const { data: label } = await superadmin.supabase
      .from("label_jemaat")
      .insert({ nama: `${RUN} Label` })
      .select("id")
      .single();

    const created = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Lima`, labelIds: [label!.id] }),
    });
    const id = (created.body.data as unknown as { id: string }).id;
    createdJemaat.push(id);
    expect((await superadmin.supabase.from("jemaat_labels").select("label_id").eq("jemaat_id", id)).data).toEqual([
      { label_id: label!.id },
    ]);

    // An unknown label id in the set must reject the whole save (no half-applied labels).
    const failing = await call(jemaatItem.PATCH, {
      method: "PATCH",
      body: emptyProfile({ nama: `${RUN} Lima`, labelIds: [label!.id, MISSING_ID] }),
      params: { id },
    });
    expect(failing.status).toBe(400);
    expect((await superadmin.supabase.from("jemaat_labels").select("label_id").eq("jemaat_id", id)).data).toEqual([
      { label_id: label!.id },
    ]);

    await superadmin.supabase.from("label_jemaat").delete().eq("id", label!.id);
  });

  it("rejects a second Kepala Keluarga in the same family, through the HTTP route", async () => {
    actAs(editor);
    const keluargaNama = `${RUN} Keluarga Kepala`;
    const first = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Kepala Satu`, keluargaNama, hubunganKeluarga: "Kepala Keluarga" }),
    });
    const firstId = (first.body.data as unknown as { id: string }).id;
    createdJemaat.push(firstId);
    const { data: firstRow } = await superadmin.supabase.from("jemaat").select("keluarga_id").eq("id", firstId).single();
    createdKeluarga.push(firstRow!.keluarga_id!);

    const second = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Kepala Dua`, keluargaNama, hubunganKeluarga: "Kepala Keluarga" }),
    });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("Keluarga ini sudah punya Kepala Keluarga.");
  });

  it("answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(jemaatItem.PATCH, { method: "PATCH", body: emptyProfile(), params: { id } })).status).toBe(404);
      expect((await call(jemaatItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
    }
  });
});

describe("catatan pastoral", () => {
  it("sets the author from the session, ignoring anything the client sends, and logs the module correctly", async () => {
    actAs(editor);
    const person = await call(jemaatCollection.POST, { method: "POST", body: emptyProfile({ nama: `${RUN} Enam` }) });
    const jemaatId = (person.body.data as unknown as { id: string }).id;
    createdJemaat.push(jemaatId);

    const add = await call(catatanCollection.POST, {
      method: "POST",
      body: {
        jenis: "Kunjungan",
        tanggal: "2031-05-01",
        isi: "Isi catatan.",
        penulis_id: "00000000-0000-4000-8000-000000000000",
        penulis_nama: "Nama Palsu",
      },
      params: { id: jemaatId },
    });
    expect(add.status).toBe(201);
    const note = add.body.data as unknown as { id: string; penulis_nama: string };
    expect(note.penulis_nama).not.toBe("Nama Palsu");
    expect(await logRows(`Menambah catatan pastoral untuk "${RUN} Enam"`)).toHaveLength(1);

    const edit = await call(catatanItem.PATCH, {
      method: "PATCH",
      body: { jenis: "Kunjungan Ulang", tanggal: "2031-05-02", isi: "Isi baru." },
      params: { id: jemaatId, catatanId: note.id },
    });
    expect(edit.status).toBe(200);
    expect(await logRows(`Mengubah catatan pastoral untuk "${RUN} Enam"`)).toHaveLength(1);

    const remove = await call(catatanItem.DELETE, { method: "DELETE", params: { id: jemaatId, catatanId: note.id } });
    expect(remove.status).toBe(200);
    expect(await logRows(`Menghapus catatan pastoral untuk "${RUN} Enam"`)).toHaveLength(1);
  });
});

describe("deleting a jemaat", () => {
  it("removes their pastoral notes and clears schedule references elsewhere", async () => {
    actAs(editor);
    const person = await call(jemaatCollection.POST, { method: "POST", body: emptyProfile({ nama: `${RUN} Tujuh` }) });
    const jemaatId = (person.body.data as unknown as { id: string }).id;

    await call(catatanCollection.POST, {
      method: "POST",
      body: { jenis: "Kunjungan", tanggal: "2031-05-01", isi: "Isi." },
      params: { id: jemaatId },
    });

    const { data: category } = await editor.supabase.from("peribadahan_categories").select("id").eq("key", "umum").single();
    const { data: schedule } = await editor.supabase
      .from("peribadahan_items")
      .insert({ category_id: category!.id, tanggal: "2031-05-03", pelayan_firman_id: jemaatId })
      .select("id")
      .single();

    const remove = await call(jemaatItem.DELETE, { method: "DELETE", params: { id: jemaatId } });
    expect(remove.status).toBe(200);
    expect(await logRows(`Menghapus jemaat "${RUN} Tujuh"`)).toHaveLength(1);

    expect((await superadmin.supabase.from("jemaat_catatan_pastoral").select("id").eq("jemaat_id", jemaatId)).data).toEqual(
      [],
    );
    const { data: after } = await superadmin.supabase
      .from("peribadahan_items")
      .select("pelayan_firman_id")
      .eq("id", schedule!.id)
      .single();
    expect(after?.pelayan_firman_id).toBeNull();
    await superadmin.supabase.from("peribadahan_items").delete().eq("id", schedule!.id);
  });
});

describe("keluarga", () => {
  it("rejects a duplicate name, ignoring case, with a friendly message", async () => {
    actAs(editor);
    const nama = `${RUN} Kel Satu`;
    const first = await call(keluargaCollection.POST, { method: "POST", body: { nama } });
    expect(first.status).toBe(201);
    const id = (first.body.data as unknown as { id: string }).id;
    createdKeluarga.push(id);

    const duplicate = await call(keluargaCollection.POST, { method: "POST", body: { nama: nama.toUpperCase() } });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({ error: "Nama keluarga sudah digunakan." });

    const other = await call(keluargaCollection.POST, { method: "POST", body: { nama: `${RUN} Kel Dua` } });
    const otherId = (other.body.data as unknown as { id: string }).id;
    createdKeluarga.push(otherId);
    const renameClash = await call(keluargaItem.PATCH, {
      method: "PATCH",
      body: { nama: nama.toLowerCase() },
      params: { id: otherId },
    });
    expect(renameClash.status).toBe(400);
    expect(renameClash.body).toEqual({ error: "Nama keluarga sudah digunakan." });

    expect(await logRows(`Menambah keluarga "${nama}"`)).toHaveLength(1);
  });

  it("deleting a family keeps its members but clears their family and hubungan", async () => {
    actAs(editor);
    const keluarga = await call(keluargaCollection.POST, { method: "POST", body: { nama: `${RUN} Kel Hapus` } });
    const keluargaId = (keluarga.body.data as unknown as { id: string }).id;

    const person = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Delapan`, keluargaNama: `${RUN} Kel Hapus`, hubunganKeluarga: "Anak" }),
    });
    const jemaatId = (person.body.data as unknown as { id: string }).id;
    createdJemaat.push(jemaatId);

    const remove = await call(keluargaItem.DELETE, { method: "DELETE", params: { id: keluargaId } });
    expect(remove.status).toBe(200);
    expect(await logRows(`Menghapus keluarga "${RUN} Kel Hapus"`)).toHaveLength(1);

    const { data: after } = await superadmin.supabase
      .from("jemaat")
      .select("keluarga_id, hubungan_keluarga")
      .eq("id", jemaatId)
      .single();
    expect(after).toEqual({ keluarga_id: null, hubungan_keluarga: null });
  });

  it("answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(keluargaItem.PATCH, { method: "PATCH", body: { nama: "x" }, params: { id } })).status).toBe(404);
      expect((await call(keluargaItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
    }
  });
});

describe("keluarga anggota", () => {
  it("adds, inline-edits the hubungan, and 'Keluarkan' detaches, each logging one row", async () => {
    actAs(editor);
    const keluarga = await call(keluargaCollection.POST, { method: "POST", body: { nama: `${RUN} Kel Anggota` } });
    const keluargaId = (keluarga.body.data as unknown as { id: string }).id;
    createdKeluarga.push(keluargaId);

    const person = await call(jemaatCollection.POST, { method: "POST", body: emptyProfile({ nama: `${RUN} Sembilan` }) });
    const jemaatId = (person.body.data as unknown as { id: string }).id;
    createdJemaat.push(jemaatId);

    const add = await call(anggotaCollection.POST, {
      method: "POST",
      body: { jemaatId, hubunganKeluarga: "Anak" },
      params: { id: keluargaId },
    });
    expect(add.status).toBe(201);
    expect(await logRows(`Menambahkan "${RUN} Sembilan" ke keluarga "${RUN} Kel Anggota"`)).toHaveLength(1);

    const editHubungan = await call(anggotaItem.PATCH, {
      method: "PATCH",
      body: { hubunganKeluarga: "Kerabat Lain" },
      params: { id: keluargaId, jemaatId },
    });
    expect(editHubungan.status).toBe(200);
    expect(
      await logRows(`Mengubah hubungan keluarga "${RUN} Sembilan" di keluarga "${RUN} Kel Anggota"`),
    ).toHaveLength(1);
    expect((await superadmin.supabase.from("jemaat").select("hubungan_keluarga").eq("id", jemaatId).single()).data).toEqual(
      { hubungan_keluarga: "Kerabat Lain" },
    );

    const remove = await call(anggotaItem.DELETE, { method: "DELETE", params: { id: keluargaId, jemaatId } });
    expect(remove.status).toBe(200);
    expect(await logRows(`Mengeluarkan "${RUN} Sembilan" dari keluarga "${RUN} Kel Anggota"`)).toHaveLength(1);
    expect(
      (await superadmin.supabase.from("jemaat").select("keluarga_id, hubungan_keluarga").eq("id", jemaatId).single()).data,
    ).toEqual({ keluarga_id: null, hubungan_keluarga: null });
  });

  it("Tambah Anggota can move someone out of another family", async () => {
    actAs(editor);
    const keluargaA = await call(keluargaCollection.POST, { method: "POST", body: { nama: `${RUN} Kel Pindah A` } });
    const keluargaAId = (keluargaA.body.data as unknown as { id: string }).id;
    createdKeluarga.push(keluargaAId);
    const keluargaB = await call(keluargaCollection.POST, { method: "POST", body: { nama: `${RUN} Kel Pindah B` } });
    const keluargaBId = (keluargaB.body.data as unknown as { id: string }).id;
    createdKeluarga.push(keluargaBId);

    const person = await call(jemaatCollection.POST, {
      method: "POST",
      body: emptyProfile({ nama: `${RUN} Sepuluh`, keluargaNama: `${RUN} Kel Pindah A` }),
    });
    const jemaatId = (person.body.data as unknown as { id: string }).id;
    createdJemaat.push(jemaatId);

    const move = await call(anggotaCollection.POST, {
      method: "POST",
      body: { jemaatId, hubunganKeluarga: null },
      params: { id: keluargaBId },
    });
    expect(move.status).toBe(201);
    const { data: after } = await superadmin.supabase.from("jemaat").select("keluarga_id").eq("id", jemaatId).single();
    expect(after?.keluarga_id).toBe(keluargaBId);
  });
});
