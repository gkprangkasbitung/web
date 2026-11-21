import type { Metadata } from "next";

import { JemaatShell } from "@/components/jemaat-portal/jemaat-shell";
import { isStaff } from "@/lib/auth/portal";
import { displayName, requireJemaat } from "@/lib/auth/session";
import { jemaatNav } from "@/lib/jemaat-portal-nav";
import { loadMyJemaat } from "@/lib/jemaat-portal";
import { loadPengaturanPortal } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { template: "%s — Portal Jemaat", default: "Portal Jemaat" } };

/**
 * The Portal Jemaat shell (brief §17.3, stage 13b): every page under
 * `/jemaat` is signed in and linked to a jemaat (`requireJemaat`), reads its
 * data in this layout and its pages only through `lib/portal` with the
 * caller's own session — never the service role, never a client-side fetch.
 */
export default async function JemaatLayout({ children }: { children: React.ReactNode }) {
  const user = await requireJemaat();
  const supabase = await createClient();
  const [jemaat, tampilkanPersembahan] = await Promise.all([
    loadMyJemaat(supabase),
    // Defensive, like loadMyJemaat: the nav must still render if this
    // one call fails, and /jemaat/persembahan checks the setting again
    // itself before showing anything.
    loadPengaturanPortal(supabase)
      .then((setting) => setting.tampilkanPersembahan)
      .catch((error: unknown) => {
        console.error("[/jemaat] pengaturan_portal failed:", error);
        return false;
      }),
  ]);

  return (
    <JemaatShell
      items={jemaatNav(tampilkanPersembahan)}
      nama={jemaat?.nama ?? displayName(user)}
      email={user.email}
      isStaffToo={isStaff(user)}
    >
      {children}
    </JemaatShell>
  );
}
