"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getClientIp, logActivity } from "@/lib/activity-log";
import { loginWait, recordLoginFailure, waitMessage } from "@/lib/auth/login-throttle";
import { GANTI_PASSWORD_PATH, isJemaat, PORTAL_LABEL } from "@/lib/auth/portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { loadAuthUser } from "@/lib/auth/session";
import { portalAuthEmail } from "@/lib/portal-login-domain";
import { normalizeUsername, usernameError } from "@/lib/portal-username";
import { createClient } from "@/lib/supabase/server";

import { type CaraMasuk, LOGIN_COPY } from "./cara-masuk";

export type PortalLoginState = { error: string | null; cara: CaraMasuk; username: string; email: string };

const NOT_JEMAAT = "Akun ini belum terhubung ke data jemaat. Hubungi sekretariat untuk aktivasi Portal Jemaat.";

/**
 * Every refused attempt takes at least this long, whatever the reason, so
 * the response time doesn't tell whether the account exists (GoTrue only
 * runs bcrypt for an existing user).
 */
const MIN_FAILURE_MS = 800;

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

async function padSince(started: number): Promise<void> {
  const left = MIN_FAILURE_MS - (Date.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
}

/**
 * Portal Jemaat sign-in (brief §15, §18.7), with a username (the default:
 * accounts made by the secretariat, whose real email isn't known) or an
 * email, and a password.
 *
 * A username is mapped to its internal auth email here on the server; the
 * browser never sees that address. A username that doesn't exist, a
 * malformed one, and a wrong password all answer "Username atau password
 * salah." after the same minimum time, and all count against the same
 * throttle (per account and per IP), so none of them can be told apart.
 *
 * After the password, the jemaat link decides access (checked after signing
 * in, never before). With a temporary password, the account goes to
 * /jemaat/ganti-password first, whatever `next` says.
 */
export async function portalLogin(_previous: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const started = Date.now();
  const cara: CaraMasuk = formData.get("cara") === "email" ? "email" : "username";
  const identifier = String(formData.get(cara) ?? "").trim();
  const echo = { cara, username: cara === "username" ? identifier : "", email: cara === "email" ? identifier : "" };
  const copy = LOGIN_COPY[cara];

  const parsed = loginSchema.safeParse({
    identifier,
    password: formData.get("password") ?? "",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: copy.required, ...echo };

  // The username's internal email, or the email as typed. A username that
  // can't exist still gets a subject, so it is throttled like any other.
  const username = cara === "username" ? normalizeUsername(identifier) : null;
  const wellFormed = username === null || usernameError(username) === null;
  const authEmail =
    username === null ? identifier.toLowerCase() : wellFormed ? portalAuthEmail(username) : `invalid:${username}`;

  const supabase = await createClient();
  const ip = await getClientIp();

  const wait = await loginWait(supabase, authEmail, ip);
  if (wait > 0) {
    await padSince(started);
    return { error: waitMessage(wait), ...echo };
  }

  const { data, error } = wellFormed
    ? await supabase.auth.signInWithPassword({ email: authEmail, password: parsed.data.password })
    : { data: { user: null }, error: null };
  if (error || !data.user) {
    if (error?.status === 429) {
      await padSince(started);
      return { error: "Terlalu banyak percobaan masuk. Coba lagi beberapa saat lagi.", ...echo };
    }
    await recordLoginFailure(supabase, authEmail, ip);
    await padSince(started);
    return { error: copy.wrong, ...echo };
  }

  const user = await loadAuthUser(supabase);
  if (!user || !isJemaat(user)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: NOT_JEMAAT, ...echo };
  }

  await logActivity({ supabase, user, module: "auth", activity: `Login ke ${PORTAL_LABEL.jemaat}` });
  redirect(user.wajibGantiPassword ? GANTI_PASSWORD_PATH : safeNextPath(parsed.data.next, "jemaat"));
}
