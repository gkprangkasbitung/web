import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";

/**
 * Rows from the public kalender kegiatan functions (0033 `kegiatan_bulan` /
 * `kegiatan_detail` / `kegiatan_mendatang`), parsed with Zod: the generated
 * types mark every returned column non-null, but times and most text fields
 * are nullable (same reasoning as `lib/public-schedule.ts`).
 */

const isoDate = z.string().refine(isValidIsoDate);
const text = z.string().nullable();
const time = z.string().nullable();

const bulanRowSchema = z.object({
  id: z.string(),
  judul: z.string(),
  slug: z.string(),
  tanggal_mulai: isoDate,
  tanggal_selesai: isoDate,
  waktu_mulai: time,
  waktu_selesai: time,
  tempat: text,
  kategori_id: z.string(),
  kategori_nama: z.string(),
  kategori_warna: z.string(),
});

export type PublicKegiatanBulanRow = {
  id: string;
  judul: string;
  slug: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  kategoriId: string;
  kategoriNama: string;
  kategoriWarna: string;
};

export function parseKegiatanBulanRows(data: unknown): PublicKegiatanBulanRow[] {
  return z.array(bulanRowSchema).parse(data).map((row) => ({
    id: row.id,
    judul: row.judul,
    slug: row.slug,
    tanggalMulai: row.tanggal_mulai,
    tanggalSelesai: row.tanggal_selesai,
    waktuMulai: row.waktu_mulai,
    waktuSelesai: row.waktu_selesai,
    tempat: row.tempat,
    kategoriId: row.kategori_id,
    kategoriNama: row.kategori_nama,
    kategoriWarna: row.kategori_warna,
  }));
}

const mendatangRowSchema = z.object({
  id: z.string(),
  judul: z.string(),
  slug: z.string(),
  tanggal_mulai: isoDate,
  tanggal_selesai: isoDate,
  waktu_mulai: time,
  waktu_selesai: time,
  tempat: text,
  foto_path: text,
  foto_alt: text,
  kategori_nama: z.string(),
  kategori_warna: z.string(),
});

export type PublicKegiatanMendatangRow = {
  id: string;
  judul: string;
  slug: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  fotoPath: string | null;
  fotoAlt: string | null;
  kategoriNama: string;
  kategoriWarna: string;
};

export function parseKegiatanMendatangRows(data: unknown): PublicKegiatanMendatangRow[] {
  return z.array(mendatangRowSchema).parse(data).map((row) => ({
    id: row.id,
    judul: row.judul,
    slug: row.slug,
    tanggalMulai: row.tanggal_mulai,
    tanggalSelesai: row.tanggal_selesai,
    waktuMulai: row.waktu_mulai,
    waktuSelesai: row.waktu_selesai,
    tempat: row.tempat,
    fotoPath: row.foto_path,
    fotoAlt: row.foto_alt,
    kategoriNama: row.kategori_nama,
    kategoriWarna: row.kategori_warna,
  }));
}

const detailSchema = z.object({
  id: z.string(),
  judul: z.string(),
  slug: z.string(),
  kategori_nama: z.string(),
  kategori_warna: z.string(),
  tanggal_mulai: isoDate,
  tanggal_selesai: isoDate,
  waktu_mulai: time,
  waktu_selesai: time,
  tempat: text,
  maps_url: text,
  deskripsi: text,
  info_pendaftaran: text,
  foto_path: text,
  foto_alt: text,
  penyelenggara_komisi_nama: text,
  penyelenggara_komisi_slug: text,
});

export type PublicKegiatanDetail = {
  id: string;
  judul: string;
  slug: string;
  kategoriNama: string;
  kategoriWarna: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  mapsUrl: string | null;
  deskripsi: string | null;
  infoPendaftaran: string | null;
  fotoPath: string | null;
  fotoAlt: string | null;
  penyelenggaraKomisiNama: string | null;
  penyelenggaraKomisiSlug: string | null;
};

/** `kegiatan_detail` returns `null` (jsonb null) for a draft/unknown slug. */
export function parseKegiatanDetail(data: unknown): PublicKegiatanDetail | null {
  if (data === null) return null;
  const row = detailSchema.parse(data);
  return {
    id: row.id,
    judul: row.judul,
    slug: row.slug,
    kategoriNama: row.kategori_nama,
    kategoriWarna: row.kategori_warna,
    tanggalMulai: row.tanggal_mulai,
    tanggalSelesai: row.tanggal_selesai,
    waktuMulai: row.waktu_mulai,
    waktuSelesai: row.waktu_selesai,
    tempat: row.tempat,
    mapsUrl: row.maps_url,
    deskripsi: row.deskripsi,
    infoPendaftaran: row.info_pendaftaran,
    fotoPath: row.foto_path,
    fotoAlt: row.foto_alt,
    penyelenggaraKomisiNama: row.penyelenggara_komisi_nama,
    penyelenggaraKomisiSlug: row.penyelenggara_komisi_slug,
  };
}
