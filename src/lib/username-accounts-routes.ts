import "server-only";

import type { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity, quote } from "@/lib/activity-log";
import { fail, ok, parseBody, partial } from "@/lib/api";
import { can } from "@/lib/auth/permissions";
import { requirePermissionApi, requireStaffApi } from "@/lib/auth/session";
import { portalAuthEmail, portalLoginDomain } from "@/lib/portal-login-domain";
import { usernameSchema, withSuffix } from "@/lib/portal-username";
import { createUsernameAccount, setUserPassword } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/temp-password";

/**
 * Portal Jemaat username accounts (brief §18.7, stage 14d): "Buat Akun
 * Username" and "Reset Password" in Pengguna.
 *
 * The temporary password exists only in the response to the admin who asked
 * for it (no-store), for the printed slip. It is never stored, never logged,
 * and never written to the console: error paths log GoTrue's or Postgres's
 * code and message only.
 */

const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";
const JEMAAT_TAKEN = "Jemaat ini sudah terhubung ke akun lain.";
/** Retries with 2, 3, … after a clash, at most this many usernames per item. */
const MAX_ATTEMPTS = 20;
export const MAX_BATCH = 50;

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const createSchema = z
  .object({
    items: z
      .array(
        z.object({
          jemaatId: z.uuid({ error: "Data yang dikirim tidak valid." }),
          username: usernameSchema,
        }),
        { error: "Data yang dikirim tidak valid." },
      )
      .min(1, "Pilih minimal satu jemaat.")
      .max(MAX_BATCH, `Maksimal ${MAX_BATCH} akun sekali buat.`),
  })
  .superRefine(({ items }, ctx) => {
    const jemaat = new Set<string>();
    const usernames = new Set<string>();
    for (const item of items) {
      if (jemaat.has(item.jemaatId)) ctx.addIssue({ code: "custom", message: "Ada jemaat yang dipilih dua kali." });
      if (usernames.has(item.username)) {
        ctx.addIssue({ code: "custom", message: `Username "${item.username}" dipakai dua kali.` });
      }
      jemaat.add(item.jemaatId);
      usernames.add(item.username);
    }
  });

export type CreatedAccount = {
  jemaatId: string;
  nama: string;
  /** The username actually saved: the requested one, or with 2, 3, … after a clash. */
  username: string;
  /** True when `username` differs from the one requested. */
  disesuaikan: boolean;
  /** Shown once, for the slip. */
  password: string;
};

export type FailedAccount = { jemaatId: string; nama: string; username: string; error: string };

export type CreateAccountsResult = { created: CreatedAccount[]; failed: FailedAccount[] };

/**
 * POST /api/admin/users/username (`users:create`): one or more username
 * accounts. Predictable refusals (unknown jemaat, a jemaat that already has
 * an account) are checked for the whole batch first, so nothing is created
 * and the answer is a 400. Then each account is created on its own, in
 * order: 201 when all succeed, 207 with the failed ones listed otherwise.
 */
