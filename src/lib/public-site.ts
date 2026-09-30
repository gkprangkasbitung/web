import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { isValidIsoDate, today } from "@/lib/dates";
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

const nullableText = z.string().nullable();
const profilSchema = z.object({
  hero_judul: nullableText,
  hero_subjudul: nullableText,
  hero_foto_path: nullableText,
  hero_foto_alt: nullableText,
  sambutan_teks: nullableText,
  sambutan_pendeta_nama: nullableText,
  sambutan_pendeta_peran: nullableText,
  sambutan_pendeta_foto_path: nullableText,
  sambutan_pendeta_foto_alt: nullableText,
  sejarah: nullableText,
  visi: nullableText,
  misi: z.array(z.string()),
  sejarah_foto_path: nullableText,
  sejarah_foto_alt: nullableText,
  alamat: nullableText,
  telepon: nullableText,
  email: nullableText,
  jam_sekretariat: nullableText,
  maps_url: nullableText,
  instagram_url: nullableText,
  youtube_url: nullableText,
  facebook_url: nullableText,
  nama_bank: nullableText,
  nomor_rekening: nullableText,
  atas_nama: nullableText,
  qris_foto_path: nullableText,
  qris_foto_alt: nullableText,
  linimasa: z.array(z.object({ tahun: z.string(), teks: z.string() })),
});

export type PublicProfilRow = z.infer<typeof profilSchema>;

/**
 * Profil Gereja for Beranda, Tentang Kami, Kontak, and the footer (brief
 * §14.6), through `public_profil_gereja()` (0029), which returns only the
 * fields the site shows. Wrapped in React `cache` so the layout (footer)
 * and the page share one load per request.
 */
export const loadPublicProfil = cache(async (): Promise<Result<PublicProfilRow>> => {
  await connection();
  const { data, error } = await createPublicClient().rpc("public_profil_gereja");
  if (error) return failure("profil gereja", error);
  const parsed = profilSchema.safeParse(data);
  if (!parsed.success) return failure("profil gereja", parsed.error);
  return { data: parsed.data, error: null };
});

// ---------------------------------------------------------------------------
// Pelayanan, Majelis, Kegiatan (brief §14.2-14.4, stage 11b)
// ---------------------------------------------------------------------------

export type PublicPelayananRow = { id: string; nama: string; deskripsi: string | null; jadwal: string | null; icon: string };
export type PublicMajelisRow = { id: string; nama: string; jabatan: string; foto_path: string | null; foto_alt: string | null };
export type PublicKegiatanRow = {
  id: string;
  judul: string;
  tanggal: string;
  waktu: string | null;
  tempat: string | null;
  foto_path: string | null;
  foto_alt: string | null;
};

/** Beranda's "Pelayanan" grid: active cards, in the admin's own sort order (brief §14.2). */
export async function loadPublicPelayanan(): Promise<Result<PublicPelayananRow[]>> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("pelayanan")
    .select("id, nama, deskripsi, jadwal, icon")
    .eq("aktif", true)
    .order("sort_order")
    .order("created_at")
    .order("id");
  if (error) return failure("pelayanan", error);
  return { data: data as PublicPelayananRow[], error: null };
}

/** Tentang Kami's "Majelis Jemaat" grid: active cards, in the admin's own sort order (brief §14.3). */
export async function loadPublicMajelis(): Promise<Result<PublicMajelisRow[]>> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("majelis")
    .select("id, nama, jabatan, foto_path, foto_alt")
    .eq("aktif", true)
    .order("sort_order")
    .order("created_at")
    .order("id");
  if (error) return failure("majelis", error);
  return { data: data as PublicMajelisRow[], error: null };
}

/** Beranda's "Kegiatan mendatang" grid: the next 3 published, tanggal >= today in WIB (brief §14.4). */
export async function loadPublicKegiatanMendatang(): Promise<Result<PublicKegiatanRow[]>> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("kegiatan")
    .select("id, judul, tanggal, waktu, tempat, foto_path, foto_alt")
    .eq("status", "published")
    .gte("tanggal", today())
    .order("tanggal", { ascending: true })
    .order("id")
    .limit(3);
  if (error) return failure("kegiatan mendatang", error);
  return { data: data as PublicKegiatanRow[], error: null };
}

// ---------------------------------------------------------------------------
// Pendeta (brief §14.7, stage 11c)
// ---------------------------------------------------------------------------

const pendetaRowSchema = z.object({
  id: z.string(),
  nama: z.string(),
  peran: z.string(),
  tahun_mulai: z.number(),
  tahun_selesai: z.number().nullable(),
  foto_path: nullableText,
  foto_alt: nullableText,
  keterangan: nullableText,
});

export type PublicPendetaRow = z.infer<typeof pendetaRowSchema>;

/**
 * Tentang Kami's "Pendeta Jemaat" / "Pendeta yang pernah melayani" sections
 * (brief §14.7), through `public_pendeta()` (0031), already in the default
 * order (currently serving first, then by tahun_selesai desc, tahun_mulai desc).
 */
export async function loadPublicPendeta(): Promise<Result<PublicPendetaRow[]>> {
  await connection();
  const { data, error } = await createPublicClient().rpc("public_pendeta");
  if (error) return failure("pendeta", error);
  const parsed = z.array(pendetaRowSchema).safeParse(data);
  if (!parsed.success) return failure("pendeta", parsed.error);
  return { data: parsed.data, error: null };
}
