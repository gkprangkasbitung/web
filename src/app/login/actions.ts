"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logActivity } from "@/lib/activity-log";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
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

  await logActivity({
    supabase,
    user: { id: data.user.id, email: data.user.email ?? parsed.data.email },
    module: "auth",
    activity: "Login",
  });

  redirect(safeNextPath(parsed.data.next));
}
