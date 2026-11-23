import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import type { ServerSupabase } from "@/lib/supabase/server";

import {
  hasilPartisipasiRowSchema,
  hasilPemilihanRowSchema,
  hasilSuaraRowSchema,
  isPemilihanErrorCode,
  kandidatRowSchema,
  kontesRowSchema,
  PEMILIHAN_ERROR_CODES,
  pemilihanAktifSayaRowSchema,
  toHasilKandidat,
  toHasilPartisipasi,
  toKandidat,
  toKontes,
  toPemilihanSaya,
  type HasilKandidat,
  type HasilPartisipasi,
  type Kandidat,
  type Kontes,
  type PemilihanErrorReason,
  type PemilihanSaya,
} from "./types";

/**
 * Pemilihan loaders (brief §18; migration 0038), always through the
 * signed-in user's own session client, never the service role: the
 * functions decide who may see what (portal: auth.uid() → jemaat; panitia:
 * pemilihan:read / pemilihan_hasil:read).
 *
 * Secret ballot (§18.2): nothing here logs a request's arguments, and an
 * unexpected database error is logged by its code only, because some
 * Postgres messages echo input values.
 */

export class PemilihanError extends Error {
  constructor(
    readonly reason: PemilihanErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "PemilihanError";
  }
}

export const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";
const NOT_FOUND = "Pemilihan tidak ditemukan.";

/**
 * Maps an error from a pemilihan function. The messages for 0038's PM codes,
 * PT403, and P0002 are hand-written for the reader and never name a choice;
 * anything else goes to the server console as a bare code.
 */
export function pemilihanError(error: Pick<PostgrestError, "code" | "message">, fn: string): PemilihanError {
  if (isPemilihanErrorCode(error.code)) return new PemilihanError(PEMILIHAN_ERROR_CODES[error.code], error.message);
  switch (error.code) {
    case "PT403":
      return new PemilihanError("bukan_jemaat", error.message);
    case "PT428":
      return new PemilihanError("wajib_ganti_password", error.message);
    case "P0002":
      return new PemilihanError("tidak_ditemukan", error.message);
    case "42501":
      return new PemilihanError("akses", "Kamu tidak punya akses untuk tindakan ini.");
    default:
      console.error(`[pemilihan] ${fn} failed with code ${error.code}`);
      return new PemilihanError("gagal", GENERIC_ERROR);
  }
}

function parseRows<S extends z.ZodType>(schema: S, data: unknown, fn: string): z.infer<S>[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (!result.success) {
    console.error(`[pemilihan] ${fn} returned an unexpected shape at`, result.error.issues[0]?.path);
    throw new PemilihanError("gagal", GENERIC_ERROR);
  }
  return result.data;
}

function electionId(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new PemilihanError("tidak_ditemukan", NOT_FOUND);
  return parsed.data;
}

/** The two contests with their names and limits, in ballot order. */
export async function loadKontes(supabase: ServerSupabase): Promise<Kontes[]> {
  const { data, error } = await supabase.from("pemilihan_kontes").select("kode, nama, min_pilih, max_pilih, urutan").order("urutan");
  if (error) throw pemilihanError(error, "pemilihan_kontes");
  return parseRows(kontesRowSchema, data, "pemilihan_kontes").map(toKontes);
}

/** Portal: the caller's elections past draft, newest first, with whether (when, how) they voted. */
export async function loadPemilihanAktifSaya(supabase: ServerSupabase): Promise<PemilihanSaya[]> {
  const { data, error } = await supabase.schema("portal").rpc("pemilihan_aktif_saya");
  if (error) throw pemilihanError(error, "pemilihan_aktif_saya");
  return parseRows(pemilihanAktifSayaRowSchema, data, "pemilihan_aktif_saya").map(toPemilihanSaya);
}

/** Portal: the ballot's candidates, by name; only for a voter while the election is dibuka. */
export async function loadKandidat(supabase: ServerSupabase, pemilihanId: unknown): Promise<Kandidat[]> {
  const { data, error } = await supabase.schema("portal").rpc("kandidat", { pemilihan_id: electionId(pemilihanId) });
  if (error) throw pemilihanError(error, "kandidat");
  return parseRows(kandidatRowSchema, data, "kandidat").map(toKandidat);
}

/** Portal: the ranked tally, or [] while the portal may not show it (§18.6). */
export async function loadHasilPemilihan(supabase: ServerSupabase, pemilihanId: unknown): Promise<HasilKandidat[]> {
  const { data, error } = await supabase.schema("portal").rpc("hasil_pemilihan", { id: electionId(pemilihanId) });
  if (error) throw pemilihanError(error, "hasil_pemilihan");
  return parseRows(hasilPemilihanRowSchema, data, "hasil_pemilihan").map(toHasilKandidat);
}

/** Panitia (pemilihan:read): turnout, mandiri vs dibantu, and assisted votes per panitia. */
export async function loadHasilPartisipasi(supabase: ServerSupabase, pemilihanId: unknown): Promise<HasilPartisipasi> {
  const { data, error } = await supabase.rpc("hasil_partisipasi", { p_pemilihan_id: electionId(pemilihanId) });
  if (error) throw pemilihanError(error, "hasil_partisipasi");
  const row = parseRows(hasilPartisipasiRowSchema, data, "hasil_partisipasi")[0];
  if (!row) throw new PemilihanError("gagal", GENERIC_ERROR);
  return toHasilPartisipasi(row);
}

/** Panitia (pemilihan_hasil:read): the full ranked tally, live, in any status. */
export async function loadHasilSuara(supabase: ServerSupabase, pemilihanId: unknown): Promise<HasilKandidat[]> {
  const { data, error } = await supabase.rpc("hasil_suara", { p_pemilihan_id: electionId(pemilihanId) });
  if (error) throw pemilihanError(error, "hasil_suara");
  return parseRows(hasilSuaraRowSchema, data, "hasil_suara").map(toHasilKandidat);
}
