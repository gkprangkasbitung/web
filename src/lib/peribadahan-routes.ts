import "server-only";

import { z } from "zod";

import { ApiError, dbError, escapeLike, mutation, rpcError } from "@/lib/api-mutation";
import { isoDateSchema } from "@/lib/dates";
import { listPeopleForPicker, type PersonOptionRow } from "@/lib/jemaat-routes";
import {
  hasAttendance,
  hasField,
  layoutFor,
  SMKA_GROUP_KEYS,
  SMKA_GROUPS,
  SMKA_KEY,
  type SmkaGroupKey,
} from "@/lib/peribadahan";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { idParams, optionalText, requiredText } from "@/lib/validation";

export type PeribadahanCategoryOption = { id: string; key: string; name: string };

export type PeribadahanItemRow = {
  id: string;
  categoryId: string;
  categoryKey: string;
  categoryName: string;
  tanggal: string;
  jam: string | null;
  tempatId: string | null;
  tempatNama: string | null;
  wilayahId: string | null;
  wilayahNama: string | null;
  pelayanFirmanId: string | null;
  pelayanFirmanNama: string | null;
  liturgosId: string | null;
  liturgosNama: string | null;
  pemusikId: string | null;
  pemusikNama: string | null;
  tema: string | null;
  dpa: string | null;
  catatan: string | null;
  bahanAlkitab: string | null;
  kehadiranLakiLaki: number | null;
  kehadiranPerempuan: number | null;
  kehadiranAnak: number | null;
  sortOrder: number;
};

export type SmkaKelompokRow = {
  kelompok: SmkaGroupKey;
  pfId: string | null;
  pfNama: string | null;
  lakiLaki: number | null;
  perempuan: number | null;
};

export type PeribadahanOverview = {
  rows: PeribadahanItemRow[];
  categories: PeribadahanCategoryOption[];
  tempatOptions: { id: string; nama: string }[];
  wilayahOptions: { id: string; nama: string }[];
  /** itemId -> its 8 groups, for every Kebaktian SMKA row among `rows`. */
  smkaGroups: Map<string, SmkaKelompokRow[]>;
};

export type PeribadahanCategoryOverview = {
  category: PeribadahanCategoryOption;
  rows: PeribadahanItemRow[];
  /** itemId -> its 8 groups, populated only for Kebaktian SMKA. */
  smkaGroups: Map<string, SmkaKelompokRow[]>;
};

export type PeribadahanFormOptions = {
  tempatOptions: { id: string; nama: string }[];
  wilayahOptions: { id: string; nama: string }[];
  peopleOptions: PersonOptionRow[];
};

type RawItem = Database["public"]["Tables"]["peribadahan_items"]["Row"];

async function loadReferenceData(supabase: ServerSupabase) {
  const [tempatRes, wilayahRes, categoriesRes, jemaatRes] = await Promise.all([
    supabase.from("tempat").select("id, nama").order("sort_order"),
    supabase.from("wilayah").select("id, nama").order("sort_order"),
    supabase.from("peribadahan_categories").select("id, key, name").order("sort_order"),
    supabase.from("jemaat").select("id, nama"),
  ]);
  const error = tempatRes.error ?? wilayahRes.error ?? categoriesRes.error ?? jemaatRes.error;
  if (error || !tempatRes.data || !wilayahRes.data || !categoriesRes.data || !jemaatRes.data) {
    return { data: null, error: error?.message ?? "unknown" };
  }
  return {
    data: {
      tempatOptions: tempatRes.data,
      wilayahOptions: wilayahRes.data,
      categories: categoriesRes.data,
      jemaatMap: new Map(jemaatRes.data.map((j) => [j.id, j.nama])),
    },
    error: null,
  };
}

function toItemRow(
  item: RawItem,
  categoriesById: Map<string, PeribadahanCategoryOption>,
  tempatMap: Map<string, string>,
  wilayahMap: Map<string, string>,
  jemaatMap: Map<string, string>,
): PeribadahanItemRow {
  const category = categoriesById.get(item.category_id);
  return {
    id: item.id,
    categoryId: item.category_id,
    categoryKey: category?.key ?? "umum",
    categoryName: category?.name ?? "",
    tanggal: item.tanggal,
    jam: item.jam,
    tempatId: item.tempat_id,
    tempatNama: item.tempat_id ? (tempatMap.get(item.tempat_id) ?? null) : null,
    wilayahId: item.wilayah_id,
    wilayahNama: item.wilayah_id ? (wilayahMap.get(item.wilayah_id) ?? null) : null,
    pelayanFirmanId: item.pelayan_firman_id,
    pelayanFirmanNama: item.pelayan_firman_id ? (jemaatMap.get(item.pelayan_firman_id) ?? null) : null,
    liturgosId: item.liturgos_id,
    liturgosNama: item.liturgos_id ? (jemaatMap.get(item.liturgos_id) ?? null) : null,
    pemusikId: item.pemusik_id,
    pemusikNama: item.pemusik_id ? (jemaatMap.get(item.pemusik_id) ?? null) : null,
    tema: item.tema,
    dpa: item.dpa,
    catatan: item.catatan,
    bahanAlkitab: item.bahan_alkitab,
    kehadiranLakiLaki: item.kehadiran_laki_laki,
    kehadiranPerempuan: item.kehadiran_perempuan,
    kehadiranAnak: item.kehadiran_anak,
    sortOrder: item.sort_order,
  };
}

