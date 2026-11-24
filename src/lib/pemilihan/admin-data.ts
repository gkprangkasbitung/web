import "server-only";

import { z } from "zod";

import type { ServerSupabase } from "@/lib/supabase/server";

import type { BarisImporRow, JemaatPilihan, PemilihanBantu, PemilihBantu, Pencatat, PemilihanRow, PesertaRow } from "./admin-types";
import { PemilihanError, pemilihanError } from "./data";
import { PEMILIHAN_STATUS, toKandidat, type Kandidat, type PemilihanStatus } from "./types";

/**
 * Loaders for the panitia's pages (brief §18.4–18.5, stage 14b), always with
 * the signed-in user's session: RLS (pemilihan:read) and the 0040
 * functions decide what comes back. Like `data.ts`, an unexpected database
 * error is logged by its code only.
 */

const PEMILIHAN_COLUMNS =
  "id, nama, periode, status, dibuka_pada, ditutup_pada, tampilkan_hasil_saat_berjalan, waktu_dibuka, waktu_ditutup, waktu_diumumkan, created_at";

type PemilihanDbRow = {
  id: string;
  nama: string;
  periode: string | null;
  status: string;
  dibuka_pada: string | null;
  ditutup_pada: string | null;
  tampilkan_hasil_saat_berjalan: boolean;
  waktu_dibuka: string | null;
  waktu_ditutup: string | null;
  waktu_diumumkan: string | null;
  created_at: string;
};

const ringkasanSchema = z.object({
  pemilihan_id: z.string(),
  total_pemilih: z.number().int(),
  sudah_memilih: z.number().int(),
  persen: z.coerce.number(),
  baris_belum_beres: z.number().int(),
});

function status(value: string): PemilihanStatus {
  return (PEMILIHAN_STATUS as readonly string[]).includes(value) ? (value as PemilihanStatus) : "draft";
}

function toRow(row: PemilihanDbRow, ringkasan: z.infer<typeof ringkasanSchema> | undefined): PemilihanRow {
  return {
    id: row.id,
    nama: row.nama,
    periode: row.periode,
    status: status(row.status),
    dibukaPada: row.dibuka_pada,
    ditutupPada: row.ditutup_pada,
    tampilkanHasil: row.tampilkan_hasil_saat_berjalan,
    waktuDibuka: row.waktu_dibuka,
    waktuDitutup: row.waktu_ditutup,
    waktuDiumumkan: row.waktu_diumumkan,
    createdAt: row.created_at,
    totalPemilih: ringkasan?.total_pemilih ?? 0,
    sudahMemilih: ringkasan?.sudah_memilih ?? 0,
    persen: ringkasan?.persen ?? 0,
    barisBelumBeres: ringkasan?.baris_belum_beres ?? 0,
  };
}

async function loadRingkasan(supabase: ServerSupabase) {
  const { data, error } = await supabase.rpc("pemilihan_ringkasan");
  if (error) throw pemilihanError(error, "pemilihan_ringkasan");
  const parsed = z.array(ringkasanSchema).safeParse(data ?? []);
  if (!parsed.success) throw pemilihanError({ code: "shape", message: "" }, "pemilihan_ringkasan");
  return new Map(parsed.data.map((row) => [row.pemilihan_id, row]));
}

/** `/admin/pemilihan`: every election, newest schedule first, with turnout. */
export async function loadPemilihanList(supabase: ServerSupabase): Promise<PemilihanRow[]> {
  const [list, ringkasan] = await Promise.all([
    supabase
      .from("pemilihan")
      .select(PEMILIHAN_COLUMNS)
      .order("dibuka_pada", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
    loadRingkasan(supabase),
  ]);
  if (list.error) throw pemilihanError(list.error, "pemilihan");
  return (list.data as PemilihanDbRow[]).map((row) => toRow(row, ringkasan.get(row.id)));
}

/** One election, or null when it doesn't exist (or isn't readable). */
export async function loadPemilihan(supabase: ServerSupabase, id: string): Promise<PemilihanRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [one, ringkasan] = await Promise.all([
    supabase.from("pemilihan").select(PEMILIHAN_COLUMNS).eq("id", id).maybeSingle(),
    loadRingkasan(supabase),
  ]);
  if (one.error) throw pemilihanError(one.error, "pemilihan");
  return one.data ? toRow(one.data as PemilihanDbRow, ringkasan.get(id)) : null;
}

