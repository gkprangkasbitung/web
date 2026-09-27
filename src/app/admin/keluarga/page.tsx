import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { KeluargaManager } from "@/components/keluarga/keluarga-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadKeluargaOverview } from "@/lib/keluarga-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Keluarga" };

export default async function Page() {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await loadKeluargaOverview(supabase);

  if (error || !data) {
    console.error("[/admin/keluarga] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Keluarga" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <KeluargaManager rows={data} canWrite={can(user, "warta", "update")} />;
}
