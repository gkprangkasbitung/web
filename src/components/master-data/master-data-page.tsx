import { CircleAlertIcon } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import type { MasterDataConfig } from "@/lib/master-data";
import { listMasterData } from "@/lib/master-data-routes";
import { createClient } from "@/lib/supabase/server";

import { MasterDataManager } from "./master-data-manager";

/** Server side of a master data page: `warta:read` to see it, `warta:update` to change it (brief §4). */
export async function MasterDataPage({ config }: { config: MasterDataConfig }) {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await listMasterData(supabase, config);

  if (error || !data) {
    console.error(`[${config.pagePath}] Failed to load:`, error?.message);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={config.title} description={config.description} />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <MasterDataManager config={config} rows={data} canWrite={can(user, "warta", "update")} />;
}
