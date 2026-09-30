import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation } from "@/lib/api-mutation";
import { currentYearJakarta, PENDETA_TAHUN_MIN, type PendetaRow } from "@/lib/pendeta";
import { deletePhotoObject, PHOTO_FORM_MULTIPART, savePhotoSlot, withPhotoSlot, type StoredPhoto } from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const NOT_FOUND = "Pendeta tidak ditemukan.";
const REVALIDATE = ["/admin/pendeta", { path: "/", type: "layout" }, { path: "/tentang-kami", type: "page" }] as const;
const COLUMNS = "id, nama, peran, tahun_mulai, tahun_selesai, foto_path, foto_alt, keterangan, tampil";

/**
 * `/admin/pendeta` (brief §9.2, §14.7): a bounded list, loaded whole in the
 * fixed default order (currently serving first, then past pastors by
 * tahun_selesai desc, then tahun_mulai desc — same as `public_pendeta()`,
 * 0031). No manual reordering.
 */
export async function loadPendetaList(supabase: ServerSupabase) {
  return supabase
    .from("pendeta")
    .select(COLUMNS)
    .order("tahun_selesai", { ascending: false, nullsFirst: true })
    .order("tahun_mulai", { ascending: false })
    .order("id")
    .then(({ data, error }) => ({ data: data as PendetaRow[] | null, error }));
}

function storedPhoto(row: { foto_path: string | null; foto_alt: string | null }): StoredPhoto | null {
  return row.foto_path && row.foto_alt ? { path: row.foto_path, alt: row.foto_alt } : null;
}

function label(row: { nama: string }): string {
  return quote(row.nama);
}

// A multipart field is always a string; parses a 4-digit year, within
// 1800..currentYearJakarta(), or reports `message`.
function parseYear(value: string, message: string, ctx: z.RefinementCtx): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < PENDETA_TAHUN_MIN || num > currentYearJakarta()) {
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  }
  return num;
}

const tahunMulaiField = z
  .string({ error: "Tahun mulai wajib diisi." })
  .trim()
  .transform((value, ctx) => parseYear(value, "Tahun mulai tidak valid.", ctx));

// Empty string (still serving) -> null, matching kegiatan-routes.ts's timeSchema
// idiom for multipart fields (always strings, never actually null on the wire).
const tahunSelesaiField = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null)
  .transform((value, ctx) => (value === null ? null : parseYear(value, "Tahun selesai tidak valid.", ctx)));

const fieldsSchema = withPhotoSlot({
  nama: requiredText("Nama wajib diisi.", 200),
  peran: requiredText("Peran wajib diisi.", 200),
  tahunMulai: tahunMulaiField,
  tahunSelesai: tahunSelesaiField,
  keterangan: optionalText(500),
  tampil: z
    .string()
    .nullish()
    .transform((value) => value === "1" || value === "true"),
}).refine((input) => input.tahunSelesai === null || input.tahunSelesai >= input.tahunMulai, {
  message: "Tahun selesai tidak boleh sebelum tahun mulai.",
  path: ["tahunSelesai"],
});

/** POST /api/admin/pendeta ("Tambah Pendeta" dialog), multipart. */
export const createPendeta = mutation({
  permission: ["situs", "update"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  status: 201,
  async run({ input, supabase }) {
    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "pendeta",
      slot: input.foto,
      current: null,
      write: async (photo) => {
        const { data, error } = await supabase
          .from("pendeta")
          .insert({
            nama: input.nama,
            peran: input.peran,
            tahun_mulai: input.tahunMulai,
            tahun_selesai: input.tahunSelesai,
            keterangan: input.keterangan,
            tampil: input.tampil,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .select(COLUMNS)
          .single();
        if (error) throw dbError(error);
        return data as PendetaRow;
      },
    });

    return {
      data,
      log: { module: "situs", activity: `Menambah pendeta ${label(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/pendeta/[id]: every field together, multipart. */
export const updatePendeta = mutation({
  permission: ["situs", "update"],
  params: idParams,
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("pendeta").select("nama, foto_path, foto_alt").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "pendeta",
      slot: input.foto,
      current: storedPhoto(current.data),
      write: async (photo) => {
        const { data, error } = await supabase
          .from("pendeta")
          .update({
            nama: input.nama,
            peran: input.peran,
            tahun_mulai: input.tahunMulai,
            tahun_selesai: input.tahunSelesai,
            keterangan: input.keterangan,
            tampil: input.tampil,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .eq("id", params.id)
          .select(COLUMNS)
          .maybeSingle();
        if (error) throw dbError(error, { notFound: NOT_FOUND });
        if (!data) throw new ApiError(404, NOT_FOUND);
        return data as PendetaRow;
      },
    });

    const activity =
      current.data.nama === data.nama ? `Mengubah pendeta ${label(data)}` : `Mengubah pendeta ${label(current.data)} menjadi ${label(data)}`;
    return { data, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/**
 * DELETE /api/admin/pendeta/[id]. `profil_gereja.sambutan_pendeta_id` is
 * `on delete set null` (0031), so Sambutan never breaks; the client warns
 * about it beforehand (it already has `sambutanPendetaId` from the page load).
 */
export const deletePendeta = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("pendeta").delete().eq("id", params.id).select("id, nama, foto_path").maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);
    await deletePhotoObject(data.foto_path);

    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus pendeta ${label(data)}` },
      revalidate: REVALIDATE,
    };
  },
});
