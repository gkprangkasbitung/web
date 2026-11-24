/**
 * Name normalization shared by the Portal Jemaat username generator (brief
 * §18.7, stage 14d) and the Pemilihan peserta import (§18.4, stage 14b), so
 * both read "Bpk. Yohanes Santoso, S.Th." the same way. Pure, client-safe.
 */

/**
 * Honorifics and titles stripped from the front of a name (§18.7: Bpk., Ibu,
 * Sdr., Sdri., Pdt., Pnt., Dkn., St.; plus their long forms and the common
 * academic prefixes), compared without their dot and case.
 */
export const SAPAAN_DAN_GELAR: ReadonlySet<string> = new Set([
  "bpk",
  "bapak",
  "bp",
  "ibu",
  "ib",
  "sdr",
  "sdri",
  "saudara",
  "saudari",
  "pdt",
  "pnt",
  "dkn",
  "st",
  "em",
  "dr",
  "drs",
  "dra",
  "ir",
  "prof",
]);

/**
 * The words of a name without what comes after a comma (degrees such as
 * ", S.Th.") and without honorifics at the front, repeatedly ("Pdt. Em.
 * Yohanes" loses both). A title written without a space before the name
 * ("Bpk.Yohanes") is split at its dot first. The words keep their original
 * spelling.
 */
export function kataNama(nama: string): string[] {
  const beforeComma = nama.split(",")[0] ?? "";
  const tokens = beforeComma.split(/\s+/).filter(Boolean);

  const words: string[] = [];
  let leading = true;
  for (const token of tokens.flatMap((t) => t.split(/(?<=\.)(?=\S)/))) {
    const bare = token.replace(/\.+$/, "").toLowerCase();
    if (leading && SAPAAN_DAN_GELAR.has(bare)) continue;
    leading = false;
    words.push(token);
  }
  return words;
}

/** Lowercase a–z0–9 only, after removing diacritics (é → e, ñ → n, full-width → ASCII). */
export function asciiWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The key two spellings of one person's name share, for matching an
 * imported list against Data Jemaat: honorifics and degrees dropped,
 * diacritics removed, lowercase, and punctuation gone, so
 *
 *   "Bpk. Fajar Butar - butar"  → "fajar butar butar"
 *   "fajar  Butar-Butar"        → "fajar butar butar"
 *   "Citra Br. Simanjuntak"     → "citra br simanjuntak"
 *   "Ibu Citra br Simanjuntak"  → "citra br simanjuntak"
 *
 * A hyphen separates words the same way a space does. Empty when nothing
 * is left.
 */
export function kunciNama(nama: string): string {
  return kataNama(nama)
    .flatMap((word) => word.split(/-+/))
    .map(asciiWord)
    .filter(Boolean)
    .join(" ");
}