export async function loadPencatat(supabase: ServerSupabase, id: string): Promise<Pencatat> {
  const { data, error } = await supabase.rpc("pemilihan_pencatat", { p_pemilihan_id: id });
  if (error) throw pemilihanError(error, "pemilihan_pencatat");
  const row = data?.[0];
  return {
    dibuatOleh: row?.dibuat_oleh ?? null,
    dibukaOleh: row?.dibuka_oleh ?? null,
    ditutupOleh: row?.ditutup_oleh ?? null,
    diumumkanOleh: row?.diumumkan_oleh ?? null,
  };
}

const IMPOR_COLUMNS =
  "id, urutan, sumber, kelompok_wilayah, baris, nomor, nama, domisili, tanda_memilih, tanda_dipilih, tanda_tidak_dipilih, usia, keterangan, kategori, calon_jemaat_ids, catatan, jemaat_id, dapat_memilih, dapat_dipilih, perlu_konfirmasi_memilih, dikeluarkan, beres";

type ImporDbRow = {
  id: string;
  urutan: number;
  sumber: string;
  kelompok_wilayah: string;
  baris: number;
  nomor: string | null;
  nama: string;
  domisili: string | null;
  tanda_memilih: string;
  tanda_dipilih: string;
  tanda_tidak_dipilih: string;
  usia: string | null;
  keterangan: string | null;
  kategori: string;
  calon_jemaat_ids: string[];
  catatan: string[];
  jemaat_id: string | null;
  dapat_memilih: boolean | null;
  dapat_dipilih: boolean | null;
  perlu_konfirmasi_memilih: boolean;
  dikeluarkan: boolean;
  beres: boolean | null;
};

export function toBarisImpor(row: ImporDbRow): BarisImporRow {
  return {
    id: row.id,
    urutan: row.urutan,
    sumber: row.sumber,
    kelompokWilayah: row.kelompok_wilayah,
    baris: row.baris,
    nomor: row.nomor,
    nama: row.nama,
    domisili: row.domisili,
    tandaMemilih: row.tanda_memilih as BarisImporRow["tandaMemilih"],
    tandaDipilih: row.tanda_dipilih as BarisImporRow["tandaDipilih"],
    tandaTidakDipilih: row.tanda_tidak_dipilih as BarisImporRow["tandaTidakDipilih"],
    usia: row.usia,
    keterangan: row.keterangan,
    kategori: row.kategori as BarisImporRow["kategori"],
    calonJemaatIds: row.calon_jemaat_ids ?? [],
    catatan: row.catatan ?? [],
    jemaatId: row.jemaat_id,
    dapatMemilih: row.dapat_memilih,
    dapatDipilih: row.dapat_dipilih,
    perluKonfirmasiMemilih: row.perlu_konfirmasi_memilih,
    dikeluarkan: row.dikeluarkan,
    beres: row.beres === true,
  };
}

/** The last import's rows, in file/sheet/row order. */
export async function loadBarisImpor(supabase: ServerSupabase, id: string): Promise<BarisImporRow[]> {
  const { data, error } = await supabase.from("pemilihan_impor_baris").select(IMPOR_COLUMNS).eq("pemilihan_id", id).order("urutan");
  if (error) throw pemilihanError(error, "pemilihan_impor_baris");
  return (data as ImporDbRow[]).map(toBarisImpor);
}

