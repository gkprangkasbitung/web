import { kategoriBadgeStyle } from "@/lib/kegiatan-kategori";

/**
 * A kategori kegiatan pill: color + name text together, never color alone
 * (brief §14.4 — "warna tidak boleh jadi satu-satunya penanda").
 */
export function KategoriBadge({ nama, warna, className }: { nama: string; warna: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${className ?? ""}`}
      style={kategoriBadgeStyle(warna)}
    >
      {nama}
    </span>
  );
}