export async function createUsernameAccountsRoute(request: Request): Promise<NextResponse> {
  const auth = await requirePermissionApi("users", "create");
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.response;
  const items = body.data.items;

  try {
    portalLoginDomain();
  } catch (error) {
    console.error("[username-accounts]", error instanceof Error ? error.message : error);
    return fail(GENERIC_ERROR, 500);
  }

  const ids = items.map((item) => item.jemaatId);
  const [jemaatRes, linkedRes] = await Promise.all([
    supabase.from("jemaat").select("id, nama").in("id", ids),
    supabase.from("profiles").select("jemaat_id").in("jemaat_id", ids),
  ]);
  if (jemaatRes.error || linkedRes.error) {
    console.error("[username-accounts] pre-check failed:", (jemaatRes.error ?? linkedRes.error)?.code);
    return fail(GENERIC_ERROR, 500);
  }
  const names = new Map(jemaatRes.data.map((row) => [row.id, row.nama]));
  if (names.size !== ids.length) return fail("Jemaat tidak ditemukan.", 400);
  const linked = linkedRes.data.map((row) => names.get(row.jemaat_id!)!).filter(Boolean);
  if (linked.length > 0) {
    return fail(`Jemaat ini sudah punya akun: ${linked.join(", ")}. Satu jemaat hanya bisa punya satu akun.`, 400);
  }

  const result: CreateAccountsResult = { created: [], failed: [] };
  for (const item of items) {
    const nama = names.get(item.jemaatId)!;
    const password = generateTempPassword();
    let outcome: { username: string } | { error: string } | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !outcome; attempt += 1) {
      const username = withSuffix(item.username, attempt);
      const created = await createUsernameAccount({
        email: portalAuthEmail(username),
        username,
        jemaatId: item.jemaatId,
        password,
      });
      if (created.ok) {
        outcome = { username };
      } else if (created.reason !== "taken") {
        // GoTrue hides the Postgres error. The likely one is a jemaat linked
        // in the meantime (0039's trigger); anything else is unexpected.
        const now = await supabase.from("profiles").select("id").eq("jemaat_id", item.jemaatId).maybeSingle();
        if (now.data) outcome = { error: JEMAAT_TAKEN };
        else {
          console.error(`[username-accounts] createUser failed for jemaat ${item.jemaatId}: ${created.message}`);
          outcome = { error: "Akun gagal dibuat. Coba lagi." };
        }
      }
    }
    outcome ??= { error: "Username ini dan 19 variasinya sudah dipakai. Pilih username lain." };

    if ("error" in outcome) {
      result.failed.push({ jemaatId: item.jemaatId, nama, username: item.username, error: outcome.error });
      continue;
    }
    result.created.push({
      jemaatId: item.jemaatId,
      nama,
      username: outcome.username,
      disesuaikan: outcome.username !== item.username,
      password,
    });
    await logActivity({
      supabase,
      user,
      module: "users",
      activity: `Membuat akun username ${quote(outcome.username)} untuk ${quote(nama)}`,
    });
  }

  if (result.created.length === 0) {
    return noStore(fail(result.failed[0]?.error ?? GENERIC_ERROR, 400));
  }
  if (result.failed.length > 0) {
    const list = result.failed.map((row) => `${row.nama} (${row.error})`).join("; ");
    return noStore(partial(result, `${result.failed.length} akun gagal dibuat: ${list}`));
  }
  return noStore(ok(result, 201));
}

export type ResetPasswordResult = { nama: string; username: string | null; password: string };

const idSchema = z.uuid();

/**
 * POST /api/admin/users/[id]/reset-password (§18.7): `users:update`, or
 * `pemilihan:update`, for jemaat-only accounts. siapkan_reset_password
 * (0039) checks the same rule in the database, turns
 * wajib_ganti_password on, and revokes the account's sessions; then the new
 * temporary password is set. Logged without the password.
 */
export async function resetPasswordRoute(
  _request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<NextResponse> {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;
  if (!can(user, "users", "update") && !can(user, "pemilihan", "update")) {
    return fail("Kamu tidak punya akses untuk tindakan ini.", 403);
  }

  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) return fail("Pengguna tidak ditemukan.", 404);

  const prepared = await supabase.rpc("siapkan_reset_password", { p_user_id: id.data });
  if (prepared.error) {
    switch (prepared.error.code) {
      case "42501":
        return fail("Kamu tidak punya akses untuk tindakan ini.", 403);
      case "P0002":
        return fail("Pengguna tidak ditemukan.", 404);
      case "22023":
        return fail(prepared.error.message, 400);
      default:
        console.error("[reset-password] siapkan_reset_password failed:", prepared.error.code);
        return fail(GENERIC_ERROR, 500);
    }
  }
  const target = prepared.data?.[0];
  if (!target) return fail("Pengguna tidak ditemukan.", 404);

  const password = generateTempPassword();
  const set = await setUserPassword(id.data, password);
  if (!set.ok) {
    // The flag stays on: the account must still change its (old) password.
    console.error("[reset-password] updateUserById failed:", set.message);
    return fail(GENERIC_ERROR, 500);
  }

  await logActivity({
    supabase,
    user,
    module: "users",
    activity: `Mereset password akun ${quote(target.username ?? target.email)} (${target.nama})`,
  });
  return noStore(ok({ nama: target.nama, username: target.username, password } satisfies ResetPasswordResult));
}
