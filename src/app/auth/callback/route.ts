import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeCallbackPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["invite", "signup", "magiclink", "recovery", "email_change", "email"];

/**
 * Turns an email link into a session, then continues to `next` (default
 * /admin), or to /login on failure (brief §6). Handles both the PKCE `code`
 * flow and `token_hash` links, since invite emails sent by the admin API can
 * only be verified with the token hash.
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

  return NextResponse.redirect(new URL(verified ? next : "/login", request.nextUrl.origin));
}
