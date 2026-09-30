import "server-only";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation } from "@/lib/api-mutation";
import { supabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";
import { optionalText } from "@/lib/validation";

const profileSchema = z.object({ fullName: optionalText(100) });

/** PATCH /api/account/profile: "Informasi Akun" (brief §9.14). Empty saves as null. */
export const updateOwnProfile = mutation({
  permission: "signed-in",
  schema: profileSchema,
  async run({ input, user, supabase }) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: input.fullName })
      .eq("id", user.id)
      .select("full_name")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "Profil tidak ditemukan.");
    return {
      data: { fullName: data.full_name },
      log: {
        module: "akun",
        activity: data.full_name ? `Mengubah nama lengkap menjadi ${quote(data.full_name)}` : "Mengosongkan nama lengkap",
      },
      // The account menu in the admin shell shows the name.
      revalidate: [{ path: "/admin", type: "layout" }],
    };
  },
});

export const PASSWORD_MIN = 8;

const passwordSchema = z
  .object({
    currentPassword: z.string({ error: "Password saat ini wajib diisi." }).min(1, "Password saat ini wajib diisi."),
    password: z.string({ error: "Password minimal 8 karakter." }).min(PASSWORD_MIN, "Password minimal 8 karakter.").max(72, "Password maksimal 72 karakter."),
    confirm: z.string({ error: "Konfirmasi password tidak sama." }),
  })
  .refine((value) => value.password === value.confirm, { message: "Konfirmasi password tidak sama.", path: ["confirm"] });

/**
 * Checks the current password with a throwaway, cookie-less sign-in, so the
 * user's own session is untouched. The throwaway session is revoked right
 * away. The email comes from the verified session, never from the request.
 */
async function verifyCurrentPassword(email: string, password: string): Promise<"ok" | "wrong" | "rate_limited"> {
  const { url, anonKey } = supabaseEnv();
  const client = createStatelessClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429 || error.code === "over_request_rate_limit") return "rate_limited";
    if (error.code === "invalid_credentials" || error.status === 400) return "wrong";
    throw new Error(`[password] verify: ${error.message}`);
  }
  if (data.session) {
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) console.error("[password] Failed to revoke the verification session:", signOutError.message);
  }
  return "ok";
}

/**
 * POST /api/account/password: "Ganti Password" (brief §9.14), plus the
 * current password (approved addition, stage 10). After the change every
 * other session of this account is signed out.
 */
export const changeOwnPassword = mutation({
  permission: "signed-in",
  schema: passwordSchema,
  async run({ input, user, supabase }) {
    const verified = await verifyCurrentPassword(user.email, input.currentPassword);
    if (verified === "wrong") throw new ApiError(400, "Password saat ini salah.");
    if (verified === "rate_limited") throw new ApiError(400, "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.");

    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      if (error.code === "same_password") throw new ApiError(400, "Password baru harus berbeda dari password saat ini.");
      if (error.code === "weak_password") throw new ApiError(400, "Password terlalu lemah. Pakai kombinasi yang lebih sulit ditebak.");
      throw new Error(`[password] update: ${error.message}`);
    }

    const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
    if (othersError) console.error("[password] Failed to sign out other sessions:", othersError.message);

    return { data: { ok: true }, log: { module: "akun", activity: "Mengganti password" } };
  },
});
