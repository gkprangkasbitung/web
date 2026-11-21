import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import type { ServerSupabase } from "@/lib/supabase/server";

import {
  keluargaSayaRowSchema,
  komisiSayaRowSchema,
  pelayananSayaRowSchema,
  pengajuanSayaRowSchema,
  pengaturanPortalRowSchema,
  persembahanSayaRowSchema,
  profilSayaRowSchema,
  toAnggotaKeluarga,
  toKomisiSaya,
  toPelayananSaya,
  toPengajuanSaya,
  toProfilSaya,
  type AnggotaKeluarga,
  type KomisiSaya,
  type PelayananSaya,
  type PengajuanSaya,
  type PengaturanPortal,
  type PersembahanSaya,
  type ProfilSaya,
} from "./types";

/**
 * Portal Jemaat loaders (brief §17.1). Every call goes through the `portal`
 * schema with the signed-in user's own session client, never the service
 * role: the functions themselves decide whose data it is (auth.uid() →
 * profiles.jemaat_id), so nothing here passes an id.
 */

/** SQLSTATE the portal raises for an account without a jemaat link (0037). */
export const NOT_JEMAAT_CODE = "PT403";

export type PortalErrorReason = "bukan_jemaat" | "tidak_valid" | "tidak_ditemukan" | "bentrok" | "akses" | "gagal";

/** A portal call that failed; `message` is fit to show (hand-written Indonesian, or the generic text). */
export class PortalError extends Error {
  constructor(
    readonly reason: PortalErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";

/**
 * Maps an error from a portal function. Their messages for these codes are
 * written in 0037 for the jemaat to read; anything else is unexpected and
 * goes to the server console only.
 */
export function portalError(error: Pick<PostgrestError, "code" | "message">, fn: string): PortalError {
  switch (error.code) {
    case NOT_JEMAAT_CODE:
      return new PortalError("bukan_jemaat", error.message);
    case "22023":
      return new PortalError("tidak_valid", error.message);
    case "P0002":
      return new PortalError("tidak_ditemukan", error.message);
    case "23505":
      return new PortalError("bentrok", error.message);
    case "42501":
      return new PortalError("akses", "Kamu tidak punya akses untuk tindakan ini.");
    default:
      console.error(`[portal] ${fn} failed: [${error.code}] ${error.message}`);
      return new PortalError("gagal", GENERIC_ERROR);
  }
}

function parseRows<S extends z.ZodType>(schema: S, data: unknown, fn: string): z.infer<S>[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (!result.success) {
    console.error(`[portal] ${fn} returned an unexpected shape:`, result.error.issues[0]);
    throw new PortalError("gagal", GENERIC_ERROR);
  }
  return result.data;
}

/** The caller's own jemaat record; null only if the row vanished. */
export async function loadProfilSaya(supabase: ServerSupabase): Promise<ProfilSaya | null> {
  const { data, error } = await supabase.schema("portal").rpc("profil_saya");
  if (error) throw portalError(error, "profil_saya");
  const row = parseRows(profilSayaRowSchema, data, "profil_saya")[0];
  return row ? toProfilSaya(row) : null;
}

/** The caller's family (the caller included): name, hubungan, status only. */
export async function loadKeluargaSaya(supabase: ServerSupabase): Promise<AnggotaKeluarga[]> {
  const { data, error } = await supabase.schema("portal").rpc("keluarga_saya");
  if (error) throw portalError(error, "keluarga_saya");
  return parseRows(keluargaSayaRowSchema, data, "keluarga_saya").map(toAnggotaKeluarga);
}

/** Every role the caller fills from `dari` to `sampai` (YYYY-MM-DD, at most 400 days). */
export async function loadPelayananSaya(supabase: ServerSupabase, dari: string, sampai: string): Promise<PelayananSaya[]> {
  const { data, error } = await supabase.schema("portal").rpc("pelayanan_saya", { dari, sampai });
  if (error) throw portalError(error, "pelayanan_saya");
  return parseRows(pelayananSayaRowSchema, data, "pelayanan_saya").map(toPelayananSaya);
}

/** The caller's komisi (pembina and memberships), as the public site shows them. */
export async function loadKomisiSaya(supabase: ServerSupabase): Promise<KomisiSaya[]> {
  const { data, error } = await supabase.schema("portal").rpc("komisi_saya");
  if (error) throw portalError(error, "komisi_saya");
  return parseRows(komisiSayaRowSchema, data, "komisi_saya").map(toKomisiSaya);
}

/** The caller's own Persembahan Bulanan in `tahun`; empty while the setting is off. */
export async function loadPersembahanSaya(supabase: ServerSupabase, tahun: number): Promise<PersembahanSaya[]> {
  const { data, error } = await supabase.schema("portal").rpc("persembahan_saya", { tahun });
  if (error) throw portalError(error, "persembahan_saya");
  return parseRows(persembahanSayaRowSchema, data, "persembahan_saya");
}

/** Which portal pages are on (/jemaat/persembahan only while tampilkanPersembahan). */
export async function loadPengaturanPortal(supabase: ServerSupabase): Promise<PengaturanPortal> {
  const { data, error } = await supabase.schema("portal").rpc("pengaturan_portal");
  if (error) throw portalError(error, "pengaturan_portal");
  const row = parseRows(pengaturanPortalRowSchema, data, "pengaturan_portal")[0];
  return { tampilkanPersembahan: row?.tampilkan_persembahan ?? false };
}

/** The caller's jemaat's change requests, newest first. */
export async function loadPengajuanSaya(supabase: ServerSupabase): Promise<PengajuanSaya[]> {
  const { data, error } = await supabase.schema("portal").rpc("pengajuan_saya");
  if (error) throw portalError(error, "pengajuan_saya");
  return parseRows(pengajuanSayaRowSchema, data, "pengajuan_saya").map(toPengajuanSaya);
}
