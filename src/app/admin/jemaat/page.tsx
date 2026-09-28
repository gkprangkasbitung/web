import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { JemaatManager } from "@/components/jemaat/jemaat-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadJemaatOverview } from "@/lib/jemaat-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Data Jemaat" };

export default async function Page() {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await loadJemaatOverview(supabase);

  if (error || !data) {
    console.error("[/admin/jemaat] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Data Jemaat" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <JemaatManager overview={data} canWrite={can(user, "warta", "update")} />;
}
