import { z } from "zod";

/** Trimmed text that must not be empty: `requiredText("Nama wajib diisi.")`. */
export function requiredText(message: string, max = 200) {
  return z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Maksimal ${max} karakter.`);
}

/** Trimmed optional text; empty or missing becomes null. */
export function optionalText(max = 500) {
  return z
    .string({ error: "Data yang dikirim tidak valid." })
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .nullish()
    .transform((value) => value || null);
}

/** Route params with a record id; a malformed id is treated as "not found". */
export const idParams = z.object({ id: z.uuid() });
