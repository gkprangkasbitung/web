import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import type { MajelisCardRow } from "@/lib/majelis";
import { deletePhotoObject, PHOTO_FORM_MULTIPART, savePhotoSlot, withPhotoSlot, type StoredPhoto } from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, requiredText } from "@/lib/validation";

const NOT_FOUND = "Majelis tidak ditemukan.";
const REVALIDATE = ["/admin/majelis", { path: "/tentang-kami", type: "page" }] as const;
const COLUMNS = "id, nama, jabatan, foto_path, foto_alt, aktif, sort_order";

/** Default order (brief §11): sort_order, then insertion order for rows that share one. */
export async function loadMajelisCards(supabase: ServerSupabase) {
  return supabase
    .from("majelis")
    .select(COLUMNS)
    .order("sort_order")
    .order("created_at")
    .order("id")
    .then(({ data, error }) => ({ data: data as MajelisCardRow[] | null, error }));
}

/** New rows go last: max(sort_order) + 1, 0 when empty (stage 4's convention). */
async function nextSortOrder(supabase: ServerSupabase): Promise<number> {
  const { data, error } = await supabase
    .from("majelis")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? data.sort_order + 1 : 0;
}

function storedPhoto(row: { foto_path: string | null; foto_alt: string | null }): StoredPhoto | null {
  return row.foto_path && row.foto_alt ? { path: row.foto_path, alt: row.foto_alt } : null;
}

const cardSchema = withPhotoSlot({
  nama: requiredText("Nama wajib diisi.", 200),
  jabatan: requiredText("Jabatan wajib diisi.", 200),
});

/** POST /api/admin/majelis ("Tambah Majelis" dialog; brief §14.3), multipart (nama, jabatan, foto). */
export const createMajelisCard = mutation({
  permission: ["situs", "update"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: cardSchema,
  status: 201,
  async run({ input, supabase }) {
    const sort_order = await nextSortOrder(supabase);
    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "majelis",
      slot: input.foto,
      current: null,
      write: async (photo) => {
        const { data, error } = await supabase
          .from("majelis")
          .insert({ nama: input.nama, jabatan: input.jabatan, foto_path: photo?.path ?? null, foto_alt: photo?.alt ?? null, sort_order })
          .select(COLUMNS)
          .single();
        if (error) throw dbError(error);
        return data as MajelisCardRow;
      },
    });

    return {
      data,
      log: { module: "situs", activity: `Menambah majelis ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/majelis/[id]: nama, jabatan, foto together ("Simpan"). Aktif has its own endpoint below. */
export const updateMajelisCard = mutation({
  permission: ["situs", "update"],
  params: idParams,
  multipart: PHOTO_FORM_MULTIPART,
  schema: cardSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("majelis").select("nama, foto_path, foto_alt").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "majelis",
      slot: input.foto,
      current: storedPhoto(current.data),
      write: async (photo) => {
        const { data, error } = await supabase
          .from("majelis")
          .update({ nama: input.nama, jabatan: input.jabatan, foto_path: photo?.path ?? null, foto_alt: photo?.alt ?? null })
          .eq("id", params.id)
          .select(COLUMNS)
          .maybeSingle();
        if (error) throw dbError(error, { notFound: NOT_FOUND });
        if (!data) throw new ApiError(404, NOT_FOUND);
        return data as MajelisCardRow;
      },
    });

    const activity =
      current.data.nama === data.nama ? `Mengubah majelis ${quote(data.nama)}` : `Mengubah majelis ${quote(current.data.nama)} menjadi ${quote(data.nama)}`;
    return { data, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

const activeSchema = z.object({ aktif: z.boolean() });

/** PATCH /api/admin/majelis/[id]/aktif: the checkbox toggle, JSON, immediate (no multipart needed). */
export const toggleMajelisActive = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: activeSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const { data, error } = await supabase
      .from("majelis")
      .update({ aktif: input.aktif })
      .eq("id", params.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    return {
      data: data as MajelisCardRow,
      log: {
        module: "situs",
        activity: `${input.aktif ? "Mengaktifkan" : "Menonaktifkan"} majelis ${quote(data.nama)}`,
      },
      revalidate: REVALIDATE,
    };
  },
});

/** DELETE /api/admin/majelis/[id]; its photo object is removed too. */
export const deleteMajelisCard = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("majelis").delete().eq("id", params.id).select("id, nama, foto_path").maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);
    await deletePhotoObject(data.foto_path);

    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus majelis ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

const reorderSchema = z.object({ ids: z.array(z.uuid()) });

/** POST /api/admin/majelis/reorder: the atomic RPC (0030) rejects a stale list. */
export const reorderMajelisCards = mutation({
  permission: ["situs", "update"],
  schema: reorderSchema,
  async run({ input, supabase }) {
    const { error } = await supabase.rpc("reorder_majelis", { p_ids: input.ids });
    if (error) throw rpcError(error);

    return {
      data: { ok: true },
      log: { module: "situs", activity: "Mengubah urutan majelis" },
      revalidate: REVALIDATE,
    };
  },
});
