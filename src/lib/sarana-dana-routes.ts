import "server-only";

import { z } from "zod";

import { ApiError, dbError, mutation } from "@/lib/api-mutation";
import { isoDateSchema } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { listPeopleForPicker, type PersonOptionRow } from "@/lib/jemaat-routes";
import { TRANSACTION_TIPE, type TransactionTipe } from "@/lib/sarana-dana";
import type { ServerSupabase } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation";

export type SaranaDanaItemRow = {
  id: string;
  key: string;
  name: string;
  keterangan: string | null;
  saldo: number;
};

/** `/admin/sarana-dana`: the 3 fixed items with their current balance (brief §9.7). */
export async function loadSaranaDanaOverview(
  supabase: ServerSupabase,
): Promise<{ data: SaranaDanaItemRow[] | null; error: string | null }> {
  const { data, error } = await supabase.from("sarana_dana_balances").select("id, key, name, keterangan, saldo").order("name");
  if (error || !data) return { data: null, error: error?.message ?? "unknown" };
  return {
    data: data.map((row) => ({
      id: row.id ?? "",
      key: row.key ?? "",
      name: row.name ?? "",
      keterangan: row.keterangan,
      saldo: row.saldo ?? 0,
    })),
    error: null,
  };
}

export type TransactionRow = {
  id: string;
  itemId: string;
  tanggal: string;
  tipe: TransactionTipe;
  jumlah: number;
  jemaatId: string | null;
  jemaatNama: string | null;
  keterangan: string | null;
};

export type SaranaDanaLedger = {
  item: { id: string; key: string; name: string; keterangan: string | null; saldoAwal: number; saldo: number };
  rows: TransactionRow[];
};

/**
 * `/admin/sarana-dana/[key]`. `range` restricts the query itself (server-side,
 * brief §9.7) — a ledger can grow across years, unlike the other bounded
 * lists in §9.2. `data: null, error: null` means the key doesn't exist; the
 * page 404s.
 */
export async function loadSaranaDanaLedger(
  supabase: ServerSupabase,
  key: string,
  range: { start?: string; end?: string },
): Promise<{ data: SaranaDanaLedger | null; error: string | null }> {
  const [itemRes, balanceRes] = await Promise.all([
    supabase.from("sarana_dana_items").select("id, key, name, keterangan, saldo_awal").eq("key", key).maybeSingle(),
    supabase.from("sarana_dana_balances").select("saldo").eq("key", key).maybeSingle(),
  ]);
  if (itemRes.error) return { data: null, error: itemRes.error.message };
  if (!itemRes.data) return { data: null, error: null };
  if (balanceRes.error) return { data: null, error: balanceRes.error.message };

  let query = supabase
    .from("sarana_dana_transactions")
    .select("*")
    .eq("item_id", itemRes.data.id)
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });
  if (range.start) query = query.gte("tanggal", range.start);
  if (range.end) query = query.lte("tanggal", range.end);

  const { data: transactions, error } = await query;
  if (error || !transactions) return { data: null, error: error?.message ?? "unknown" };

  const jemaatIds = [...new Set(transactions.map((t) => t.jemaat_id).filter((id): id is string => Boolean(id)))];
  const jemaatMap = new Map<string, string>();
  if (jemaatIds.length > 0) {
    const { data: jemaatRows } = await supabase.from("jemaat").select("id, nama").in("id", jemaatIds);
    for (const j of jemaatRows ?? []) jemaatMap.set(j.id, j.nama);
  }

  return {
    data: {
      item: {
        id: itemRes.data.id,
        key: itemRes.data.key,
        name: itemRes.data.name,
        keterangan: itemRes.data.keterangan,
        saldoAwal: itemRes.data.saldo_awal,
        saldo: balanceRes.data?.saldo ?? 0,
      },
      rows: transactions.map((t) => ({
        id: t.id,
        itemId: t.item_id,
        tanggal: t.tanggal,
        tipe: t.tipe as TransactionTipe,
        jumlah: t.jumlah,
        jemaatId: t.jemaat_id,
        jemaatNama: t.jemaat_id ? (jemaatMap.get(t.jemaat_id) ?? null) : null,
        keterangan: t.keterangan,
      })),
    },
    error: null,
  };
}

/** The Jemaat picker options for a Persembahan Bulanan transaction. */
export async function loadSaranaDanaFormOptions(supabase: ServerSupabase): Promise<PersonOptionRow[]> {
  return listPeopleForPicker(supabase);
}

const keyParams = z.object({ key: z.string().min(1) });
const transactionParams = z.object({ key: z.string().min(1), id: z.uuid() });

/**
 * Both UI actions send only the field they own (Overview's Edit dialog:
 * `keterangan`; the ledger's inline Saldo Awal field: `saldoAwal`) — each key
 * stays `undefined`, not coerced to `null`, when the client omits it, so
 * `run()` below can tell "not sent" from "cleared".
 */
const updateItemSchema = z
  .object({
    keterangan: z
      .string()
      .trim()
      .max(500, "Maksimal 500 karakter.")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    saldoAwal: z.number("Saldo awal harus berupa angka.").min(0, "Saldo awal tidak boleh negatif.").optional(),
  })
  .refine((value) => value.keterangan !== undefined || value.saldoAwal !== undefined, {
    message: "Tidak ada perubahan untuk disimpan.",
  });

const UPPER_BOUND = 10_000_000_000;

const transactionSchema = z.object({
  tanggal: isoDateSchema,
  tipe: z.enum(TRANSACTION_TIPE),
  jemaatId: z.uuid().nullish(),
  jumlah: z
    .number("Jumlah harus berupa angka.")
    .int("Jumlah harus bilangan bulat.")
    .min(0, "Jumlah tidak boleh negatif.")
    .max(UPPER_BOUND, "Jumlah terlalu besar. Periksa kembali angkanya."),
  keterangan: optionalText(500),
});

