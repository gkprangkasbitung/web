import type { CSSProperties } from "react";

/**
 * Fixed warna palette for Kategori Kegiatan (brief §14.4): a key stored in
 * the database, never a free hex (kept in sync by hand with
 * `kategori_kegiatan_warna_check`, 0033). Actual colors (light + dark
 * variants) are CSS custom properties in `globals.css`, `--kegiatan-{key}-*`.
 */
export const KEGIATAN_WARNA_PALETTE = ["hijau", "oranye", "biru", "merah", "abu", "kuning", "ungu", "teal"] as const;

export type KegiatanWarna = (typeof KEGIATAN_WARNA_PALETTE)[number];

export const KEGIATAN_WARNA_LABELS: Record<KegiatanWarna, string> = {
  hijau: "Hijau",
  oranye: "Oranye",
  biru: "Biru",
  merah: "Merah muda",
  abu: "Abu-abu",
  kuning: "Kuning",
  ungu: "Ungu",
  teal: "Teal",
};

export function isKegiatanWarna(value: string): value is KegiatanWarna {
  return (KEGIATAN_WARNA_PALETTE as readonly string[]).includes(value);
}

/** Tinted pill (category badge/legend text): background + matching foreground. */
export function kategoriBadgeStyle(warna: string): CSSProperties {
  const key = isKegiatanWarna(warna) ? warna : "abu";
  return { backgroundColor: `var(--kegiatan-${key}-bg)`, color: `var(--kegiatan-${key}-fg)` };
}

/** A solid dot/edge accent for the calendar grid, legend marker, and agenda rows. */
export function kategoriDotColor(warna: string): string {
  const key = isKegiatanWarna(warna) ? warna : "abu";
  return `var(--kegiatan-${key}-dot)`;
}
