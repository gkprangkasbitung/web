import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation } from "@/lib/api-mutation";
import { isoDateSchema } from "@/lib/dates";
import type { KegiatanRow } from "@/lib/kegiatan";
import { deletePhotoObject, PHOTO_FORM_MULTIPART, savePhotoSlot, withPhotoSlot, type StoredPhoto } from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const NOT_FOUND = "Kegiatan tidak ditemukan.";
const REVALIDATE = ["/admin/kegiatan", { path: "/", type: "layout" }] as const;
const COLUMNS = "id, judul, tanggal, waktu, tempat, deskripsi, foto_path, foto_alt, status";

// A multipart field is always a string, so unlike peribadahan-routes.ts's
// timeSchema (a JSON body, where the client sends null for "no time"), an
// empty string must be treated as "no time" here too, not rejected by the regex.
const timeSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value), "Waktu tidak valid.");

/** `/admin/kegiatan` (brief §9.2, §14.4): a bounded list, loaded whole and filtered/sorted on the client. */
export async function loadKegiatanList(supabase: ServerSupabase) {
  return supabase
    .from("kegiatan")
    .select(COLUMNS)
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false })
    .then(({ data, error }) => ({ data: data as KegiatanRow[] | null, error }));
}

function storedPhoto(row: { foto_path: string | null; foto_alt: string | null }): StoredPhoto | null {
  return row.foto_path && row.foto_alt ? { path: row.foto_path, alt: row.foto_alt } : null;
}

/** `Menambah kegiatan "Retret Pemuda" (2031-06-15)` — raw ISO date, same convention as warta (brief §7). */
function label(row: { judul: string; tanggal: string }): string {
  return `${quote(row.judul)} (${row.tanggal})`;
}

const fieldsSchema = withPhotoSlot({
  judul: requiredText("Judul wajib diisi.", 200),
  tanggal: isoDateSchema,
  waktu: timeSchema,
  tempat: optionalText(200),
  deskripsi: optionalText(2000),
});

/** POST /api/admin/kegiatan ("Tambah Kegiatan" dialog), multipart. New rows start as `draft`. */
export const createKegiatan = mutation({
  permission: ["situs", "update"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  status: 201,
  async run({ input, supabase }) {
    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "kegiatan",
      slot: input.foto,
      current: null,
      write: async (photo) => {
        const { data, error } = await supabase
          .from("kegiatan")
          .insert({
            judul: input.judul,
            tanggal: input.tanggal,
            waktu: input.waktu,
            tempat: input.tempat,
            deskripsi: input.deskripsi,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .select(COLUMNS)
          .single();
        if (error) throw dbError(error);
        return data as KegiatanRow;
      },
    });

    return {
      data,
      log: { module: "situs", activity: `Menambah kegiatan ${label(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/kegiatan/[id]: every content field together, multipart. Status has its own endpoint below. */
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
            tanggal: input.tanggal,
            waktu: input.waktu,
            tempat: input.tempat,
            deskripsi: input.deskripsi,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .eq("id", params.id)
          .select(COLUMNS)
          .maybeSingle();
        if (error) throw dbError(error, { notFound: NOT_FOUND });
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
      .select("id, judul, tanggal, foto_path")
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
