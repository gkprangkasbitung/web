"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logActivity } from "@/lib/activity-log";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password minimal 8 karakter."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Konfirmasi password tidak sama." });

export async function setPassword(_previous: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const parsed = passwordSchema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Password tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Gagal menyimpan password. Coba lagi." };

  await logActivity({ supabase, user, module: "auth", activity: "Mengatur password awal" });
  redirect("/admin");
}
