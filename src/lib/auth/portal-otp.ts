import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { getClientIp } from "@/lib/activity-log";
import { createPublicClient } from "@/lib/supabase/public";

import { RESEND_SECONDS } from "./portal-copy";

/**
 * Portal Jemaat sign-in with a 6-digit email code (stage 11f): the parts the
 * Server Action needs besides the session itself.
 *
 * Account enumeration: whether an email is registered must never show. Every
 * send answers with the same message and the same next step, Supabase errors
 * included (logged on the server instead), the app's own limits apply to
 * every email alike, and the response is padded to a minimum duration so a
 * registered email (which waits for SMTP) isn't visibly slower.
 */

export { RESEND_SECONDS, SENT_NOTICE } from "./portal-copy";
/** Floor for a send's response time; see the enumeration note above. */
export const MIN_SEND_MS = 1000;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email wajib diisi.")
  .max(254, "Email terlalu panjang.")
  .toLowerCase()
  .pipe(z.email({ error: "Format email tidak valid." }));

export const codeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Masukkan 6 digit kode dari email."));

type Bucket = "otp_send_email" | "otp_send_ip" | "otp_fail_email" | "otp_fail_ip";

/** SHA-256 hex, so the throttle table never holds an email or an IP address. */
function subject(kind: "email" | "ip", value: string): string {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}

export type ThrottleSubjects = { email: string; ip: string };

/** The visitor's email and IP as throttle subjects (an unknown IP shares one bucket). */
export async function throttleSubjects(email: string): Promise<ThrottleSubjects> {
  return { email: subject("email", email), ip: subject("ip", (await getClientIp()) ?? "unknown") };
}

/**
 * auth_throttle (0034): seconds to wait, 0 when allowed. With `record`, an
 * allowed call also counts as one hit. Fails closed: if the check itself
 * fails, the caller is told to wait.
 */
async function throttle(buckets: [Bucket, Bucket], subjects: ThrottleSubjects, record: boolean): Promise<number> {
  const { data, error } = await createPublicClient().rpc("auth_throttle", {
    p_buckets: buckets,
    p_subjects: [subjects.email, subjects.ip],
    p_record: record,
  });
  if (error || typeof data !== "number") {
    console.error("[portal-otp] auth_throttle failed:", error?.message ?? data);
    return RESEND_SECONDS;
  }
  return data;
}

/** One send per email per minute (5 per hour), 20 per IP per hour. Records the send when allowed. */
export function takeSendQuota(subjects: ThrottleSubjects): Promise<number> {
  return throttle(["otp_send_email", "otp_send_ip"], subjects, true);
}

/** Whether a code may be tried now: 5 wrong codes per email, 30 per IP, per 15 minutes. */
export function checkVerifyQuota(subjects: ThrottleSubjects): Promise<number> {
  return throttle(["otp_fail_email", "otp_fail_ip"], subjects, false);
}

/** Counts one wrong or expired code. */
export async function recordFailedCode(subjects: ThrottleSubjects): Promise<void> {
  await throttle(["otp_fail_email", "otp_fail_ip"], subjects, true);
}

/** "45 detik" / "15 menit". */
export function waitText(seconds: number): string {
  return seconds < 90 ? `${seconds} detik` : `${Math.ceil(seconds / 60)} menit`;
}

/**
 * signInWithOtp with shouldCreateUser: false, so an unknown email never gets
 * an account (Supabase answers "Signups not allowed for otp"). Never reports
 * the outcome: see the enumeration note above. A cookie-less client, since
 * sending a code doesn't touch the visitor's session.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const started = Date.now();
  try {
    const { error } = await createPublicClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    const unknownEmail = error?.code === "otp_disabled" || /signups not allowed/i.test(error?.message ?? "");
    if (error && !unknownEmail) console.error("[portal-otp] signInWithOtp failed:", error.status, error.code, error.message);
  } catch (error) {
    console.error("[portal-otp] signInWithOtp threw:", error);
  }
  const remaining = MIN_SEND_MS - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
