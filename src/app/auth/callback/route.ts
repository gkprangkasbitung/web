import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH } from "@/lib/auth/portal";
import { safeCallbackPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["invite", "signup", "magiclink", "recovery", "email_change", "email"];

/**
 * Turns an email link into a session, then continues to `next` (default
 * /admin), or to the login page on failure (brief §6): /portal/masuk for a
 * /jemaat link, else /login. Handles both the PKCE `code` flow and
 * `token_hash` links, since invite emails sent by the admin API can only be
 * verified with the token hash.
 *
 * Both a "Pengurus" and an "Akun Jemaat" invite land on /auth/set-password
 * (jemaat login is email + password now, not an email code), which itself
 * redirects to the right place afterwards (`homePath`). A jemaat invite's
 * `next` carries `&portal=jemaat` so a *failed* link can still be sent back
 * to /portal/masuk instead of /login — by then there's no session to read
 * `isJemaat` from.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeCallbackPath(searchParams.get("next"));
  const jemaatHint = searchParams.get("portal") === "jemaat";

  const supabase = await createClient();
  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    verified = !error;
  }

  const target = verified
    ? next
    : next.startsWith("/jemaat") || jemaatHint
      ? `${LOGIN_PATH.jemaat}?error=tautan`
      : LOGIN_PATH.admin;

  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
