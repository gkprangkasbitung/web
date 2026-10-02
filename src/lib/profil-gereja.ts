/**
 * Profil Gereja (brief §14.1): shared by the route handlers and the admin
 * form (no "server-only"). Every rule here is enforced again by a CHECK
 * constraint in 0029; the patterns must stay equivalent to those.
 */

import { z } from "zod";

import type { Database } from "@/types/database";
import type { PendetaRow } from "@/lib/pendeta";

export type ProfilGerejaRow = Database["public"]["Tables"]["profil_gereja"]["Row"];
export type RekeningRow = Database["public"]["Tables"]["profil_gereja_rekening"]["Row"];
export type LinimasaRow = { id: string; tahun: string; teks: string; sort_order: number };

/** What `/admin/profil-gereja` loads: both singletons, the timeline, and the Sambutan pastor picker's options. */
export type ProfilGerejaAdminData = {
  profil: ProfilGerejaRow;
  rekening: RekeningRow;
  linimasa: LinimasaRow[];
  pendeta: PendetaRow[];
};

// Characters allowed after the host: no whitespace, control characters,
// quotes, angle brackets, or backslashes (same set as 0029).
const TAIL = String.raw`[^\s\x00-\x1f\x7f"<>\\]`;

export const MAPS_URL_PATTERN = new RegExp(
  String.raw`^https://((www\.|maps\.)?google\.com/maps([/?#]${TAIL}*)?|maps\.app\.goo\.gl/${TAIL}+)$`,
);

export const SOCIAL_PLATFORMS = {
  instagram: {
    label: "Instagram",
    pattern: new RegExp(String.raw`^https://(www\.)?instagram\.com/${TAIL}+$`),
    example: "https://www.instagram.com/namaakun",
  },
  youtube: {
    label: "YouTube",
    pattern: new RegExp(String.raw`^https://(www\.|m\.)?youtube\.com/${TAIL}+$`),
    example: "https://www.youtube.com/@namakanal",
  },
  facebook: {
    label: "Facebook",
    pattern: new RegExp(String.raw`^https://(www\.|m\.|web\.)?facebook\.com/${TAIL}+$`),
    example: "https://www.facebook.com/namahalaman",
  },
} as const;

export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;

/** Digits only, 8-15 of them (brief §14.1: used for a wa.me link). */
export const TELEPON_PATTERN = /^[0-9]{8,15}$/;
export const NOMOR_REKENING_PATTERN = /^[0-9]([0-9 -]{0,38}[0-9])?$/;

export const MISI_MAX_LINES = 20;
export const MISI_MAX_LINE_LENGTH = 500;

/**
 * Parses and normalizes a URL (scheme and host lowercased, spaces
 * percent-encoded), then checks it against `pattern`. Empty → null.
 */
function urlField(pattern: RegExp, message: string, max: number) {
  return z
    .string({ error: "Data yang dikirim tidak valid." })
    .trim()
    .nullish()
    .transform((value, ctx) => {
      if (!value) return null;
      let href: string;
      try {
        href = new URL(value).href;
      } catch {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      if (href.length > max || !pattern.test(href)) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return href;
    });
}

export const mapsUrlField = urlField(
  MAPS_URL_PATTERN,
  "URL Google Maps harus berawalan https://www.google.com/maps atau https://maps.app.goo.gl/.",
  2000,
);

export function socialUrlField(platform: SocialPlatform) {
  const { label, pattern, example } = SOCIAL_PLATFORMS[platform];
  return urlField(pattern, `URL ${label} harus berupa alamat https ${label}, mis. ${example}.`, 500);
}

export const teleponField = z
  .string({ error: "Data yang dikirim tidak valid." })
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || TELEPON_PATTERN.test(value), {
    message: "Nomor telepon/WhatsApp hanya boleh berisi angka, 8–15 digit.",
  });

/** Misi arrives as a textarea, one line per item; blank lines are dropped. */
export const misiField = z
  .string({ error: "Data yang dikirim tidak valid." })
  .nullish()
  .transform((value) =>
    (value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .refine((lines) => lines.length <= MISI_MAX_LINES, { message: `Misi maksimal ${MISI_MAX_LINES} baris.` })
  .refine((lines) => lines.every((line) => line.length <= MISI_MAX_LINE_LENGTH), {
    message: `Setiap baris misi maksimal ${MISI_MAX_LINE_LENGTH} karakter.`,
  });

/** Account numbers: digits, optionally grouped with spaces or dashes. */
export const nomorRekeningField = z
  .string({ error: "Data yang dikirim tidak valid." })
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || NOMOR_REKENING_PATTERN.test(value), {
    message: "Nomor rekening hanya boleh berisi angka (boleh dipisah spasi atau tanda hubung).",
  });
