import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { SaranaDanaOverviewManager } from "@/components/sarana-dana/sarana-dana-overview-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadSaranaDanaOverview } from "@/lib/sarana-dana-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sarana & Dana" };

export default async function Page() {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await loadSaranaDanaOverview(supabase);

  if (error || !data) {
    console.error("[/admin/sarana-dana] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Sarana & Dana" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <SaranaDanaOverviewManager items={data} canWrite={can(user, "warta", "update")} />;
}
