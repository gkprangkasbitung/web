import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import { PELAYANAN_ICONS } from "@/lib/pelayanan-icons";
import type { PelayananCardRow } from "@/lib/pelayanan";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const NOT_FOUND = "Pelayanan tidak ditemukan.";
const REVALIDATE = ["/admin/pelayanan", { path: "/", type: "layout" }] as const;
const ICON_KEYS = PELAYANAN_ICONS.map((item) => item.key) as [string, ...string[]];

/** Default order (brief §11): sort_order, then insertion order for rows that share one. */
export async function loadPelayananCards(supabase: ServerSupabase) {
  return supabase
    .from("pelayanan")
    .select("id, nama, deskripsi, jadwal, icon, aktif, sort_order")
    .order("sort_order")
    .order("created_at")
    .order("id")
    .then(({ data, error }) => ({ data: data as PelayananCardRow[] | null, error }));
}

/** New rows go last: max(sort_order) + 1, 0 when empty (stage 4's convention). */
async function nextSortOrder(supabase: ServerSupabase): Promise<number> {
  const { data, error } = await supabase
    .from("pelayanan")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? data.sort_order + 1 : 0;
}

const createSchema = z.object({
  nama: requiredText("Nama wajib diisi.", 200),
  deskripsi: optionalText(2000),
  jadwal: optionalText(300),
  icon: z.enum(ICON_KEYS, "Ikon tidak dikenal."),
});

/** POST /api/admin/pelayanan ("Tambah Pelayanan" dialog; brief §14.2). */
export const createPelayananCard = mutation({
  permission: ["situs", "update"],
  schema: createSchema,
  status: 201,
  async run({ input, supabase }) {
    const sort_order = await nextSortOrder(supabase);
    const { data, error } = await supabase
      .from("pelayanan")
      .insert({ nama: input.nama, deskripsi: input.deskripsi, jadwal: input.jadwal, icon: input.icon, sort_order })
      .select("id, nama, deskripsi, jadwal, icon, aktif, sort_order")
      .single();
    if (error) throw dbError(error);

    return {
      data: data as PelayananCardRow,
      log: { module: "situs", activity: `Menambah pelayanan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

/**
 * The card sends exactly one of two groups: `nama`/`deskripsi`/`jadwal`/`icon`
 * (from "Simpan"), or `aktif` alone (from toggling the checkbox) — same
 * pattern as Litbang (stage 8).
 */
const updateSchema = z
  .object({
    nama: requiredText("Nama wajib diisi.", 200).optional(),
    deskripsi: z
      .string()
      .trim()
      .max(2000, "Maksimal 2000 karakter.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    jadwal: z
      .string()
      .trim()
      .max(300, "Maksimal 300 karakter.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    icon: z.enum(ICON_KEYS, "Ikon tidak dikenal.").optional(),
    aktif: z.boolean().optional(),
  })
  .refine((value) => value.nama !== undefined || value.aktif !== undefined, {
    message: "Tidak ada perubahan untuk disimpan.",
  });

/** PATCH /api/admin/pelayanan/[id]. */
export const updatePelayananCard = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: updateSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("pelayanan").select("nama").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const fields: { nama?: string; deskripsi?: string | null; jadwal?: string | null; icon?: string; aktif?: boolean } = {};
    if (input.nama !== undefined) fields.nama = input.nama;
    if (input.deskripsi !== undefined) fields.deskripsi = input.deskripsi;
    if (input.jadwal !== undefined) fields.jadwal = input.jadwal;
    if (input.icon !== undefined) fields.icon = input.icon;
    if (input.aktif !== undefined) fields.aktif = input.aktif;

    const { data, error } = await supabase
      .from("pelayanan")
      .update(fields)
      .eq("id", params.id)
      .select("id, nama, deskripsi, jadwal, icon, aktif, sort_order")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    let activity: string;
    if (input.aktif !== undefined && input.nama === undefined) {
      activity = `${input.aktif ? "Mengaktifkan" : "Menonaktifkan"} pelayanan ${quote(data.nama)}`;
    } else if (current.data.nama === data.nama) {
      activity = `Mengubah pelayanan ${quote(data.nama)}`;
    } else {
      activity = `Mengubah pelayanan ${quote(current.data.nama)} menjadi ${quote(data.nama)}`;
    }

    return { data: data as PelayananCardRow, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/pelayanan/[id]. */
export const deletePelayananCard = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("pelayanan").delete().eq("id", params.id).select("id, nama").maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus pelayanan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

const reorderSchema = z.object({ ids: z.array(z.uuid()) });

/** POST /api/admin/pelayanan/reorder: the atomic RPC (0030) rejects a stale list. */
export const reorderPelayananCards = mutation({
  permission: ["situs", "update"],
  schema: reorderSchema,
  async run({ input, supabase }) {
    const { error } = await supabase.rpc("reorder_pelayanan", { p_ids: input.ids });
    if (error) throw rpcError(error);

    return {
      data: { ok: true },
      log: { module: "situs", activity: "Mengubah urutan pelayanan" },
      revalidate: REVALIDATE,
    };
  },
});
