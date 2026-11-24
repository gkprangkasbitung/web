import { toCsv } from "@/lib/csv";

import { isSeri, type HasilKandidat } from "./types";

/**
 * The results CSV (brief §18.4, after close): one row per candidate per
 * contest, straight from hasil_suara, in its order. Cells are escaped
 * against CSV injection by `toCsv` (stage 5), since names come from an
 * imported file. Client-safe.
 */
export const HEADER_HASIL_CSV = ["Kontes", "Peringkat", "Nama", "Jumlah Suara", "Seri"] as const;

export function hasilKeCsv(hasil: readonly HasilKandidat[]): string {
  return toCsv(
    HEADER_HASIL_CSV,
    hasil.map((row) => [row.kontesNama, String(row.peringkat), row.namaTampilan, String(row.jumlahSuara), isSeri(hasil, row) ? "Seri" : ""]),
  );
}