/** SMKA groups for every id in `itemIds`, keyed by item id. Pass only SMKA item ids. */
async function loadSmkaGroups(
  supabase: ServerSupabase,
  itemIds: string[],
  jemaatMap: Map<string, string>,
): Promise<{ data: Map<string, SmkaKelompokRow[]> | null; error: string | null }> {
  const smkaGroups = new Map<string, SmkaKelompokRow[]>();
  if (itemIds.length === 0) return { data: smkaGroups, error: null };

  const { data, error } = await supabase.from("peribadahan_smka_kelompok").select("*").in("item_id", itemIds);
  if (error) return { data: null, error: error.message };

  for (const row of data ?? []) {
    const list = smkaGroups.get(row.item_id) ?? [];
    list.push({
      kelompok: row.kelompok as SmkaGroupKey,
      pfId: row.pf_id,
      pfNama: row.pf_id ? (jemaatMap.get(row.pf_id) ?? null) : null,
      lakiLaki: row.laki_laki,
      perempuan: row.perempuan,
    });
    smkaGroups.set(row.item_id, list);
  }
  return { data: smkaGroups, error: null };
}

/**
 * Everything `/admin/peribadahan` needs (brief §9.5, §9.2: bounded, loaded in
 * full). `search` narrows the rows through `search_peribadahan_item_ids`
 * first (a real server round trip, safe from PostgREST `.or()` injection);
 * facets, sort, and the date-range filter then run client-side over whatever
 * that search returned, so their counts stay accurate.
 */
export async function loadPeribadahanOverview(
  supabase: ServerSupabase,
  search: string,
): Promise<{ data: PeribadahanOverview | null; error: string | null }> {
  const refs = await loadReferenceData(supabase);
  if (!refs.data) return { data: null, error: refs.error };
  const { categories, tempatOptions, wilayahOptions, jemaatMap } = refs.data;

  let itemsQuery = supabase
    .from("peribadahan_items")
    .select("*")
    .order("tanggal", { ascending: false })
    .order("sort_order", { ascending: true });

  const trimmed = search.trim();
  if (trimmed) {
    const { data: matches, error } = await supabase.rpc("search_peribadahan_item_ids", {
      p_search: escapeLike(trimmed),
    });
    if (error) return { data: null, error: error.message };
    const ids = matches.map((m) => m.id);
    if (ids.length === 0) {
      return { data: { rows: [], categories, tempatOptions, wilayahOptions, smkaGroups: new Map() }, error: null };
    }
    itemsQuery = itemsQuery.in("id", ids);
  }

  const { data: items, error } = await itemsQuery;
  if (error || !items) return { data: null, error: error?.message ?? "unknown" };

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const tempatMap = new Map(tempatOptions.map((t) => [t.id, t.nama]));
  const wilayahMap = new Map(wilayahOptions.map((w) => [w.id, w.nama]));
  const rows = items.map((item) => toItemRow(item, categoriesById, tempatMap, wilayahMap, jemaatMap));

  const smkaItemIds = rows.filter((row) => row.categoryKey === SMKA_KEY).map((row) => row.id);
  const groupsRes = await loadSmkaGroups(supabase, smkaItemIds, jemaatMap);
  if (!groupsRes.data) return { data: null, error: groupsRes.error };

  return { data: { rows, categories, tempatOptions, wilayahOptions, smkaGroups: groupsRes.data }, error: null };
}

