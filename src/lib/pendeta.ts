import { today } from "@/lib/dates";

/**
 * Pendeta (brief §14.7): shared by the route handlers and the admin form
 * (no "server-only"). Year bounds are enforced again by a CHECK constraint
 * in 0031 (evaluated at write time, Asia/Jakarta); the rules here must stay
 * equivalent.
 */

export type PendetaRow = {
  id: string;
  nama: string;
  peran: string;
  tahun_mulai: number;
  tahun_selesai: number | null;
  foto_path: string | null;
  foto_alt: string | null;
  keterangan: string | null;
  tampil: boolean;
};

export const PENDETA_TAHUN_MIN = 1800;

/** "Current year" in Asia/Jakarta, matching 0031's `private.current_year_jakarta()`. */
export function currentYearJakarta(): number {
  return Number(today().slice(0, 4));
}

export function isMelayani(row: Pick<PendetaRow, "tahun_selesai">): boolean {
  return row.tahun_selesai === null;
}

export const PENDETA_STATUS_LABELS = { melayani: "Melayani", selesai: "Pernah melayani" } as const;
export type PendetaStatus = keyof typeof PENDETA_STATUS_LABELS;

export function pendetaStatus(row: Pick<PendetaRow, "tahun_selesai">): PendetaStatus {
  return isMelayani(row) ? "melayani" : "selesai";
}

/** "2019–sekarang" or "2010–2019" (brief §14.7). */
export function pendetaPeriode(row: Pick<PendetaRow, "tahun_mulai" | "tahun_selesai">): string {
  return `${row.tahun_mulai}–${row.tahun_selesai ?? "sekarang"}`;
}

export const PENDETA_DELETE_DESCRIPTION = "Tindakan ini tidak bisa dibatalkan.";
export const PENDETA_DELETE_SAMBUTAN_NOTE =
  'Pendeta ini dipakai di bagian Sambutan Profil Gereja — setelah dihapus, bagian itu akan kosong sampai dipilih ulang.';
