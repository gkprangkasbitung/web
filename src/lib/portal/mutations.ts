import "server-only";

import { z } from "zod";

import { logActivity, quote } from "@/lib/activity-log";
import type { AuthUser } from "@/lib/auth/session";
import { loadMyJemaat } from "@/lib/jemaat-portal";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { loadPengajuanSaya, PortalError, portalError } from "./data";
import { PENGAJUAN_FIELD_LABELS, pengajuanFields, pengajuanInputSchema } from "./types";

/**
 * Portal Jemaat mutations (brief §17.2): validated with Zod, written by the
 * portal functions with the user's own session (never the service role),
 * then logged under module `jemaat`, where the admin's decision on the same
 * request is logged too (13c). The log names the jemaat and the fields,
 * never the values.
 */

export type PortalMutationResult<T> = { ok: true; data: T } | { ok: false; reason: PortalError["reason"]; message: string };

type Context = { supabase: ServerSupabase; user: Pick<AuthUser, "id" | "email"> };

function failure(error: unknown): { ok: false; reason: PortalError["reason"]; message: string } {
  if (error instanceof PortalError) return { ok: false, reason: error.reason, message: error.message };
  console.error("[portal] mutation failed:", error);
  return { ok: false, reason: "gagal", message: "Terjadi kesalahan di server. Coba lagi." };
}

/** The jemaat's name for an activity sentence; the email if it can't be read. */
async function jemaatLabel({ supabase, user }: Context): Promise<string> {
  return (await loadMyJemaat(supabase))?.nama ?? user.email;
}

/** Submits a change request for the caller's own jemaat. Returns its id. */
export async function ajukanPerubahan(context: Context, input: unknown): Promise<PortalMutationResult<{ id: string }>> {
  const parsed = pengajuanInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "tidak_valid", message: parsed.error.issues[0]?.message ?? "Data yang dikirim tidak valid." };
  }

  const { data: id, error } = await context.supabase
    .schema("portal")
    .rpc("ajukan_perubahan", { data: parsed.data as Json });
  if (error) return failure(portalError(error, "ajukan_perubahan"));
  if (typeof id !== "string") return failure(new Error("ajukan_perubahan returned no id"));

  // The function stores only the fields that actually change; log those.
  try {
    const [nama, requests] = await Promise.all([jemaatLabel(context), loadPengajuanSaya(context.supabase)]);
    const stored = requests.find((request) => request.id === id);
    const fields = stored ? pengajuanFields(stored.data).map((field) => PENGAJUAN_FIELD_LABELS[field]) : [];
    await logActivity({
      ...context,
      module: "jemaat",
      activity: `Mengajukan perubahan data ${quote(nama)}${fields.length ? `: ${fields.join(", ")}` : ""}`,
    });
  } catch (logError) {
    console.error("[activity-log] jemaat: Mengajukan perubahan data -", logError);
  }
  return { ok: true, data: { id } };
}

/** Cancels one of the caller's jemaat's own waiting requests. */
export async function batalkanPengajuan(context: Context, id: unknown): Promise<PortalMutationResult<null>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan", message: "Pengajuan tidak ditemukan." };

  const { error } = await context.supabase.schema("portal").rpc("batalkan_pengajuan", { id: parsed.data });
  if (error) return failure(portalError(error, "batalkan_pengajuan"));

  try {
    await logActivity({
      ...context,
      module: "jemaat",
      activity: `Membatalkan pengajuan perubahan data ${quote(await jemaatLabel(context))}`,
    });
  } catch (logError) {
    console.error("[activity-log] jemaat: Membatalkan pengajuan perubahan data -", logError);
  }
  return { ok: true, data: null };
}
