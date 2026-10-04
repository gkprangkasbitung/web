"use server";

import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity-log";
import { isJemaat, PORTAL_LABEL } from "@/lib/auth/portal";
import {
  checkVerifyQuota,
  codeSchema,
  emailSchema,
  recordFailedCode,
  RESEND_SECONDS,
  sendSignInCode,
  SENT_NOTICE,
  takeSendQuota,
  throttleSubjects,
  waitText,
} from "@/lib/auth/portal-otp";
import { safeNextPath } from "@/lib/auth/safe-next";
import { loadAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PortalLoginState = {
  step: "email" | "code";
  email: string;
  error: string | null;
  notice: string | null;
  /** Seconds until "Kirim ulang" is allowed, counted from when this state arrives. */
  cooldown: number;
  /** Changes on every answer, so the client restarts its countdown. */
  nonce: number;
};

const NOT_JEMAAT =
  "Akun ini belum terhubung ke data jemaat. Hubungi sekretariat untuk aktivasi Portal Jemaat.";
const WRONG_CODE = "Kode salah atau sudah kedaluwarsa. Periksa kembali kodenya, atau kirim ulang kode baru.";
const SERVER_ERROR = "Terjadi kesalahan di server. Coba lagi.";

function state(partial: Partial<PortalLoginState> & Pick<PortalLoginState, "step" | "email">): PortalLoginState {
  return { error: null, notice: null, cooldown: 0, nonce: Date.now(), ...partial };
}

/**
 * Portal Jemaat sign-in (stage 11f), all on the server: `intent` is "send"
 * (email → code, also "Kirim ulang"), "verify" (code → session), or
 * "change-email" (back to step 1). Works without JavaScript.
 */
export async function portalLogin(previous: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const intent = String(formData.get("intent") ?? "");
  const rawEmail = String(formData.get("email") ?? "");

  if (intent === "change-email") return state({ step: "email", email: previous.email || rawEmail.trim() });

  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    return state({ step: "email", email: rawEmail.trim(), error: email.error.issues[0]?.message ?? "Email tidak valid." });
  }
  const subjects = await throttleSubjects(email.data);

  if (intent === "send") {
    const wait = await takeSendQuota(subjects);
    if (wait > 0) {
      // The same limits apply to every email, registered or not, so this
      // says nothing about whether the account exists.
      const message =
        wait <= RESEND_SECONDS
          ? `Tunggu ${waitText(wait)} sebelum meminta kode lagi.`
          : `Terlalu banyak permintaan kode. Coba lagi dalam ${waitText(wait)}.`;
      return state({ step: previous.step, email: email.data, error: message, cooldown: wait });
    }
    await sendSignInCode(email.data);
    return state({ step: "code", email: email.data, notice: SENT_NOTICE, cooldown: RESEND_SECONDS });
  }

  if (intent !== "verify") return state({ step: "email", email: email.data, error: SERVER_ERROR });

  const code = codeSchema.safeParse(String(formData.get("code") ?? ""));
  if (!code.success) {
    return state({ step: "code", email: email.data, error: code.error.issues[0]?.message ?? WRONG_CODE });
  }

  const wait = await checkVerifyQuota(subjects);
  if (wait > 0) {
    return state({
      step: "code",
      email: email.data,
      error: `Terlalu banyak kode yang salah. Coba lagi dalam ${waitText(wait)}.`,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error) {
    await recordFailedCode(subjects);
    if (error.status === 429) {
      return state({ step: "code", email: email.data, error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." });
    }
    if (error.code !== "otp_expired") console.error("[portal] verifyOtp failed:", error.status, error.code, error.message);
    return state({ step: "code", email: email.data, error: WRONG_CODE });
  }

  // The code proves the email; the account's link to a jemaat decides access.
  const user = await loadAuthUser(supabase);
  if (!user || !isJemaat(user)) {
    await supabase.auth.signOut({ scope: "local" });
    return state({ step: "email", email: email.data, error: NOT_JEMAAT });
  }

  await logActivity({ supabase, user, module: "auth", activity: `Login ke ${PORTAL_LABEL.jemaat}` });
  redirect(safeNextPath(String(formData.get("next") ?? ""), "jemaat"));
}
