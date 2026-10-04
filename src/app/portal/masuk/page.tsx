import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalSplitLayout } from "@/components/portal/portal-split-layout";
import { isJemaat } from "@/lib/auth/portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getAuthenticatedUser } from "@/lib/auth/session";

import { PortalLoginForm } from "./portal-login-form";

export const metadata: Metadata = { title: "Masuk Portal Jemaat" };

/** Portal Jemaat sign-in with an email code (docs/design/portal-login-jemaat.html, stage 11f). */
export default async function PortalMasukPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext, "jemaat");

  // Already signed in as a jemaat: straight on. Any other account sees the
  // form, to sign in as someone else.
  const user = await getAuthenticatedUser();
  if (user && isJemaat(user)) redirect(next);

  return (
    <PortalSplitLayout
      variant="jemaat"
      eyebrow="Portal Jemaat"
      headline="Selamat datang kembali"
      description="Masuk tanpa perlu mengingat password. Kami akan mengirim kode 6 digit ke email Anda yang terdaftar di sekretariat."
    >
      <PortalLoginForm next={next} linkExpired={error === "tautan"} />
    </PortalSplitLayout>
  );
}
