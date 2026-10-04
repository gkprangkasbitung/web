/**
 * Kalender Kegiatan (brief §14.4) against the local stack: kategori CRUD and
 * delete-in-use, kegiatan add/edit/publish/delete with photo upload/removal
 * and activity logs, anon's loss of direct table access, the three public
 * functions (kegiatan_bulan, kegiatan_detail, kegiatan_mendatang), and the
 * .ics route (escaping, WIB -> UTC, all-day DTEND).
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addDays, addMonths, monthOf, monthRange, today } from "@/lib/dates";
import type { Database } from "@/types/database";

import { actAs, call, callForm, env, serviceClient, signIn, type Session } from "./harness";

// `connection()` only marks the page as request-time rendering; outside a Next
// request it throws, so it's a no-op here (same as public-site.test.ts).
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const { loadKegiatanBulan, loadKegiatanDetail, loadKegiatanMendatang } = await import("@/lib/public-site");

const kegiatanCollection = await import("@/app/api/admin/kegiatan/route");
const kegiatanItem = await import("@/app/api/admin/kegiatan/[id]/route");
const kegiatanStatus = await import("@/app/api/admin/kegiatan/[id]/status/route");
const kategoriCollection = await import("@/app/api/admin/kegiatan/kategori/route");
const kategoriItem = await import("@/app/api/admin/kegiatan/kategori/[id]/route");
const icsRoute = await import("@/app/(public)/kegiatan/[slug]/ics/route");

const RUN = `E2E ${Date.now().toString(36)}`;
const service = serviceClient();
const anon = createClient<Database>(env.url, env.anonKey, { auth: { persistSession: false } });

function jpeg(width = 40, height = 30, background = "#4a7a4a") {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg();
}

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

let editor: Session;
let viewer: Session;
let superadmin: Session;
let kategoriId: string;
let komisiTampilId: string;
let komisiSembunyiId: string;
const createdKegiatan: string[] = [];
const createdKategori: string[] = [];
const createdKomisi: string[] = [];

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);

  const { data: kategori, error: kategoriError } = await service
    .from("kategori_kegiatan")
    .select("id")
    .order("sort_order")
    .limit(1)
    .single();
  if (kategoriError) throw kategoriError;
  kategoriId = kategori.id;

  const { data: komisiRows, error: komisiError } = await service
    .from("komisi")
    .insert([
      { nama: `${RUN} komisi tampil`, slug: `${RUN.toLowerCase().replace(/\s+/g, "-")}-komisi-tampil`, tampil: true, sort_order: 0 },
      { nama: `${RUN} komisi sembunyi`, slug: `${RUN.toLowerCase().replace(/\s+/g, "-")}-komisi-sembunyi`, tampil: false, sort_order: 1 },
    ])
    .select("id, tampil");
  if (komisiError) throw komisiError;
  komisiTampilId = komisiRows.find((row) => row.tampil)!.id;
  komisiSembunyiId = komisiRows.find((row) => !row.tampil)!.id;
  createdKomisi.push(komisiTampilId, komisiSembunyiId);
});

afterAll(async () => {
  for (const id of createdKegiatan) await service.from("kegiatan").delete().eq("id", id);
  for (const id of createdKategori) await service.from("kategori_kegiatan").delete().eq("id", id);
  for (const id of createdKomisi) await service.from("komisi").delete().eq("id", id);
});

function kegiatanForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const fields: Record<string, string> = {
    judul: `${RUN} kegiatan satu`,
    tanggalMulai: "2031-06-15",
    tanggalSelesai: "2031-06-15",
    waktuMulai: "19:00",
    waktuSelesai: "21:00",
    tempat: "Aula",
    mapsUrl: "",
    deskripsi: "",
    infoPendaftaran: "",
    kategoriId,
    penyelenggaraKomisiId: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe("Kegiatan: permissions", () => {
  it("401 without a session, 403 to a viewer, writing nothing", async () => {
    actAs(null);
    expect((await callForm(kegiatanCollection.POST, { method: "POST", form: kegiatanForm() })).status).toBe(401);
    expect((await call(kategoriCollection.POST, { method: "POST", body: { nama: "x", warna: "hijau" } })).status).toBe(401);

    actAs(editor);
    const seeded = await callForm(kegiatanCollection.POST, { method: "POST", form: kegiatanForm({ judul: `${RUN} viewer target` }) });
    expect(seeded.status).toBe(201);
    const id = (seeded.body.data as unknown as { id: string }).id;
    createdKegiatan.push(id);

    actAs(viewer);
    expect((await callForm(kegiatanCollection.POST, { method: "POST", form: kegiatanForm() })).status).toBe(403);
    expect((await callForm(kegiatanItem.PATCH, { method: "PATCH", form: kegiatanForm(), params: { id } })).status).toBe(403);
    expect((await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id } })).status).toBe(403);
    expect((await call(kegiatanItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(403);
    expect((await call(kategoriCollection.POST, { method: "POST", body: { nama: "x", warna: "hijau" } })).status).toBe(403);
  });
});

describe("Kegiatan: CRUD", () => {
  it("adds as draft with a photo, edits, publishes/unpublishes, and deletes the photo on removal", async () => {
    actAs(editor);
    const judul = `${RUN} retret pemuda`;
    const form = kegiatanForm({ judul, penyelenggaraKomisiId: komisiTampilId });
    form.append("foto_file", new File([await jpeg().toBuffer()], "foto.jpg", { type: "image/jpeg" }));
    form.append("foto_alt", "Foto kegiatan");

    const add = await callForm(kegiatanCollection.POST, { method: "POST", form });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; slug: string; status: string; foto_path: string | null };
    createdKegiatan.push(row.id);
    expect(row.status).toBe("draft");
    expect(await logRows(`Menambah kegiatan "${judul}" (2031-06-15)`)).toHaveLength(1);

    const publish = await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });
    expect(publish.status).toBe(200);
    expect(await logRows(`Mempublikasikan kegiatan "${judul}" (2031-06-15)`)).toHaveLength(1);

    const unpublish = await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "draft" }, params: { id: row.id } });
    expect(unpublish.status).toBe(200);
    expect(await logRows(`Menarik kegiatan "${judul}" (2031-06-15) ke draft`)).toHaveLength(1);

    const editedJudul = `${judul} (edit)`;
    const editForm = kegiatanForm({ judul: editedJudul, penyelenggaraKomisiId: komisiTampilId });
    // Keeping an existing photo needs its alt text resent (lib/situs-photos.ts's `nextPhoto`).
    editForm.append("foto_alt", "Foto kegiatan");
    const edit = await callForm(kegiatanItem.PATCH, { method: "PATCH", form: editForm, params: { id: row.id } });
    expect(edit.status).toBe(200);
    const edited = edit.body.data as unknown as { slug: string };
    expect(edited.slug).toBe(row.slug); // slug never changes, even though edit doesn't send it
    expect(await logRows(`Mengubah kegiatan "${editedJudul}" (2031-06-15)`)).toHaveLength(1);

    const objectName = row.foto_path!.replace("kegiatan/", "");
    // Delete needs situs:delete, which editor doesn't have.
    actAs(superadmin);
    const remove = await call(kegiatanItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(200);
    createdKegiatan.splice(createdKegiatan.indexOf(row.id), 1);
    const { data: afterDelete } = await service.storage.from("situs").list("kegiatan", { limit: 1000 });
    expect((afterDelete ?? []).some((item) => item.name === objectName)).toBe(false);
  });

  it("rejects an invalid date range and an invalid maps_url with a 400", async () => {
    actAs(editor);
    const badRange = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul: `${RUN} rentang salah`, tanggalMulai: "2031-06-20", tanggalSelesai: "2031-06-10" }),
    });
    expect(badRange.status).toBe(400);

    const badMaps = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul: `${RUN} maps salah`, mapsUrl: "https://bing.com/maps" }),
    });
    expect(badMaps.status).toBe(400);
  });
});

describe("Kategori Kegiatan: CRUD and delete-in-use", () => {
  it("adds, edits, and refuses to delete a kategori still used by a kegiatan", async () => {
    actAs(editor);
    const nama = `${RUN} kategori satu`;
    const add = await call(kategoriCollection.POST, { method: "POST", body: { nama, warna: "teal" } });
    expect(add.status).toBe(201);
    const kategori = add.body.data as unknown as { id: string };
    createdKategori.push(kategori.id);
    expect(await logRows(`Menambah kategori kegiatan "${nama}"`)).toHaveLength(1);

    const renamed = `${nama} (edit)`;
    const edit = await call(kategoriItem.PATCH, { method: "PATCH", body: { nama: renamed, warna: "ungu" }, params: { id: kategori.id } });
    expect(edit.status).toBe(200);
    expect(await logRows(`Mengubah kategori kegiatan "${nama}" menjadi "${renamed}"`)).toHaveLength(1);

    const used = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul: `${RUN} pakai kategori`, kategoriId: kategori.id }),
    });
    expect(used.status).toBe(201);
    const kegiatan = used.body.data as unknown as { id: string };
    createdKegiatan.push(kegiatan.id);

    actAs(superadmin);
    const deleteInUse = await call(kategoriItem.DELETE, { method: "DELETE", params: { id: kategori.id } });
    expect(deleteInUse.status).toBe(400);
    expect(deleteInUse.body.error).toBe("Kategori yang masih dipakai oleh kegiatan tidak bisa dihapus.");

    await service.from("kegiatan").delete().eq("id", kegiatan.id);
    createdKegiatan.splice(createdKegiatan.indexOf(kegiatan.id), 1);
    const deleteUnused = await call(kategoriItem.DELETE, { method: "DELETE", params: { id: kategori.id } });
    expect(deleteUnused.status).toBe(200);
    createdKategori.splice(createdKategori.indexOf(kategori.id), 1);
  });
});

describe("anon: no direct table access, but the three public functions work", () => {
  it("refuses a direct REST read/write on kegiatan and kategori_kegiatan", async () => {
    const kegiatanRead = await anon.from("kegiatan").select("id").limit(1);
    expect(kegiatanRead.error?.code).toBe("42501");
    const kategoriRead = await anon.from("kategori_kegiatan").select("id").limit(1);
    expect(kategoriRead.error?.code).toBe("42501");
    const write = await anon.from("kegiatan").insert({ judul: "x", slug: "x", tanggal_mulai: "2031-01-01", tanggal_selesai: "2031-01-01", kategori_id: kategoriId });
    expect(write.error?.code).toBe("42501");
  });

  it("kegiatan_bulan: published only, overlaps the requested month, malformed input -> empty", async () => {
    // kegiatan_bulan rejects months more than 24 months from today (0033), so
    // unlike other fixtures in this codebase this can't use a fixed far-future
    // date — the event has to actually straddle the real current month.
    const thisMonth = monthOf(today());
    const nextMonth = addMonths(thisMonth, 1);
    const monthAfterNext = addMonths(thisMonth, 2);
    const { end: lastDayThisMonth } = monthRange(thisMonth);

    actAs(editor);
    const judul = `${RUN} bulan uji`;
    const add = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({
        judul,
        tanggalMulai: addDays(lastDayThisMonth, -1),
        tanggalSelesai: addDays(lastDayThisMonth, 2),
      }),
    });
    const row = add.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(row.id);
    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });

    const current = await loadKegiatanBulan(thisMonth);
    expect(current.data?.some((r) => r.slug === row.slug)).toBe(true);
    const next = await loadKegiatanBulan(nextMonth);
    expect(next.data?.some((r) => r.slug === row.slug)).toBe(true);
    const after = await loadKegiatanBulan(monthAfterNext);
    expect(after.data?.some((r) => r.slug === row.slug)).toBe(false);

    const malformed = await loadKegiatanBulan("2031-13");
    expect(malformed.data).toEqual([]);
    const weird = await loadKegiatanBulan("not-a-month");
    expect(weird.data).toEqual([]);
  });

  it("kegiatan_detail: draft -> null, published -> the row, with the organizing komisi's name/slug rules", async () => {
    actAs(editor);
    const judul = `${RUN} detail uji`;
    const add = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul, penyelenggaraKomisiId: komisiSembunyiId }),
    });
    const row = add.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(row.id);

    const whileDraft = await loadKegiatanDetail(row.slug);
    expect(whileDraft).toBeNull();

    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });
    const published = await loadKegiatanDetail(row.slug);
    expect(published?.judul).toBe(judul);
    expect(published?.penyelenggaraKomisiNama).toBe(`${RUN} komisi sembunyi`);
    expect(published?.penyelenggaraKomisiSlug).toBeNull();

    const edit = await callForm(kegiatanItem.PATCH, {
      method: "PATCH",
      form: kegiatanForm({ judul, penyelenggaraKomisiId: komisiTampilId }),
      params: { id: row.id },
    });
    expect(edit.status).toBe(200);
    const afterEdit = await loadKegiatanDetail(row.slug);
    expect(afterEdit?.penyelenggaraKomisiNama).toBe(`${RUN} komisi tampil`);
    expect(afterEdit?.penyelenggaraKomisiSlug).not.toBeNull();
  });

  it("kegiatan_mendatang: tanggal_selesai >= today still counts, already-ended is excluded, p_exclude_id works", async () => {
    actAs(editor);
    const ongoing = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul: `${RUN} sedang berlangsung`, tanggalMulai: addDays(today(), -1), tanggalSelesai: addDays(today(), 1) }),
    });
    const ongoingRow = ongoing.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(ongoingRow.id);
    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: ongoingRow.id } });

    const ended = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul: `${RUN} sudah lewat`, tanggalMulai: addDays(today(), -5), tanggalSelesai: addDays(today(), -2) }),
    });
    const endedRow = ended.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(endedRow.id);
    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: endedRow.id } });

    const mendatang = await loadKegiatanMendatang(50, null);
    expect(mendatang.data?.some((r) => r.slug === ongoingRow.slug)).toBe(true);
    expect(mendatang.data?.some((r) => r.slug === endedRow.slug)).toBe(false);

    const excluded = await loadKegiatanMendatang(50, ongoingRow.id);
    expect(excluded.data?.some((r) => r.slug === ongoingRow.slug)).toBe(false);
  });
});

describe(".ics (brief §14.4, D)", () => {
  async function fetchIcs(slug: string) {
    const response = await icsRoute.GET(new Request("http://localhost/kegiatan/x/ics"), { params: Promise.resolve({ slug }) });
    return { status: response.status, text: await response.text(), contentType: response.headers.get("content-type") };
  }

  it("404s for a draft or unknown slug", async () => {
    actAs(editor);
    const draft = await callForm(kegiatanCollection.POST, { method: "POST", form: kegiatanForm({ judul: `${RUN} ics draft` }) });
    const draftRow = draft.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(draftRow.id);

    expect((await fetchIcs(draftRow.slug)).status).toBe(404);
    expect((await fetchIcs("tidak-pernah-ada")).status).toBe(404);
  });

  it("escapes commas/semicolons/newlines, converts WIB to UTC, and sets text/calendar", async () => {
    actAs(editor);
    const judul = `${RUN} rapat, penting; catatan`;
    const deskripsi = "Baris pertama\nBaris kedua";
    const add = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({ judul, deskripsi, tanggalMulai: "2031-06-15", tanggalSelesai: "2031-06-15", waktuMulai: "19:00", waktuSelesai: "21:00" }),
    });
    const row = add.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(row.id);
    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });

    const { status, text, contentType } = await fetchIcs(row.slug);
    expect(status).toBe(200);
    expect(contentType).toBe("text/calendar; charset=utf-8");
    expect(text).toMatch(/SUMMARY:.*rapat\\, penting\\; catatan/);
    expect(text).toContain("DESCRIPTION:Baris pertama\\nBaris kedua");
    // 19:00 WIB (UTC+7) -> 12:00 UTC on the same date.
    expect(text).toContain("DTSTART:20310615T120000Z");
    expect(text).toContain("DTEND:20310615T140000Z");
  });

  it("an all-day event has VALUE=DATE and DTEND on the day after tanggal_selesai", async () => {
    actAs(editor);
    const add = await callForm(kegiatanCollection.POST, {
      method: "POST",
      form: kegiatanForm({
        judul: `${RUN} sepanjang hari`,
        tanggalMulai: "2031-06-15",
        tanggalSelesai: "2031-06-17",
        waktuMulai: "",
        waktuSelesai: "",
      }),
    });
    const row = add.body.data as unknown as { id: string; slug: string };
    createdKegiatan.push(row.id);
    await call(kegiatanStatus.PATCH, { method: "PATCH", body: { status: "published" }, params: { id: row.id } });

    const { text } = await fetchIcs(row.slug);
    expect(text).toContain("DTSTART;VALUE=DATE:20310615");
    expect(text).toContain("DTEND;VALUE=DATE:20310618");
  });
});