/** PATCH /api/admin/sarana-dana/[id] (Overview's "Edit" dialog, or the ledger's inline Saldo Awal). */
export const updateSaranaDanaItem = mutation({
  permission: ["warta", "update"],
  params: z.object({ id: z.uuid() }),
  schema: updateItemSchema,
  notFound: "Item tidak ditemukan.",
  async run({ input, params, supabase }) {
    const fields: { keterangan?: string | null; saldo_awal?: number } = {};
    if (input.keterangan !== undefined) fields.keterangan = input.keterangan;
    if (input.saldoAwal !== undefined) fields.saldo_awal = input.saldoAwal;

    const { data, error } = await supabase
      .from("sarana_dana_items")
      .update(fields)
      .eq("id", params.id)
      .select("id, key, name, keterangan, saldo_awal")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: "Item tidak ditemukan." });
    if (!data) throw new ApiError(404, "Item tidak ditemukan.");

    const activity =
      input.saldoAwal !== undefined
        ? `Mengubah saldo awal ${data.name} menjadi ${formatRupiah(data.saldo_awal)}`
        : `Mengubah keterangan ${data.name}`;

    return {
      data,
      log: { module: "sarana_dana", activity },
      revalidate: ["/admin/sarana-dana", `/admin/sarana-dana/${data.key}`, "/admin/warta"],
    };
  },
});

/** POST /api/admin/sarana-dana/[key]/transaksi ("Tambah Transaksi"). */
export const createTransaction = mutation({
  permission: ["warta", "update"],
  params: keyParams,
  schema: transactionSchema,
  status: 201,
  notFound: "Item tidak ditemukan.",
  async run({ input, params, user, supabase }) {
    const item = await supabase.from("sarana_dana_items").select("id, key, name").eq("key", params.key).maybeSingle();
    if (item.error) throw dbError(item.error, { notFound: "Item tidak ditemukan." });
    if (!item.data) throw new ApiError(404, "Item tidak ditemukan.");

    // The DB trigger (0025) is what actually enforces the Persembahan Bulanan
    // rules; this insert just forwards what the form collected.
    const { data, error } = await supabase
      .from("sarana_dana_transactions")
      .insert({
        item_id: item.data.id,
        tanggal: input.tanggal,
        tipe: input.tipe,
        jemaat_id: input.jemaatId ?? null,
        jumlah: input.jumlah,
        keterangan: input.keterangan,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw dbError(error);

    return {
      data,
      log: {
        module: "sarana_dana",
        activity: `Menambah transaksi ${formatRupiah(data.jumlah)} untuk ${item.data.name} tanggal ${data.tanggal}`,
      },
      revalidate: ["/admin/sarana-dana", `/admin/sarana-dana/${item.data.key}`, "/admin/warta"],
    };
  },
});

/** PATCH /api/admin/sarana-dana/[key]/transaksi/[id]. */
export const updateTransaction = mutation({
  permission: ["warta", "update"],
  params: transactionParams,
  schema: transactionSchema,
  notFound: "Transaksi tidak ditemukan.",
  async run({ input, params, supabase }) {
    const item = await supabase.from("sarana_dana_items").select("id, key, name").eq("key", params.key).maybeSingle();
    if (item.error) throw dbError(item.error, { notFound: "Item tidak ditemukan." });
    if (!item.data) throw new ApiError(404, "Item tidak ditemukan.");

    const { data, error } = await supabase
      .from("sarana_dana_transactions")
      .update({
        tanggal: input.tanggal,
        tipe: input.tipe,
        jemaat_id: input.jemaatId ?? null,
        jumlah: input.jumlah,
        keterangan: input.keterangan,
      })
      .eq("id", params.id)
      .eq("item_id", item.data.id)
      .select()
      .maybeSingle();
    if (error) throw dbError(error, { notFound: "Transaksi tidak ditemukan." });
    if (!data) throw new ApiError(404, "Transaksi tidak ditemukan.");

    return {
      data,
      log: {
        module: "sarana_dana",
        activity: `Mengubah transaksi ${formatRupiah(data.jumlah)} untuk ${item.data.name} tanggal ${data.tanggal}`,
      },
      revalidate: ["/admin/sarana-dana", `/admin/sarana-dana/${item.data.key}`, "/admin/warta"],
    };
  },
});

/** DELETE /api/admin/sarana-dana/[key]/transaksi/[id]. */
export const deleteTransaction = mutation({
  permission: ["warta", "update"],
  params: transactionParams,
  notFound: "Transaksi tidak ditemukan.",
  async run({ params, supabase }) {
    const item = await supabase.from("sarana_dana_items").select("id, key, name").eq("key", params.key).maybeSingle();
    if (item.error) throw dbError(item.error, { notFound: "Item tidak ditemukan." });
    if (!item.data) throw new ApiError(404, "Item tidak ditemukan.");

    const { data, error } = await supabase
      .from("sarana_dana_transactions")
      .delete()
      .eq("id", params.id)
      .eq("item_id", item.data.id)
      .select("jumlah, tanggal")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: "Transaksi tidak ditemukan." });
    if (!data) throw new ApiError(404, "Transaksi tidak ditemukan.");

    return {
      data: { id: params.id },
      log: {
        module: "sarana_dana",
        activity: `Menghapus transaksi ${formatRupiah(data.jumlah)} untuk ${item.data.name} tanggal ${data.tanggal}`,
      },
      revalidate: ["/admin/sarana-dana", `/admin/sarana-dana/${item.data.key}`, "/admin/warta"],
    };
  },
});
