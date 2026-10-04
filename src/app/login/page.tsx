import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalFormHeading, PortalSplitLayout, portalLinkClass } from "@/components/portal/portal-split-layout";
import { isStaff } from "@/lib/auth/portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getAuthenticatedUser } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk Admin" };

/** Brief §6, restyled per docs/design/portal-login-admin.html (stage 11f). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext, "admin");

  // A signed-in staff account is sent on the same way as after a login. Any
  // other signed-in account sees the form, to sign in as someone else.
  const user = await getAuthenticatedUser();
  if (user && isStaff(user)) redirect(next);

  return (
    <PortalSplitLayout
      variant="admin"
      eyebrow="Pengurus & Admin"
      headline="Ruang kerja pengurus gereja"
      description="Warta, jadwal ibadah, data jemaat, keuangan, dan konten website dikelola dari sini."
      footnote="Akses hanya untuk akun yang diundang oleh admin."
    >
      <PortalFormHeading title="Masuk Admin">
        <p>Khusus untuk pengurus dan admin GKP Rangkasbitung.</p>
      </PortalFormHeading>
      <LoginForm next={next} />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Jemaat?{" "}
        <Link href="/portal/masuk" className={portalLinkClass}>
          Masuk ke Portal Jemaat
        </Link>
      </p>
    </PortalSplitLayout>
  );
}
