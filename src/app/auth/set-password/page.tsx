import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { requireUser } from "@/lib/auth/session";

import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Atur Password" };

export default async function SetPasswordPage() {
  const user = await requireUser();

  return (
    <AuthCard
      title="Atur Password"
      description={`Selamat datang, ${user.email}. Buat password untuk akun kamu.`}
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