/** `/admin/peribadahan/[key]`. `data: null, error: null` means the key doesn't exist; the page 404s. */
export async function loadPeribadahanCategoryOverview(
  supabase: ServerSupabase,
  key: string,
): Promise<{ data: PeribadahanCategoryOverview | null; error: string | null }> {
  const categoryRes = await supabase.from("peribadahan_categories").select("id, key, name").eq("key", key).maybeSingle();
  if (categoryRes.error) return { data: null, error: categoryRes.error.message };
  if (!categoryRes.data) return { data: null, error: null };

  const refs = await loadReferenceData(supabase);
  if (!refs.data) return { data: null, error: refs.error };
  const { categories, tempatOptions, wilayahOptions, jemaatMap } = refs.data;
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const tempatMap = new Map(tempatOptions.map((t) => [t.id, t.nama]));
  const wilayahMap = new Map(wilayahOptions.map((w) => [w.id, w.nama]));

  const itemsRes = await supabase
    .from("peribadahan_items")
    .select("*")
    .eq("category_id", categoryRes.data.id)
    .order("tanggal", { ascending: false })
    .order("sort_order", { ascending: true });
  if (itemsRes.error || !itemsRes.data) return { data: null, error: itemsRes.error?.message ?? "unknown" };

  const rows = itemsRes.data.map((item) => toItemRow(item, categoriesById, tempatMap, wilayahMap, jemaatMap));

  const groupsRes = await loadSmkaGroups(supabase, key === SMKA_KEY ? rows.map((r) => r.id) : [], jemaatMap);
  if (!groupsRes.data) return { data: null, error: groupsRes.error };

  return { data: { category: categoryRes.data, rows, smkaGroups: groupsRes.data }, error: null };
}

/** The dropdown/combobox options the add/edit dialogs need. */
export async function loadPeribadahanFormOptions(
  supabase: ServerSupabase,
): Promise<{ data: PeribadahanFormOptions | null; error: string | null }> {
  const [tempatRes, wilayahRes, peopleOptions] = await Promise.all([
    supabase.from("tempat").select("id, nama").order("sort_order"),
    supabase.from("wilayah").select("id, nama").order("sort_order"),
    listPeopleForPicker(supabase),
  ]);
  if (tempatRes.error || wilayahRes.error || !tempatRes.data || !wilayahRes.data) {
    return { data: null, error: (tempatRes.error ?? wilayahRes.error)?.message ?? "unknown" };
  }
  return { data: { tempatOptions: tempatRes.data, wilayahOptions: wilayahRes.data, peopleOptions }, error: null };
}

const NOT_FOUND = "Jadwal tidak ditemukan.";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Waktu tidak valid.")
  .nullish()
  .transform((value) => value || null);

const attendanceSchema = z.number().int("Jumlah harus bilangan bulat.").min(0, "Jumlah tidak boleh negatif.").nullish();

const smkaKelompokInputSchema = z.object({
  kelompok: z.enum(SMKA_GROUP_KEYS),
  pfId: z.uuid().nullish(),
  lakiLaki: attendanceSchema,
  perempuan: attendanceSchema,
});

const createSchema = z.object({
  categoryKey: requiredText("Jenis wajib diisi.", 50),
  tanggal: isoDateSchema,
  jam: timeSchema,
});

/**
 * All fields across every category. The server only forwards the ones the
 * row's own category layout allows (lib/peribadahan.ts); everything else is
 * sent to the RPC as null, whatever the client included (brief §9.5: a
 * category's disallowed fields must never be stored, e.g. kehadiran_laki_laki
 * for Kebaktian Perempuan).
 */
const updateSchema = z.object({
  jam: timeSchema,
  tempatId: z.uuid().nullish(),
  wilayahId: z.uuid().nullish(),
  pelayanFirmanId: z.uuid().nullish(),
  liturgosId: z.uuid().nullish(),
  pemusikId: z.uuid().nullish(),
  tema: optionalText(200),
  dpa: optionalText(300),
  catatan: optionalText(1000),
  kehadiranLakiLaki: attendanceSchema,
  kehadiranPerempuan: attendanceSchema,
  kehadiranAnak: attendanceSchema,
  bahanAlkitab: optionalText(200),
  smkaKelompok: z.array(smkaKelompokInputSchema).length(8).nullish(),
});

function toSmkaJson(rows: z.infer<typeof smkaKelompokInputSchema>[]) {
  return rows.map((row) => {
    const group = SMKA_GROUPS.find((g) => g.key === row.kelompok);
    return {
      kelompok: row.kelompok,
      pf_id: group?.hasPf ? (row.pfId ?? null) : null,
      laki_laki: row.lakiLaki ?? null,
      perempuan: row.perempuan ?? null,
    };
  });
}

/** `peribadahan_categories(key, name)` embeds as a single nullable object (child -> parent FK). */
function categoryOf(row: { peribadahan_categories: unknown }): { key: string; name: string } | null {
  return row.peribadahan_categories as { key: string; name: string } | null;
}

