import "server-only";

import { logActivity, quote } from "@/lib/activity-log";
import type { AuthUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import type { ServerSupabase } from "@/lib/supabase/server";

import { GENERIC_ERROR, PemilihanError, pemilihanError } from "./data";
import {
  berikanSuaraDibantuRowSchema,
  berikanSuaraRowSchema,
  suaraDibantuInputSchema,
  suaraInputSchema,
  type PemilihanErrorReason,
} from "./types";

/**
 * Casting a vote (brief §18.3, §18.5): validated with Zod, written by the
 * 0038 functions with the user's own session (never the service role),
 * then logged under module `pemilihan`.
 *
 * Secret ballot (§18.2): the activity log names the election, or the voter
 * and the form number, and never a choice. Neither the input nor a raw
 * database message is ever written to the server console.
 */

export type PemilihanMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: PemilihanErrorReason; message: string };

type Context = { supabase: ServerSupabase; user: Pick<AuthUser, "id" | "email"> };
type PanitiaContext = { supabase: ServerSupabase; user: Pick<AuthUser, "id" | "email" | "permissions"> };

function failure(error: unknown): { ok: false; reason: PemilihanErrorReason; message: string } {
  if (error instanceof PemilihanError) return { ok: false, reason: error.reason, message: error.message };
  console.error("[pemilihan] mutation failed:", error instanceof Error ? error.name : typeof error);
  return { ok: false, reason: "gagal", message: GENERIC_ERROR };
}

const INVALID = "Data yang dikirim tidak valid.";

/** Portal: the signed-in jemaat votes. Returns the time recorded, for the receipt. */
export async function berikanSuara(context: Context, input: unknown): Promise<PemilihanMutationResult<{ waktu: string }>> {
  const parsed = suaraInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue?.path[0] === "pemilihanId" ? "tidak_ditemukan" : "tidak_valid",
      message: issue?.message ?? INVALID,
    };
  }

  const { data, error } = await context.supabase.schema("portal").rpc("berikan_suara", {
    pemilihan_id: parsed.data.pemilihanId,
    penatua: parsed.data.penatua,
    ppj: parsed.data.ppj,
  });
  if (error) return failure(pemilihanError(error, "berikan_suara"));
  const row = berikanSuaraRowSchema.safeParse(Array.isArray(data) ? data[0] : undefined);
  if (!row.success) return failure(new Error("berikan_suara returned no row"));

  await logActivity({
    ...context,
    module: "pemilihan",
    activity: `Memberikan suara pada pemilihan ${quote(row.data.pemilihan_nama)}`,
  });
  return { ok: true, data: { waktu: row.data.waktu } };
}

/**
 * Panitia (pemilihan_bantu:create): records a voter's paper ballot.
 * Returns the time recorded and the voter's display name.
 */
export async function berikanSuaraDibantu(
  context: PanitiaContext,
  input: unknown,
): Promise<PemilihanMutationResult<{ waktu: string; namaPemilih: string }>> {
  if (!can(context.user, "pemilihan_bantu", "create")) {
    return { ok: false, reason: "akses", message: "Kamu tidak punya akses untuk tindakan ini." };
  }
  const parsed = suaraDibantuInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message ?? INVALID;
    const reason: PemilihanErrorReason =
      issue?.path[0] === "nomorFormulir" ? "formulir_tidak_valid" : issue?.path[0] === "pemilihanId" ? "tidak_ditemukan" : "tidak_valid";
    return { ok: false, reason, message };
  }

  const { data, error } = await context.supabase.rpc("berikan_suara_dibantu", {
    p_pemilihan_id: parsed.data.pemilihanId,
    p_jemaat_id: parsed.data.jemaatId,
    p_nomor_formulir: parsed.data.nomorFormulir,
    p_penatua: parsed.data.penatua,
    p_ppj: parsed.data.ppj,
  });
  if (error) return failure(pemilihanError(error, "berikan_suara_dibantu"));
  const row = berikanSuaraDibantuRowSchema.safeParse(Array.isArray(data) ? data[0] : undefined);
  if (!row.success) return failure(new Error("berikan_suara_dibantu returned no row"));

  await logActivity({
    supabase: context.supabase,
    user: context.user,
    module: "pemilihan",
    activity: `Membantu pemilih memberikan suara: ${row.data.nama_pemilih} (formulir ${parsed.data.nomorFormulir})`,
  });
  return { ok: true, data: { waktu: row.data.waktu, namaPemilih: row.data.nama_pemilih } };
}
