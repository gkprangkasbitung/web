import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { logActivity } from "@/lib/activity-log";
import { isJemaat, isStaff, LOGIN_PATH, PORTAL_LABEL } from "@/lib/auth/portal";
import { safeCallbackPath } from "@/lib/auth/safe-next";
import { loadAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["invite", "signup", "magiclink", "recovery", "email_change", "email"];

/**
 * Turns an email link into a session, then continues to `next` (default
 * /admin), or to the login page on failure (brief §6): /portal/masuk for a
 * /jemaat link, else /login. Handles both the PKCE `code` flow and
 * `token_hash` links, since invite emails sent by the admin API can only be
 * verified with the token hash.
 *
 * An account linked to a jemaat but without a role never gets the
 * set-password page: it signs in with email codes, so it goes to /jemaat
 * (stage 11f). This is decided from the account, not from the link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeCallbackPath(searchParams.get("next"));

  const supabase = await createClient();
  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    verified = !error;
  }

  let target = next;
  if (!verified) {
    target = next.startsWith("/jemaat") ? `${LOGIN_PATH.jemaat}?error=tautan` : LOGIN_PATH.admin;
  } else {
    const user = await loadAuthUser(supabase);
    if (next === "/auth/set-password" && user && isJemaat(user) && !isStaff(user)) target = "/jemaat";
    // Accepting an "Akun Jemaat" invite is that account's first sign-in.
    if (target.startsWith("/jemaat") && user && isJemaat(user)) {
      await logActivity({ supabase, user, module: "auth", activity: `Login ke ${PORTAL_LABEL.jemaat}` });
    }
  }

  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
