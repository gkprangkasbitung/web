import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { LitbangManager } from "@/components/litbang/litbang-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadLitbangCards } from "@/lib/litbang-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Litbang" };

export default async function Page() {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await loadLitbangCards(supabase);

  if (error || !data) {
    console.error("[/admin/litbang] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Litbang" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <LitbangManager cards={data} canWrite={can(user, "warta", "update")} />;
}
