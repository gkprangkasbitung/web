/** Shared, client-safe pieces of the Warta module (brief §9.4). */

export const WARTA_STATUS = ["draft", "published"] as const;
export type WartaStatus = (typeof WARTA_STATUS)[number];

export const WARTA_STATUS_LABELS: Record<WartaStatus, string> = {
  published: "Published",
  draft: "Draft",
};

export const KITAB_RENUNGAN_PLACEHOLDER = "Mis. Mazmur 23:1-6";

export const WARTA_CREATE_NOTE =
  "Bidang Peribadahan, Litbang, Sarana & Dana, dan Kesaksian dapat diisi setelah warta dibuat.";

export const WARTA_DELETE_DESCRIPTION =
  "Semua data Litbang dan Kesaksian khusus warta ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.";

/**
 * Brief §9.4: lowercase, strip diacritics, each run of other characters
 * becomes "-", trim dashes. "2025-11-30" + "Minggu Adven I" ->
 * "2025-11-30-minggu-adven-i". Matches the DB's warta_slug_format_check (0026).
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function wartaSlug(tanggalKebaktian: string, judulKebaktian: string): string {
  return slugify(`${tanggalKebaktian}-${judulKebaktian}`);
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 4 random base-36 characters, appended as "-xxxx" when a slug is taken. */
export function randomSlugSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  // 256 % 36 != 0, so this is very slightly biased; fine for a collision suffix.
  return Array.from(bytes, (byte) => BASE36[byte % 36]).join("");
}

export type WartaListRow = {
  id: string;
  slug: string;
  status: WartaStatus;
  tanggalKebaktian: string;
  judulKebaktian: string;
  temaKebaktian: string | null;
};

export type WartaInfo = {
  tanggalKebaktian: string;
  judulKebaktian: string;
  temaKebaktian: string | null;
  renunganJudul: string | null;
  renunganKitab: string | null;
  renunganIsi: string | null;
  renunganSumber: string | null;
};

export type WartaDetail = WartaInfo & {
  id: string;
  slug: string;
  status: WartaStatus;
  publishedAt: string | null;
  updatedAt: string;
};

export type WartaLitbangItemRow = { id: string; name: string; deskripsi: string | null };

export type WartaKesaksianItemRow = { id: string; judul: string; deskripsi: string | null };
