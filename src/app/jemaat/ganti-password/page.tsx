import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutJemaat } from "@/app/jemaat/actions";
import { PortalFormHeading, PortalSplitLayout } from "@/components/portal/portal-split-layout";
import { Button } from "@/components/ui/button";
import { accountLabel } from "@/lib/auth/portal";
import { requireJemaatAccount } from "@/lib/auth/session";

import { GantiPasswordForm } from "./ganti-password-form";

export const metadata: Metadata = { title: "Ganti Password" };

/**
 * The forced password change after a temporary password (brief §18.7). Outside
 * the (portal) group on purpose: its layout sends this account here, and
 * this page has no navigation to the pages it can't open yet. Only "Keluar"
 * leads away.
 */
export default async function GantiPasswordPage() {
  const user = await requireJemaatAccount();
  if (!user.wajibGantiPassword) redirect("/jemaat");

  return (
    <PortalSplitLayout
      variant="jemaat"
      eyebrow="Portal Jemaat"
      headline="Satu langkah lagi"
      description="Ganti password sementara dengan password Anda sendiri."
    >
      <PortalFormHeading title="Buat Password Baru">
        <p>
          Anda masuk sebagai <span className="font-medium text-foreground">{accountLabel(user)}</span> dengan password
          sementara. Buat password baru yang hanya Anda ketahui sebelum melanjutkan.
        </p>
      </PortalFormHeading>
      <GantiPasswordForm />
      <form action={logoutJemaat}>
        <Button type="submit" variant="ghost" className="h-11 w-full rounded-full text-base">
          Keluar
        </Button>
      </form>
    </PortalSplitLayout>
  );
}