/** The election's peserta, by name, with whether each has a Portal Jemaat account. */
export async function loadPeserta(supabase: ServerSupabase, id: string): Promise<PesertaRow[]> {
  const [peserta, akun] = await Promise.all([
    supabase
      .from("pemilihan_peserta")
      .select("jemaat_id, nama_tampilan, dapat_memilih, dapat_dipilih, kelompok_wilayah, keterangan, alasan_tidak_dapat_dipilih")
      .eq("pemilihan_id", id),
    supabase.rpc("pemilihan_peserta_akun", { p_pemilihan_id: id }),
  ]);
  if (peserta.error) throw pemilihanError(peserta.error, "pemilihan_peserta");
  if (akun.error) throw pemilihanError(akun.error, "pemilihan_peserta_akun");
  const akunByJemaat = new Map((akun.data ?? []).map((row) => [row.jemaat_id, row]));
  return peserta.data
    .map((row) => ({
      jemaatId: row.jemaat_id,
      namaTampilan: row.nama_tampilan,
      dapatMemilih: row.dapat_memilih,
      dapatDipilih: row.dapat_dipilih,
      kelompokWilayah: row.kelompok_wilayah,
      keterangan: row.keterangan,
      alasanTidakDapatDipilih: row.alasan_tidak_dapat_dipilih,
      punyaAkun: akunByJemaat.get(row.jemaat_id)?.punya_akun === true,
      akunJemaatId: akunByJemaat.get(row.jemaat_id)?.akun_jemaat_id ?? null,
      username: akunByJemaat.get(row.jemaat_id)?.username ?? null,
    }))
    .sort((a, b) => a.namaTampilan.localeCompare(b.namaTampilan, "id"));
}

/** Data Jemaat for matching and the picker (pemilihan:update). */
export async function loadJemaatPilihan(supabase: ServerSupabase): Promise<JemaatPilihan[]> {
  const { data, error } = await supabase.rpc("pemilihan_daftar_jemaat");
  if (error) throw pemilihanError(error, "pemilihan_daftar_jemaat");
  return (data ?? []).map((row) => ({ id: row.id, nama: row.nama, alamat: row.alamat, wilayah: row.wilayah }));
}

/** The election's candidates by name (pemilihan:read or pemilihan_bantu:create). */
export async function loadKandidatAdmin(supabase: ServerSupabase, id: string): Promise<Kandidat[]> {
  const { data, error } = await supabase.rpc("pemilihan_kandidat_admin", { p_pemilihan_id: id });
  if (error) throw pemilihanError(error, "pemilihan_kandidat_admin");
  return (data ?? []).map(toKandidat);
}

/** The election as the assisted-voting page shows it, or null when unknown. */
export async function loadPemilihanUntukBantu(supabase: ServerSupabase, id: string): Promise<PemilihanBantu | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.rpc("pemilihan_untuk_bantu", { p_pemilihan_id: id });
  if (error) {
    const mapped = pemilihanError(error, "pemilihan_untuk_bantu");
    if (mapped.reason === "tidak_ditemukan") return null;
    throw mapped;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    nama: row.nama,
    periode: row.periode,
    status: status(row.status),
    dibukaPada: row.dibuka_pada,
    ditutupPada: row.ditutup_pada,
  };
}

/** Voters not yet voted, without the panitia's own record (pemilihan_bantu:create, only while dibuka). */
export async function loadBelumMemilih(supabase: ServerSupabase, id: string): Promise<PemilihBantu[]> {
  const { data, error } = await supabase.rpc("pemilihan_belum_memilih", { p_pemilihan_id: id });
  if (error) throw pemilihanError(error, "pemilihan_belum_memilih");
  return (data ?? []).map((row) => ({
    jemaatId: row.jemaat_id,
    namaTampilan: row.nama_tampilan,
    kelompokWilayah: row.kelompok_wilayah,
  }));
}

export { PemilihanError };
