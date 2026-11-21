"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logActivity } from "@/lib/activity-log";
import { isJemaat, PORTAL_LABEL } from "@/lib/auth/portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { loadAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PortalLoginState = { error: string | null; email: string };

const NOT_JEMAAT = "Akun ini belum terhubung ke data jemaat. Hubungi sekretariat untuk aktivasi Portal Jemaat.";

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Portal Jemaat sign-in with email + password, mirroring `/login`'s own
 * action: the password proves the account; its link to a jemaat decides
 * access, checked after signing in, never before (so a wrong password and
 * an unlinked account answer the same way a visitor can't tell apart).
 */
export async function portalLogin(_previous: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password") ?? "",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Email dan password wajib diisi.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Email atau password salah.", email };

  const user = await loadAuthUser(supabase);
  if (!user || !isJemaat(user)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: NOT_JEMAAT, email };
  }

  await logActivity({ supabase, user, module: "auth", activity: `Login ke ${PORTAL_LABEL.jemaat}` });
  redirect(safeNextPath(parsed.data.next, "jemaat"));
}
