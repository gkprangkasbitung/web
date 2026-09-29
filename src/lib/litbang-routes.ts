import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import type { LitbangCardRow } from "@/lib/litbang";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const NOT_FOUND = "Litbang tidak ditemukan.";
const REVALIDATE = ["/admin/litbang"] as const;

/** Default order (brief §11): sort_order, then insertion order for rows that share one. */
export async function loadLitbangCards(supabase: ServerSupabase) {
  return supabase
    .from("litbang_categories")
    .select("id, name, deskripsi, active, sort_order")
    .order("sort_order")
    .order("updated_at")
    .order("id")
    .then(({ data, error }) => ({ data: data as LitbangCardRow[] | null, error }));
}

/** New rows go last: max(sort_order) + 1, 0 when empty (same convention as master data, stage 4). */
async function nextSortOrder(supabase: ServerSupabase): Promise<number> {
  const { data, error } = await supabase
    .from("litbang_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? data.sort_order + 1 : 0;
}

const createSchema = z.object({
  name: requiredText("Nama wajib diisi.", 200),
  deskripsi: optionalText(2000),
});

/** POST /api/admin/litbang-template ("Tambah Litbang" dialog; brief §9.6). */
export const createLitbangCard = mutation({
  permission: ["warta", "update"],
  schema: createSchema,
  status: 201,
  async run({ input, supabase }) {
    const sort_order = await nextSortOrder(supabase);
    const { data, error } = await supabase
      .from("litbang_categories")
      .insert({ name: input.name, deskripsi: input.deskripsi, sort_order })
      .select("id, name, deskripsi, active, sort_order")
      .single();
    if (error) throw dbError(error, { notFound: NOT_FOUND });

    return {
      data: data as LitbangCardRow,
      log: { module: "litbang", activity: `Menambah litbang ${quote(data.name)}` },
      revalidate: REVALIDATE,
    };
  },
});

/**
 * The card sends exactly one of two groups: `name` (+ `deskripsi`, from
 * "Simpan"), or `active` alone (from toggling the checkbox) — each key stays
 * `undefined`, not coerced, when the client omits it, so `run()` below can
 * tell which group was sent and pick the matching activity sentence.
 */
const updateSchema = z
  .object({
    name: requiredText("Nama wajib diisi.", 200).optional(),
    deskripsi: z
      .string()
      .trim()
      .max(2000, "Maksimal 2000 karakter.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    active: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.active !== undefined, {
    message: "Tidak ada perubahan untuk disimpan.",
  });

/** PATCH /api/admin/litbang-template/[id] (brief §10: name, deskripsi, active). */
export const updateLitbangCard = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: updateSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("litbang_categories").select("name").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const fields: { name?: string; deskripsi?: string | null; active?: boolean } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.deskripsi !== undefined) fields.deskripsi = input.deskripsi;
    if (input.active !== undefined) fields.active = input.active;

    const { data, error } = await supabase
      .from("litbang_categories")
      .update(fields)
      .eq("id", params.id)
      .select("id, name, deskripsi, active, sort_order")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    let activity: string;
    if (input.active !== undefined && input.name === undefined) {
      activity = `${input.active ? "Mengaktifkan" : "Menonaktifkan"} litbang ${quote(data.name)}`;
    } else if (current.data.name === data.name) {
      activity = `Mengubah litbang ${quote(data.name)}`;
    } else {
      activity = `Mengubah litbang ${quote(current.data.name)} menjadi ${quote(data.name)}`;
    }

    return { data: data as LitbangCardRow, log: { module: "litbang", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/litbang-template/[id]. `warta_litbang_items.litbang_category_id` is set null (0003). */
export const deleteLitbangCard = mutation({
  permission: ["warta", "update"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase
      .from("litbang_categories")
      .delete()
      .eq("id", params.id)
      .select("id, name")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    return {
      data: { id: data.id },
      log: { module: "litbang", activity: `Menghapus litbang ${quote(data.name)}` },
      revalidate: REVALIDATE,
    };
  },
});

const reorderSchema = z.object({ ids: z.array(z.uuid()) });

/**
 * POST /api/admin/litbang-template/reorder. The atomic RPC (0022) does the
 * real validation: it rejects an `ids` array that isn't exactly the set of
 * cards currently in the database (missing, duplicate, or foreign ids).
 */
export const reorderLitbangCards = mutation({
  permission: ["warta", "update"],
  schema: reorderSchema,
  async run({ input, supabase }) {
    const { error } = await supabase.rpc("reorder_litbang_categories", { p_ids: input.ids });
    if (error) throw rpcError(error);

    return {
      data: { ok: true },
      log: { module: "litbang", activity: "Mengubah urutan litbang" },
      revalidate: REVALIDATE,
    };
  },
});
