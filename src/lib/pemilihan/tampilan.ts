import { formatTimestamp } from "@/lib/dates";

import type { PemilihanRow, StatusAksi } from "./admin-types";

/** How the panitia's pages word things. Client-safe. */

/** "30,0%" */
export function formatPersen(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

/** "12 dari 40 (30,0%)" */
export function formatPartisipasi(sudah: number, total: number, persen: number): string {
  return `${sudah} dari ${total} (${formatPersen(persen)})`;
}

/** "7 Des 2026, 08.00 WIB – 7 Des 2026, 17.00 WIB", or "Belum diatur". */
export function formatJadwal(dibukaPada: string | null, ditutupPada: string | null): string {
  if (!dibukaPada || !ditutupPada) return "Belum diatur";
  return `${formatTimestamp(dibukaPada)} – ${formatTimestamp(ditutupPada)}`;
}

export const LABEL_AKSI: Record<StatusAksi, string> = {
  buka: "Buka Pemilihan",
  tutup: "Tutup Pemilihan",
  umumkan: "Umumkan Hasil",
};

/** What confirming each status change does, for its ConfirmDialog. */
export function konsekuensiAksi(aksi: StatusAksi, row: Pick<PemilihanRow, "dibukaPada" | "ditutupPada" | "totalPemilih">): string[] {
  switch (aksi) {
    case "buka":
      return [
        "Daftar peserta akan dikunci dan tidak bisa diimpor atau diubah lagi.",
        "Nama, periode, dan jadwal juga tidak bisa diubah lagi.",
        `${row.totalPemilih} pemilih bisa memberikan suara pada ${formatJadwal(row.dibukaPada, row.ditutupPada)}.`,
      ];
    case "tutup":
      return [
        "Pemilih tidak bisa memberikan suara lagi, termasuk lewat panitia (bantu memilih).",
        "Penutupan tidak bisa dibatalkan. Setelah ditutup, hasil bisa diekspor dan berita acara bisa dicetak.",
      ];
    case "umumkan":
      return [
        "Hasil akan tampil untuk semua jemaat yang punya akun di Portal Jemaat.",
        "Pengumuman tidak bisa dibatalkan.",
      ];
  }
}

/** Why "Buka" is disabled, or null when the election may open (the database checks again). */
export function alasanBelumBisaDibuka(row: Pick<PemilihanRow, "status" | "dibukaPada" | "ditutupPada" | "totalPemilih" | "barisBelumBeres">): string | null {
  if (row.status !== "draft") return null;
  if (row.barisBelumBeres > 0) return `Masih ada ${row.barisBelumBeres} baris impor yang belum beres.`;
  if (!row.dibukaPada || !row.ditutupPada) return "Atur jadwal dibuka dan ditutup dulu.";
  if (row.totalPemilih === 0) return "Belum ada peserta yang dapat memilih. Impor daftar peserta dulu.";
  return null;
}

/** A file-name-safe slug: "Pemilihan Majelis 2027" → "pemilihan-majelis-2027". */
export function slugFile(nama: string): string {
  return (
    nama
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pemilihan"
  );
}
