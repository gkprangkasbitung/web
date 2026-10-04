import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation } from "@/lib/api-mutation";
import { isoDateSchema } from "@/lib/dates";
import type { KategoriKegiatanRow, KegiatanRow } from "@/lib/kegiatan";
import { KATEGORI_KEGIATAN_DELETE_DESCRIPTION } from "@/lib/kegiatan";
import { mapsUrlField } from "@/lib/profil-gereja";
import { deletePhotoObject, PHOTO_FORM_MULTIPART, savePhotoSlot, withPhotoSlot, type StoredPhoto } from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";
import { randomSlugSuffix, slugify } from "@/lib/warta";

const NOT_FOUND = "Kegiatan tidak ditemukan.";
const KATEGORI_NOT_FOUND = "Kategori kegiatan tidak ditemukan.";
const KATEGORI_UNIQUE_MESSAGE = "Nama kategori sudah digunakan.";
const REVALIDATE = [{ path: "/admin/kegiatan", type: "layout" }, { path: "/kegiatan", type: "layout" }, { path: "/", type: "layout" }] as const;
const COLUMNS =
  "id, judul, slug, tanggal_mulai, tanggal_selesai, waktu_mulai, waktu_selesai, tempat, maps_url, deskripsi, info_pendaftaran, foto_path, foto_alt, kategori_id, penyelenggara_komisi_id, status";

// A multipart field is always a string, so empty must mean "no time" here
// too (same idiom as the pre-calendar-edition timeSchema, stage 11b).
const timeSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value), "Waktu tidak valid.");

const uuidOrNull = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || z.uuid().safeParse(value).success, "Data yang dikirim tidak valid.");

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

const fieldsSchema = withPhotoSlot({
  judul: requiredText("Judul wajib diisi.", 200),
  tanggalMulai: isoDateSchema,
  tanggalSelesai: isoDateSchema,
  waktuMulai: timeSchema,
  waktuSelesai: timeSchema,
  tempat: optionalText(200),
  mapsUrl: mapsUrlField,
  deskripsi: optionalText(2000),
  infoPendaftaran: optionalText(2000),
  kategoriId: z.uuid({ error: "Kategori wajib dipilih." }),
  penyelenggaraKomisiId: uuidOrNull,
}).refine(
  (input) => input.tanggalSelesai >= input.tanggalMulai,
  { message: "Tanggal selesai tidak boleh sebelum tanggal mulai.", path: ["tanggalSelesai"] },
)
  .refine((input) => daysBetween(input.tanggalMulai, input.tanggalSelesai) <= 30, {
    message: "Rentang tanggal maksimal 31 hari.",
    path: ["tanggalSelesai"],
  })
  .refine(
    (input) =>
      input.tanggalMulai !== input.tanggalSelesai ||
      !input.waktuMulai ||
      !input.waktuSelesai ||
      input.waktuSelesai > input.waktuMulai,
    { message: "Waktu selesai harus setelah waktu mulai.", path: ["waktuSelesai"] },
  );

/** `/admin/kegiatan` (brief §9.2, §14.4): a bounded list, loaded whole and filtered/sorted on the client. */
export async function loadKegiatanList(supabase: ServerSupabase) {
  return supabase
    .from("kegiatan")
    .select(COLUMNS)
    .order("tanggal_mulai", { ascending: false })
    .order("created_at", { ascending: false })
    .then(({ data, error }) => ({ data: data as KegiatanRow[] | null, error }));
}

export async function loadKategoriKegiatanOptions(supabase: ServerSupabase) {
  return supabase
    .from("kategori_kegiatan")
    .select("id, nama, warna, sort_order")
    .order("sort_order")
    .order("created_at")
    .then(({ data, error }) => ({ data: data as KategoriKegiatanRow[] | null, error }));
}

function storedPhoto(row: { foto_path: string | null; foto_alt: string | null }): StoredPhoto | null {
  return row.foto_path && row.foto_alt ? { path: row.foto_path, alt: row.foto_alt } : null;
}

/** `Menambah kegiatan "Retret Pemuda" (2031-06-15)` — raw ISO date, same convention as warta (brief §7). */
function label(row: { judul: string; tanggal_mulai: string }): string {
  return `${quote(row.judul)} (${row.tanggal_mulai})`;
}

