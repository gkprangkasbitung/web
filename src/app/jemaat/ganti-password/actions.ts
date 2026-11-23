"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logActivity } from "@/lib/activity-log";
import { isJemaat } from "@/lib/auth/portal";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type GantiPasswordState = { error: string | null };

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password minimal 8 karakter.").max(72, "Password maksimal 72 karakter."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Konfirmasi password tidak sama." });

/**
 * The forced change after a temporary password (brief §18.7): the new
 * password is set on the signed-in account, then wajib_ganti_password is
 * cleared, and the jemaat continues to /jemaat. Neither password is logged
 * or echoed back.
 */
export async function gantiPasswordSementara(
  _previous: GantiPasswordState,
  formData: FormData,
): Promise<GantiPasswordState> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/portal/masuk");
  if (!isJemaat(user)) redirect("/portal?error=akses");
  if (!user.wajibGantiPassword) redirect("/jemaat");

  const parsed = passwordSchema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Password tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "Password baru harus berbeda dari password sementara." };
    if (error.code === "weak_password") return { error: "Password terlalu lemah. Pakai gabungan huruf dan angka." };
    console.error("[ganti-password] updateUser failed:", error.code ?? error.status);
    return { error: "Gagal menyimpan password. Coba lagi." };
  }

  const cleared = await supabase.rpc("selesai_ganti_password_sementara");
  if (cleared.error) {
    // The password did change; the next visit lands here again and can retry.
    console.error("[ganti-password] clearing the flag failed:", cleared.error.code);
    return { error: "Password tersimpan, tapi gagal melanjutkan. Muat ulang halaman ini." };
  }

  await logActivity({ supabase, user, module: "akun", activity: "Mengganti password sementara" });
  redirect("/jemaat");
}
