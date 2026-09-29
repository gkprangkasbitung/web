import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError, type RevalidateTarget } from "@/lib/api-mutation";
import { isoDateSchema } from "@/lib/dates";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";
import {
  randomSlugSuffix,
  WARTA_STATUS,
  wartaSlug,
  type WartaDetail,
  type WartaKesaksianItemRow,
  type WartaListRow,
  type WartaLitbangItemRow,
  type WartaStatus,
} from "@/lib/warta";

const NOT_FOUND = "Warta tidak ditemukan.";
const LITBANG_NOT_FOUND = "Litbang tidak ditemukan.";
const KESAKSIAN_NOT_FOUND = "Item kesaksian tidak ditemukan.";
const CONFLICT =
  "Warta ini sudah diubah orang lain sejak kamu membukanya. Muat ulang halaman untuk melihat versi terbaru, lalu simpan lagi.";

// Warta changes show on the list, the editor (a child route), and the dashboard's "warta terbaru".
const REVALIDATE: readonly RevalidateTarget[] = [{ path: "/admin/warta", type: "layout" }, "/admin"];

/** Brief §7: `Membuat warta "Minggu Adven I" (2025-11-30)`. */
function wartaLabel(warta: { judul_kebaktian: string; tanggal_kebaktian: string }): string {
  return `${quote(warta.judul_kebaktian)} (${warta.tanggal_kebaktian})`;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

type RawWartaListRow = {
  id: string;
  slug: string;
  status: string;
  tanggal_kebaktian: string;
  judul_kebaktian: string;
  tema_kebaktian: string | null;
};

function toListRow(row: RawWartaListRow): WartaListRow {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status as WartaStatus,
    tanggalKebaktian: row.tanggal_kebaktian,
    judulKebaktian: row.judul_kebaktian,
    temaKebaktian: row.tema_kebaktian,
  };
}

const LIST_COLUMNS = "id, slug, status, tanggal_kebaktian, judul_kebaktian, tema_kebaktian";

/** `/admin/warta`: every warta, newest tanggal kebaktian first (brief §9.4, §12.7). */
export async function loadWartaList(
  supabase: ServerSupabase,
): Promise<{ data: WartaListRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from("warta")
    .select(LIST_COLUMNS)
    .order("tanggal_kebaktian", { ascending: false })
    .order("created_at", { ascending: false });
  if (error || !data) return { data: null, error: error?.message ?? "unknown" };
  return { data: data.map(toListRow), error: null };
}

/** The dashboard's "warta terbaru" (brief §9.3), in the list's own order. */
export async function loadLatestWarta(
  supabase: ServerSupabase,
): Promise<{ data: WartaListRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("warta")
    .select(LIST_COLUMNS)
    .order("tanggal_kebaktian", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data ? toListRow(data) : null, error: null };
}

export type WartaEditorData = {
  warta: WartaDetail;
  litbang: WartaLitbangItemRow[];
  kesaksian: WartaKesaksianItemRow[];
};

