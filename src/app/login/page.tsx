import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getAuthenticatedUser } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk Admin" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  // A signed-in visitor is sent on the same way as after a login.
  if (await getAuthenticatedUser()) redirect(next);

  return (
    <AuthCard title="Masuk Admin" description="Khusus untuk pengurus dan admin GKP Rangkasbitung.">
      <LoginForm next={next} />
    </AuthCard>
  );
}
