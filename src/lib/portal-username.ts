/**
 * Portal Jemaat usernames (brief §18.7, stage 14d): the format rules and the
 * suggestion generator. Pure functions, safe on the client (the "Buat Akun
 * Username" dialog suggests while the admin types) and on the server. The
 * database has the final say: profiles_username_check and its unique key
 * (0039), and the server retries on a clash.
 */
import { z } from "zod";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

const USERNAME_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/**
 * Reserved words: a username is refused when any dot-separated segment,
 * without its trailing digits, is one of these. The same list as
 * private.username_kata_terlarang() in 0039; an integration test compares them.
 */
export const USERNAME_KATA_TERLARANG: readonly string[] = [
  "admin",
  "administrator",
  "api",
  "bendahara",
  "gereja",
  "gkp",
  "jemaat",
  "login",
  "mail",
  "majelis",
  "masuk",
  "noreply",
  "null",
  "panitia",
  "pengurus",
  "portal",
  "postmaster",
  "root",
  "sekretariat",
  "sistem",
  "staff",
  "superadmin",
  "superuser",
  "support",
  "system",
  "test",
  "undefined",
  "webmaster",
  "www",
];

const TERLARANG = new Set(USERNAME_KATA_TERLARANG);

export function isUsernameTerlarang(username: string): boolean {
  return username
    .toLowerCase()
    .split(".")
    .some((segment) => TERLARANG.has(segment.replace(/[0-9]+$/, "")));
}

/** Why a username is refused, in the words the form shows; null when valid. */
export function usernameError(username: string): string | null {
  if (username.length === 0) return "Username wajib diisi.";
  if (username.length < USERNAME_MIN) return `Username minimal ${USERNAME_MIN} karakter.`;
  if (username.length > USERNAME_MAX) return `Username maksimal ${USERNAME_MAX} karakter.`;
  if (!USERNAME_PATTERN.test(username)) {
    return "Username hanya boleh huruf kecil a–z, angka, dan titik di antaranya (mis. yohanes.santoso).";
  }
  if (isUsernameTerlarang(username)) return "Username ini tidak boleh dipakai. Pilih username lain.";
  return null;
}

/** Trims and lowercases what was typed; the rules themselves are not loosened. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export const usernameSchema = z
  .string({ error: "Username wajib diisi." })
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const message = usernameError(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

/**
 * Honorifics and titles stripped from the front of a name (§18.7: Bpk., Ibu,
 * Sdr., Sdri., Pdt., Pnt., Dkn., St.; plus their long forms and the common
 * academic prefixes), compared without their dot and case.
 */
const HONORIFICS = new Set([
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

/** Lowercase a–z0–9 only, after removing diacritics (é → e, ñ → n). */
function asciiWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Cuts to `max` characters without leaving a dot at either end. */
function cut(value: string, max: number): string {
  return value.slice(0, max).replace(/^\.+|\.+$/g, "");
}

/**
 * The base suggestion for a name (§18.7): everything after a comma dropped
 * (degrees such as ", S.Th."), honorifics at the front dropped, diacritics
 * removed, lowercase a–z0–9, then first word + "." + last word (one word:
 * that word), at most 30 characters. Null when nothing valid is left (fewer
 * than 3 characters): the admin types one.
 *
 *   "Bpk. Yohanes Budi Santoso, S.Th." → "yohanes.santoso"
 *   "Ibu Sri"                          → "sri"
 */
export function usernameDasar(nama: string): string | null {
  const beforeComma = nama.split(",")[0] ?? "";
  const tokens = beforeComma.split(/\s+/).filter(Boolean);

  // Repeatedly, so "Pdt. Em. Yohanes" loses both. A title written without
  // a space before the name ("Bpk.Yohanes") is split at its dot first.
  const words: string[] = [];
  let leading = true;
  for (const token of tokens.flatMap((t) => t.split(/(?<=\.)(?=\S)/))) {
    const bare = token.replace(/\.+$/, "").toLowerCase();
    if (leading && HONORIFICS.has(bare)) continue;
    leading = false;
    const word = asciiWord(token);
    if (word) words.push(word);
  }
  if (words.length === 0) return null;

  const joined = words.length === 1 ? words[0]! : `${words[0]}.${words[words.length - 1]}`;
  const base = cut(joined, USERNAME_MAX);
  return base.length >= USERNAME_MIN ? base : null;
}

/**
 * `base` with the n-th suffix (1 = none, 2 → "base2", 3 → "base3", …),
 * cutting the base so the whole thing stays within 30 characters.
 */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = String(n);
  return `${cut(base, USERNAME_MAX - suffix.length)}${suffix}`;
}

/**
 * The first free username for `base`: itself, then base2, base3, …, starting
 * at the `startAt`-th. `taken` holds the usernames already in use
 * (lowercase), including the ones picked earlier in the same batch. Null
 * when `base` itself is invalid or reserved: a digit suffix can't help a
 * reserved word (the rule ignores trailing digits), so the admin types one.
 */
export function firstFreeUsername(base: string, taken: ReadonlySet<string>, startAt = 1): string | null {
  if (usernameError(base) !== null) return null;
  for (let n = Math.max(1, startAt); ; n += 1) {
    const candidate = withSuffix(base, n);
    if (!taken.has(candidate)) return candidate;
  }
}

/** The suggestion for a name, or null when the admin has to type one. */
export function usulkanUsername(nama: string, taken: ReadonlySet<string>): string | null {
  const base = usernameDasar(nama);
  return base ? firstFreeUsername(base, taken) : null;
}