const SLUG_RETRIES = 5;

/** One attempt, then up to 5 retries with a random "-xxxx" suffix (brief §9.4's convention, reused by Komisi and here). */
async function insertKegiatan(
  supabase: ServerSupabase,
  baseSlug: string,
  values: {
    judul: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    tempat: string | null;
    maps_url: string | null;
    deskripsi: string | null;
    info_pendaftaran: string | null;
    kategori_id: string;
    penyelenggara_komisi_id: string | null;
    foto_path: string | null;
    foto_alt: string | null;
  },
): Promise<KegiatanRow> {
  for (let attempt = 0; attempt <= SLUG_RETRIES; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;
    const { data, error } = await supabase.from("kegiatan").insert({ ...values, slug }).select(COLUMNS).single();
    if (!error) return data as KegiatanRow;
    if (error.code === "23505" && error.message.includes("kegiatan_slug_key") && attempt < SLUG_RETRIES) continue;
    throw dbError(error, { inUse: "Kategori yang dipilih tidak ditemukan." });
  }
  throw new ApiError(400, "Gagal membuat alamat unik untuk kegiatan ini. Coba simpan lagi.");
}

/** POST /api/admin/kegiatan ("Tambah Kegiatan" dialog), multipart. New rows start as `draft`. */
export const createKegiatan = mutation({
  permission: ["situs", "update"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  status: 201,
  async run({ input, supabase }) {
    const baseSlug = slugify(input.judul);
    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "kegiatan",
      slot: input.foto,
      current: null,
      write: (photo) =>
        insertKegiatan(supabase, baseSlug, {
          judul: input.judul,
          tanggal_mulai: input.tanggalMulai,
          tanggal_selesai: input.tanggalSelesai,
          waktu_mulai: input.waktuMulai,
          waktu_selesai: input.waktuSelesai,
          tempat: input.tempat,
          maps_url: input.mapsUrl,
          deskripsi: input.deskripsi,
          info_pendaftaran: input.infoPendaftaran,
          kategori_id: input.kategoriId,
          penyelenggara_komisi_id: input.penyelenggaraKomisiId,
          foto_path: photo?.path ?? null,
          foto_alt: photo?.alt ?? null,
        }),
    });

    return {
      data,
      log: { module: "situs", activity: `Menambah kegiatan ${label(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/kegiatan/[id]: every content field together, multipart. Status has its own endpoint below. Slug never changes. */
export const updateKegiatan = mutation({
  permission: ["situs", "update"],
  params: idParams,
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("kegiatan").select("foto_path, foto_alt").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "kegiatan",
      slot: input.foto,
      current: storedPhoto(current.data),
      write: async (photo) => {
        const { data, error } = await supabase
          .from("kegiatan")
          .update({
            judul: input.judul,
            tanggal_mulai: input.tanggalMulai,
            tanggal_selesai: input.tanggalSelesai,
            waktu_mulai: input.waktuMulai,
            waktu_selesai: input.waktuSelesai,
            tempat: input.tempat,
            maps_url: input.mapsUrl,
            deskripsi: input.deskripsi,
            info_pendaftaran: input.infoPendaftaran,
            kategori_id: input.kategoriId,
            penyelenggara_komisi_id: input.penyelenggaraKomisiId,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .eq("id", params.id)
          .select(COLUMNS)
          .maybeSingle();
        if (error) throw dbError(error, { notFound: NOT_FOUND, inUse: "Kategori yang dipilih tidak ditemukan." });
        if (!data) throw new ApiError(404, NOT_FOUND);
        return data as KegiatanRow;
      },
    });

    return { data, log: { module: "situs", activity: `Mengubah kegiatan ${label(data)}` }, revalidate: REVALIDATE };
  },
});

const statusSchema = z.object({ status: z.enum(["draft", "published"], "Status tidak valid.") });

/** PATCH /api/admin/kegiatan/[id]/status: "Terbitkan" / "Tarik ke Draft". */
export const setKegiatanStatus = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: statusSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const { data, error } = await supabase
      .from("kegiatan")
      .update({ status: input.status })
      .eq("id", params.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    const activity =
      input.status === "published" ? `Mempublikasikan kegiatan ${label(data)}` : `Menarik kegiatan ${label(data)} ke draft`;
    return { data: data as KegiatanRow, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/kegiatan/[id]; its photo object is removed too. */
export const deleteKegiatan = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase
      .from("kegiatan")
      .delete()
      .eq("id", params.id)
      .select("id, judul, tanggal_mulai, foto_path")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);
    await deletePhotoObject(data.foto_path);

    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus kegiatan ${label(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Kategori Kegiatan (master data, brief §14.4)
// ---------------------------------------------------------------------------

const kategoriSchema = z.object({
  nama: requiredText("Nama kategori wajib diisi.", 100),
  warna: requiredText("Warna wajib dipilih.", 20),
});

/** `/admin/kegiatan/kategori`. */
export async function loadKategoriKegiatanList(supabase: ServerSupabase) {
  const [kategoriRes, kegiatanRes] = await Promise.all([
    supabase.from("kategori_kegiatan").select("id, nama, warna, sort_order").order("sort_order").order("created_at"),
    supabase.from("kegiatan").select("kategori_id"),
  ]);
  if (kategoriRes.error) return { data: null, error: kategoriRes.error.message };

  const counts = new Map<string, number>();
  for (const row of kegiatanRes.data ?? []) {
    counts.set(row.kategori_id, (counts.get(row.kategori_id) ?? 0) + 1);
  }
  const data = (kategoriRes.data ?? []).map((row) => ({ ...row, jumlahKegiatan: counts.get(row.id) ?? 0 }));
  return { data, error: null };
}

/** POST /api/admin/kegiatan/kategori. New rows append at `max(sort_order) + 1` (stage 4's convention). */
export const createKategoriKegiatan = mutation({
  permission: ["situs", "update"],
  schema: kategoriSchema,
  status: 201,
  async run({ input, supabase }) {
    const { data: last } = await supabase.from("kategori_kegiatan").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sortOrder = (last?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("kategori_kegiatan")
      .insert({ nama: input.nama, warna: input.warna, sort_order: sortOrder })
      .select("id, nama, warna, sort_order")
      .single();
    if (error) throw dbError(error, { unique: KATEGORI_UNIQUE_MESSAGE });
    return {
      data: data as KategoriKegiatanRow,
      log: { module: "situs", activity: `Menambah kategori kegiatan "${data.nama}"` },
      revalidate: REVALIDATE,
    };
  },
});

export const updateKategoriKegiatan = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: kategoriSchema,
  notFound: KATEGORI_NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("kategori_kegiatan").select("nama").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: KATEGORI_NOT_FOUND });
    if (!current.data) throw new ApiError(404, KATEGORI_NOT_FOUND);

    const { data, error } = await supabase
      .from("kategori_kegiatan")
      .update({ nama: input.nama, warna: input.warna })
      .eq("id", params.id)
      .select("id, nama, warna, sort_order")
      .maybeSingle();
    if (error) throw dbError(error, { unique: KATEGORI_UNIQUE_MESSAGE, notFound: KATEGORI_NOT_FOUND });
    if (!data) throw new ApiError(404, KATEGORI_NOT_FOUND);

    const activity =
      current.data.nama === data.nama
        ? `Mengubah kategori kegiatan "${data.nama}"`
        : `Mengubah kategori kegiatan "${current.data.nama}" menjadi "${data.nama}"`;
    return { data: data as KategoriKegiatanRow, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/kegiatan/kategori/[id]; refused (23503, `kategori_id restrict`) while any kegiatan still uses it. */
export const deleteKategoriKegiatan = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: KATEGORI_NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("kategori_kegiatan").delete().eq("id", params.id).select("id, nama").maybeSingle();
    if (error) throw dbError(error, { inUse: KATEGORI_KEGIATAN_DELETE_DESCRIPTION, notFound: KATEGORI_NOT_FOUND });
    if (!data) throw new ApiError(404, KATEGORI_NOT_FOUND);
    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus kategori kegiatan "${data.nama}"` },
      revalidate: REVALIDATE,
    };
  },
});
