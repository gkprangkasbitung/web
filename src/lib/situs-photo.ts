/**
 * Photo rules shared by the server and the browser (brief §14.5). The server
 * enforces every one of them again; in the browser they only give early,
 * friendly feedback.
 */

import { supabaseEnv } from "@/lib/supabase/env";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_MB = 5;
export const MAX_PHOTO_EDGE = 2000;
export const MAX_ALT_LENGTH = 300;

/**
 * Vercel Functions refuse request bodies over 4.5 MB before the route runs,
 * so the browser shrinks a larger file (to MAX_PHOTO_EDGE) before sending
 * it. The server still validates and re-encodes whatever arrives.
 */
export const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PHOTO_ALT_REQUIRED = "Teks alternatif foto wajib diisi.";
export const PHOTO_TOO_LARGE = `Ukuran foto maksimal ${MAX_PHOTO_MB} MB.`;
export const PHOTO_BAD_TYPE = "Foto harus berupa JPEG, PNG, atau WebP.";

/** Multipart field names for one photo slot in a form (see `PhotoField`). */
export function photoFieldNames(name: string) {
  return { file: `${name}_file`, alt: `${name}_alt`, remove: `${name}_hapus` } as const;
}

/** The public URL of an object in the `situs` bucket (public read, brief §14.5). */
export function situsPhotoUrl(path: string): string {
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/situs/${path}`;
}