/** `/admin/warta/[id]`. `data: null, error: null` means no such warta; the page 404s. */
export async function loadWartaEditor(
  supabase: ServerSupabase,
  id: string,
): Promise<{ data: WartaEditorData | null; error: string | null }> {
  const [wartaRes, litbangRes, kesaksianRes] = await Promise.all([
    supabase.from("warta").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("warta_litbang_items")
      .select("id, name, deskripsi")
      .eq("warta_id", id)
      .order("sort_order")
      .order("id"),
    supabase
      .from("warta_kesaksian_items")
      .select("id, judul, deskripsi")
      .eq("warta_id", id)
      .order("sort_order")
      .order("id"),
  ]);
  const error = wartaRes.error ?? litbangRes.error ?? kesaksianRes.error;
  if (error) return { data: null, error: error.message };
  if (!wartaRes.data) return { data: null, error: null };

  const w = wartaRes.data;
  return {
    data: {
      warta: {
        id: w.id,
        slug: w.slug,
        status: w.status as WartaStatus,
        publishedAt: w.published_at,
        updatedAt: w.updated_at,
        tanggalKebaktian: w.tanggal_kebaktian,
        judulKebaktian: w.judul_kebaktian,
        temaKebaktian: w.tema_kebaktian,
        renunganJudul: w.renungan_judul,
        renunganKitab: w.renungan_kitab,
        renunganIsi: w.renungan_isi,
        renunganSumber: w.renungan_sumber,
      },
      litbang: litbangRes.data ?? [],
      kesaksian: kesaksianRes.data ?? [],
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Warta: create, update (fields or status), delete
// ---------------------------------------------------------------------------

const infoSchema = z.object({
  tanggalKebaktian: isoDateSchema,
  judulKebaktian: requiredText("Judul Kebaktian wajib diisi.", 200),
  temaKebaktian: optionalText(300),
  renunganJudul: optionalText(200),
  renunganKitab: optionalText(200),
  renunganIsi: optionalText(20000),
  renunganSumber: optionalText(300),
});

type InfoInput = z.infer<typeof infoSchema>;

function infoColumns(input: InfoInput) {
  return {
    tanggal_kebaktian: input.tanggalKebaktian,
    judul_kebaktian: input.judulKebaktian,
    tema_kebaktian: input.temaKebaktian,
    renungan_judul: input.renunganJudul,
    renungan_kitab: input.renunganKitab,
    renungan_isi: input.renunganIsi,
    renungan_sumber: input.renunganSumber,
  };
}

/** Brief §9.4: one plain attempt, then up to 5 retries with a random "-xxxx" suffix. */
const SLUG_RETRIES = 5;

/**
 * POST /api/admin/warta ("Buat Warta Baru"). `create_warta` (0022) inserts
 * the draft and its Litbang snapshot in one transaction, so the brief's 207
 * "Warta dibuat, tapi gagal menyalin Litbang" can't happen. The slug relies
 * on the unique constraint (retry on 23505), not a check-then-insert.
 */
export const createWarta = mutation({
  permission: ["warta", "create"],
  schema: infoSchema,
  status: 201,
  async run({ input, supabase }) {
    const base = wartaSlug(input.tanggalKebaktian, input.judulKebaktian);

    for (let attempt = 0; attempt <= SLUG_RETRIES; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomSlugSuffix()}`;
      const { data: id, error } = await supabase.rpc("create_warta", {
        p_slug: slug,
        p_tanggal_kebaktian: input.tanggalKebaktian,
        p_judul_kebaktian: input.judulKebaktian,
        p_tema_kebaktian: input.temaKebaktian ?? undefined,
        p_renungan_judul: input.renunganJudul ?? undefined,
        p_renungan_kitab: input.renunganKitab ?? undefined,
        p_renungan_isi: input.renunganIsi ?? undefined,
        p_renungan_sumber: input.renunganSumber ?? undefined,
      });
      if (!error) {
        return {
          data: { id, slug },
          log: {
            module: "warta",
            activity: `Membuat warta ${wartaLabel({ judul_kebaktian: input.judulKebaktian, tanggal_kebaktian: input.tanggalKebaktian })}`,
          },
          revalidate: REVALIDATE,
        };
      }
      // Only a slug collision is retried; the raw 23505 text is never shown.
      if (error.code === "23505" && error.message.includes("warta_slug_key")) continue;
      if (error.code === "23505") throw dbError(error);
      throw rpcError(error);
    }

    throw new ApiError(400, "Gagal membuat alamat unik untuk warta ini. Coba simpan lagi.");
  },
});

const statusSchema = z.object({ status: z.enum(WARTA_STATUS, "Status tidak valid.") });

const updateInfoSchema = infoSchema.extend({
  /** The `updated_at` the form was loaded with (optimistic concurrency). */
  expectedUpdatedAt: z.string("Data yang dikirim tidak valid.").min(1, "Data yang dikirim tidak valid."),
});

/**
 * Brief §10: PATCH takes either `{ status }` (Terbitkan / Tarik ke Draft) or
 * the Informasi & Renungan fields. The branch is picked by the presence of
 * `status`, so a validation failure reports the field's own message instead
 * of a generic union error.
 */
const updateSchema = z.unknown().transform((body, ctx) => {
  const isStatus = typeof body === "object" && body !== null && "status" in body;
  const result = isStatus ? statusSchema.safeParse(body) : updateInfoSchema.safeParse(body);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    return z.NEVER;
  }
  return result.data;
});

/** PATCH /api/admin/warta/[id]. published_at and updated_at are set by the DB trigger (0026), never from the client. */
export const updateWarta = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: updateSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    if ("status" in input) {
      const { data, error } = await supabase
        .from("warta")
        .update({ status: input.status })
        .eq("id", params.id)
        .select("id, status, published_at, updated_at, judul_kebaktian, tanggal_kebaktian")
        .maybeSingle();
      if (error) throw dbError(error, { notFound: NOT_FOUND });
      if (!data) throw new ApiError(404, NOT_FOUND);

      const activity =
        input.status === "published"
          ? `Mempublikasikan warta ${wartaLabel(data)}`
          : `Menarik warta ${wartaLabel(data)} ke draft`;
      return {
        data: { id: data.id, status: data.status, publishedAt: data.published_at, updatedAt: data.updated_at },
        log: { module: "warta", activity },
        revalidate: REVALIDATE,
      };
    }

    // Compare-and-swap on updated_at in the UPDATE itself: no gap between
    // "is it still the version I loaded?" and the write.
    const { data, error } = await supabase
      .from("warta")
      .update(infoColumns(input))
      .eq("id", params.id)
      .eq("updated_at", input.expectedUpdatedAt)
      .select("id, status, published_at, updated_at, judul_kebaktian, tanggal_kebaktian")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) {
      const exists = await supabase.from("warta").select("id").eq("id", params.id).maybeSingle();
      if (exists.error) throw dbError(exists.error, { notFound: NOT_FOUND });
      if (!exists.data) throw new ApiError(404, NOT_FOUND);
      throw new ApiError(400, CONFLICT);
    }

    return {
      data: { id: data.id, status: data.status, publishedAt: data.published_at, updatedAt: data.updated_at },
      log: { module: "warta", activity: `Mengubah warta ${wartaLabel(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/**
 * DELETE /api/admin/warta/[id] (`warta:delete`). The FKs cascade only to this
 * warta's own Litbang and Kesaksian rows; schedule rows and transactions are
 * read by date range, never linked, so they stay (brief §11).
 */
export const deleteWarta = mutation({
  permission: ["warta", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase
      .from("warta")
      .delete()
      .eq("id", params.id)
      .select("id, judul_kebaktian, tanggal_kebaktian")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    return {
      data: { id: data.id },
      log: { module: "warta", activity: `Menghapus warta ${wartaLabel(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Bidang Litbang: this warta's own copy, deskripsi only
// ---------------------------------------------------------------------------

const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });

async function loadWartaForChild(supabase: ServerSupabase, id: string) {
  const { data, error } = await supabase
    .from("warta")
    .select("id, judul_kebaktian, tanggal_kebaktian")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error, { notFound: NOT_FOUND });
  if (!data) throw new ApiError(404, NOT_FOUND);
  return data;
}

const litbangSchema = z.object({ deskripsi: optionalText(2000) });

/** PATCH /api/admin/warta/[id]/litbang/[itemId]. The name is fixed (DB trigger, 0026); the template is never touched. */
export const updateWartaLitbangItem = mutation({
  permission: ["warta", "update"],
  params: itemParams,
  schema: litbangSchema,
  notFound: LITBANG_NOT_FOUND,
  async run({ input, params, supabase }) {
    const warta = await loadWartaForChild(supabase, params.id);

    const { data, error } = await supabase
      .from("warta_litbang_items")
      .update({ deskripsi: input.deskripsi })
      .eq("id", params.itemId)
      .eq("warta_id", params.id)
      .select("id, name, deskripsi")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: LITBANG_NOT_FOUND });
    if (!data) throw new ApiError(404, LITBANG_NOT_FOUND);

    return {
      data,
      log: { module: "warta", activity: `Mengubah litbang ${quote(data.name)} pada warta ${wartaLabel(warta)}` },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Bidang Kesaksian dan Keesaan: an open-ended list per warta
// ---------------------------------------------------------------------------

const kesaksianSchema = z.object({
  judul: requiredText("Judul wajib diisi.", 200),
  deskripsi: optionalText(5000),
});

/** New items go last: max(sort_order) + 1 within the warta (stage 4's convention). */
async function nextKesaksianSortOrder(supabase: ServerSupabase, wartaId: string): Promise<number> {
  const { data, error } = await supabase
    .from("warta_kesaksian_items")
    .select("sort_order")
    .eq("warta_id", wartaId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? data.sort_order + 1 : 0;
}

/** POST /api/admin/warta/[id]/kesaksian ("Tambah Item Baru"). */
export const createKesaksianItem = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: kesaksianSchema,
  status: 201,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const warta = await loadWartaForChild(supabase, params.id);
    const sort_order = await nextKesaksianSortOrder(supabase, params.id);

    const { data, error } = await supabase
      .from("warta_kesaksian_items")
      .insert({ warta_id: params.id, judul: input.judul, deskripsi: input.deskripsi, sort_order })
      .select("id, judul, deskripsi")
      .single();
    if (error) throw dbError(error, { notFound: NOT_FOUND });

    return {
      data,
      log: { module: "warta", activity: `Menambah kesaksian ${quote(data.judul)} pada warta ${wartaLabel(warta)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/warta/[id]/kesaksian/[itemId]. */
export const updateKesaksianItem = mutation({
  permission: ["warta", "update"],
  params: itemParams,
  schema: kesaksianSchema,
  notFound: KESAKSIAN_NOT_FOUND,
  async run({ input, params, supabase }) {
    const warta = await loadWartaForChild(supabase, params.id);

    const { data, error } = await supabase
      .from("warta_kesaksian_items")
      .update({ judul: input.judul, deskripsi: input.deskripsi })
      .eq("id", params.itemId)
      .eq("warta_id", params.id)
      .select("id, judul, deskripsi")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: KESAKSIAN_NOT_FOUND });
    if (!data) throw new ApiError(404, KESAKSIAN_NOT_FOUND);

    return {
      data,
      log: { module: "warta", activity: `Mengubah kesaksian ${quote(data.judul)} pada warta ${wartaLabel(warta)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** DELETE /api/admin/warta/[id]/kesaksian/[itemId]. */
export const deleteKesaksianItem = mutation({
  permission: ["warta", "update"],
  params: itemParams,
  notFound: KESAKSIAN_NOT_FOUND,
  async run({ params, supabase }) {
    const warta = await loadWartaForChild(supabase, params.id);

    const { data, error } = await supabase
      .from("warta_kesaksian_items")
      .delete()
      .eq("id", params.itemId)
      .eq("warta_id", params.id)
      .select("id, judul")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: KESAKSIAN_NOT_FOUND });
    if (!data) throw new ApiError(404, KESAKSIAN_NOT_FOUND);

    return {
      data: { id: data.id },
      log: { module: "warta", activity: `Menghapus kesaksian ${quote(data.judul)} dari warta ${wartaLabel(warta)}` },
      revalidate: REVALIDATE,
    };
  },
});
