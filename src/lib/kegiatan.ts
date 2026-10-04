import { formatDateRangeShort, formatDateRangeLong, type IsoDate } from "@/lib/dates";
import { formatJam } from "@/lib/peribadahan";

export type KegiatanStatus = "draft" | "published";

export const KEGIATAN_STATUS_LABELS: Record<KegiatanStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export type KegiatanRow = {
  id: string;
  judul: string;
  slug: string;
  tanggal_mulai: IsoDate;
  tanggal_selesai: IsoDate;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  tempat: string | null;
  maps_url: string | null;
  deskripsi: string | null;
  info_pendaftaran: string | null;
  foto_path: string | null;
  foto_alt: string | null;
  kategori_id: string;
  penyelenggara_komisi_id: string | null;
  status: KegiatanStatus;
};

export type KategoriKegiatanRow = {
  id: string;
  nama: string;
  warna: string;
  sort_order: number;
};

export const KEGIATAN_DELETE_DESCRIPTION = "Tindakan ini tidak bisa dibatalkan.";
export const KATEGORI_KEGIATAN_DELETE_DESCRIPTION = "Kategori yang masih dipakai oleh kegiatan tidak bisa dihapus.";

/** The admin dialog's "Sepanjang hari" toggle is on exactly when both times are empty. */
export function isSepanjangHari(waktuMulai: string | null, waktuSelesai: string | null): boolean {
  return !waktuMulai && !waktuSelesai;
}

/** "19.00 – 21.00 WIB", "19.00 WIB" (no end time), or "Sepanjang hari". */
export function formatWaktuRange(waktuMulai: string | null, waktuSelesai: string | null): string {
  if (isSepanjangHari(waktuMulai, waktuSelesai)) return "Sepanjang hari";
  if (waktuMulai && waktuSelesai) return `${formatJam(waktuMulai)} – ${formatJam(waktuSelesai)} WIB`;
  return `${formatJam(waktuMulai ?? waktuSelesai)} WIB`;
}

/** "16 – 18 Oktober 2026" etc. (brief §14.4), for cards, tables, and the calendar panel. */
export function formatTanggalRange(tanggalMulai: IsoDate, tanggalSelesai: IsoDate): string {
  return formatDateRangeShort(tanggalMulai, tanggalSelesai);
}

/** Same range, with weekday names, for the detail page's title band. */
export function formatTanggalRangeLong(tanggalMulai: IsoDate, tanggalSelesai: IsoDate): string {
  return formatDateRangeLong(tanggalMulai, tanggalSelesai);
}