/** POST /api/admin/peribadahan ("Tambah Jadwal"). */
export const createPeribadahanItem = mutation({
  permission: ["warta", "update"],
  schema: createSchema,
  status: 201,
  async run({ input, supabase }) {
    const category = await supabase
      .from("peribadahan_categories")
      .select("id, key, name")
      .eq("key", input.categoryKey)
      .maybeSingle();
    if (category.error) throw dbError(category.error);
    if (!category.data) throw new ApiError(400, "Jenis tidak dikenal.");

    // sort_order = the number of rows already on that date, across every category (brief §9.5, §11).
    const countRes = await supabase
      .from("peribadahan_items")
      .select("id", { count: "exact", head: true })
      .eq("tanggal", input.tanggal);
    if (countRes.error) throw dbError(countRes.error);

    const { data, error } = await supabase
      .from("peribadahan_items")
      .insert({ category_id: category.data.id, tanggal: input.tanggal, jam: input.jam, sort_order: countRes.count ?? 0 })
      .select("id")
      .single();
    if (error) throw dbError(error);

    return {
      data: { id: data.id },
      log: { module: "peribadahan", activity: `Menambah jadwal ${category.data.name} tanggal ${input.tanggal}` },
      revalidate: ["/admin/peribadahan", `/admin/peribadahan/${category.data.key}`, "/admin/warta"],
    };
  },
});

/** PATCH /api/admin/peribadahan/[id]. */
export const updatePeribadahanItem = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: updateSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase
      .from("peribadahan_items")
      .select("tanggal, peribadahan_categories(key, name)")
      .eq("id", params.id)
      .maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const category = categoryOf(current.data);
    const key = category?.key ?? "umum";
    const categoryName = category?.name ?? "";
    const layout = layoutFor(key);

    const args: Database["public"]["Functions"]["update_peribadahan_item"]["Args"] = {
      p_id: params.id,
      p_jam: input.jam ?? undefined,
      p_tempat_id: (hasField(key, "tempat") ? input.tempatId : null) ?? undefined,
      p_wilayah_id: (hasField(key, "wilayah") ? input.wilayahId : null) ?? undefined,
      p_pelayan_firman_id: (hasField(key, "pelayanFirman") ? input.pelayanFirmanId : null) ?? undefined,
      p_liturgos_id: (hasField(key, "liturgos") ? input.liturgosId : null) ?? undefined,
      p_pemusik_id: (hasField(key, "pemusik") ? input.pemusikId : null) ?? undefined,
      p_tema: (hasField(key, "tema") ? input.tema : null) ?? undefined,
      p_dpa: (hasField(key, "dpa") ? input.dpa : null) ?? undefined,
      p_catatan: (layout.notesLabel ? input.catatan : null) ?? undefined,
      p_kehadiran_laki_laki: (hasAttendance(key, "lakiLaki") ? input.kehadiranLakiLaki : null) ?? undefined,
      p_kehadiran_perempuan: (hasAttendance(key, "perempuan") ? input.kehadiranPerempuan : null) ?? undefined,
      p_kehadiran_anak: (hasAttendance(key, "anak") ? input.kehadiranAnak : null) ?? undefined,
      p_bahan_alkitab: (hasField(key, "bahanAlkitab") ? input.bahanAlkitab : null) ?? undefined,
      p_smka_kelompok: hasField(key, "smkaGrid") && input.smkaKelompok ? toSmkaJson(input.smkaKelompok) : undefined,
    };

    const { error } = await supabase.rpc("update_peribadahan_item", args);
    if (error) throw rpcError(error);

    return {
      data: { id: params.id },
      log: { module: "peribadahan", activity: `Mengubah jadwal ${categoryName} tanggal ${current.data.tanggal}` },
      revalidate: ["/admin/peribadahan", `/admin/peribadahan/${key}`, "/admin/warta"],
    };
  },
});

/** DELETE /api/admin/peribadahan/[id]. */
export const deletePeribadahanItem = mutation({
  permission: ["warta", "update"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const current = await supabase
      .from("peribadahan_items")
      .select("tanggal, peribadahan_categories(key, name)")
      .eq("id", params.id)
      .maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    const category = categoryOf(current.data);
    const key = category?.key ?? "umum";
    const categoryName = category?.name ?? "";

    const { error } = await supabase.from("peribadahan_items").delete().eq("id", params.id);
    if (error) throw dbError(error, { notFound: NOT_FOUND });

    return {
      data: { id: params.id },
      log: { module: "peribadahan", activity: `Menghapus jadwal ${categoryName} tanggal ${current.data.tanggal}` },
      revalidate: ["/admin/peribadahan", `/admin/peribadahan/${key}`, "/admin/warta"],
    };
  },
});
