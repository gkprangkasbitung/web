import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { parseFullScheduleRows, parseUpcomingScheduleRows, type PublicScheduleRow } from "@/lib/public-schedule";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Data for the public site (brief §8), read as `anon` through the cookie-less
 * client only:
 * - `warta`, `warta_litbang_items`, `warta_kesaksian_items` directly, which RLS
 *   limits to published warta (0019). The queries also filter on
 *   `status = 'published'`, so a policy change can't expose a draft here;
 * - the schedule and the finance report only through the public functions
 *   (0020, 0027). Never `jemaat`, `keluarga`, or transactions directly.
 *
 * Every loader calls `connection()` first: the pages render per request and
 * are never prerendered at build time or cached, so "Tarik ke Draft" and any
 * schedule or transaction change show on the next request, even a change
 * made outside the app (docs/progress.md, stage 9b).
 */

export type Result<T> = { data: T; error: null } | { data: null; error: string };

const WARTA_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIST_COLUMNS = "slug, tanggal_kebaktian, judul_kebaktian, tema_kebaktian";

export type PublicWartaListItem = {
  slug: string;
  tanggalKebaktian: string;
  judulKebaktian: string;
  temaKebaktian: string | null;
};

export type PublicFinanceItem = {
  key: string;
  name: string;
  saldoAwal: number;
  pemasukan: number;
  pengeluaran: number;
  saldoAkhir: number;
};

export type PublicWarta = PublicWartaListItem & {
  renunganJudul: string | null;
  renunganKitab: string | null;
  renunganIsi: string | null;
  renunganSumber: string | null;
  schedule: PublicScheduleRow[];
  litbang: { id: string; name: string; deskripsi: string | null }[];
  finance: PublicFinanceItem[];
  kesaksian: { id: string; judul: string; deskripsi: string | null }[];
};

const listRowSchema = z.object({
  slug: z.string(),
  tanggal_kebaktian: z.string().refine(isValidIsoDate),
  judul_kebaktian: z.string(),
  tema_kebaktian: z.string().nullable(),
});

// numeric may arrive as a JSON number or a string; coerce either way.
const money = z.coerce.number().refine(Number.isFinite);
const financeRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  saldo_awal: money,
  pemasukan: money,
  pengeluaran: money,
  saldo_akhir: money,
});

function toListItem(row: z.infer<typeof listRowSchema>): PublicWartaListItem {
  return {
    slug: row.slug,
    tanggalKebaktian: row.tanggal_kebaktian,
    judulKebaktian: row.judul_kebaktian,
    temaKebaktian: row.tema_kebaktian,
  };
}

function failure(label: string, error: unknown): { data: null; error: string } {
  console.error(`[public] ${label} failed:`, error);
  return { data: null, error: label };
}

/** `/warta`: published warta, newest tanggal kebaktian first. */
export async function loadPublicWartaList(): Promise<Result<PublicWartaListItem[]>> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("warta")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .order("tanggal_kebaktian", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return failure("warta list", error);
  const parsed = z.array(listRowSchema).safeParse(data);
  if (!parsed.success) return failure("warta list", parsed.error);
  return { data: parsed.data.map(toListItem), error: null };
}

/** Beranda's latest-warta card, in the list's own order. `data: null` when none is published. */
export async function loadLatestPublicWarta(): Promise<Result<PublicWartaListItem | null>> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("warta")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .order("tanggal_kebaktian", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return failure("latest warta", error);
  if (!data) return { data: null, error: null };
  const parsed = listRowSchema.safeParse(data);
  if (!parsed.success) return failure("latest warta", parsed.error);
  return { data: toListItem(parsed.data), error: null };
}

const wartaRowSchema = listRowSchema.extend({
  id: z.string(),
  renungan_judul: z.string().nullable(),
  renungan_kitab: z.string().nullable(),
  renungan_isi: z.string().nullable(),
  renungan_sumber: z.string().nullable(),
});

/**
 * `/warta/[slug]` with all six sections (brief §8). `null` for a draft, an
 * unknown slug, or a malformed one (the page 404s). Throws when the database
 * fails, so the error boundary shows instead of a half-empty warta.
 * Wrapped in React `cache` so `generateMetadata` and the page share one load.
 */
export const loadPublicWarta = cache(async (slug: string): Promise<PublicWarta | null> => {
  await connection();
  if (!WARTA_SLUG.test(slug)) return null;

  const supabase = createPublicClient();
  const { data: row, error } = await supabase
    .from("warta")
    .select(`id, ${LIST_COLUMNS}, renungan_judul, renungan_kitab, renungan_isi, renungan_sumber`)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`[public] warta ${slug}: ${error.message}`);
  if (!row) return null;
  const warta = wartaRowSchema.parse(row);

  const [scheduleRes, financeRes, litbangRes, kesaksianRes] = await Promise.all([
    supabase.rpc("public_warta_schedule", { p_slug: slug }),
    supabase.rpc("public_warta_finance", { p_slug: slug }),
    supabase
      .from("warta_litbang_items")
      .select("id, name, deskripsi")
      .eq("warta_id", warta.id)
      .order("sort_order")
      .order("id"),
    supabase
      .from("warta_kesaksian_items")
      .select("id, judul, deskripsi")
      .eq("warta_id", warta.id)
      .order("sort_order")
      .order("id"),
  ]);
  const loadError = scheduleRes.error ?? financeRes.error ?? litbangRes.error ?? kesaksianRes.error;
  if (loadError) throw new Error(`[public] warta ${slug} sections: ${loadError.message}`);

  return {
    ...toListItem(warta),
    renunganJudul: warta.renungan_judul,
    renunganKitab: warta.renungan_kitab,
    renunganIsi: warta.renungan_isi,
    renunganSumber: warta.renungan_sumber,
    schedule: parseFullScheduleRows(scheduleRes.data),
    finance: z
      .array(financeRowSchema)
      .parse(financeRes.data)
      .map((item) => ({
        key: item.key,
        name: item.name,
        saldoAwal: item.saldo_awal,
        pemasukan: item.pemasukan,
        pengeluaran: item.pengeluaran,
        saldoAkhir: item.saldo_akhir,
      })),
    litbang: litbangRes.data ?? [],
    kesaksian: kesaksianRes.data ?? [],
  };
});

/** Beranda: the Minggu–Sabtu week containing today in WIB (`public_jadwal_pekan_ini`). */
export async function loadJadwalPekanIni(): Promise<Result<PublicScheduleRow[]>> {
  await connection();
  const { data, error } = await createPublicClient().rpc("public_jadwal_pekan_ini");
  if (error) return failure("jadwal pekan ini", error);
  try {
    return { data: parseFullScheduleRows(data), error: null };
  } catch (parseError) {
    return failure("jadwal pekan ini", parseError);
  }
}

/** Jadwal Ibadah: today through today + 6 in WIB (`public_jadwal_mendatang`, 0027). */
export async function loadJadwalMendatang(): Promise<Result<PublicScheduleRow[]>> {
  await connection();
  const { data, error } = await createPublicClient().rpc("public_jadwal_mendatang");
  if (error) return failure("jadwal mendatang", error);
  try {
    return { data: parseUpcomingScheduleRows(data), error: null };
  } catch (parseError) {
    return failure("jadwal mendatang", parseError);
  }
}
