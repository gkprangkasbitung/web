import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { WartaListManager } from "@/components/warta/warta-list-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadWartaList } from "@/lib/warta-routes";

export const metadata: Metadata = { title: "Warta" };

export default async function Page() {
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();
  const { data, error } = await loadWartaList(supabase);

  if (error || !data) {
    console.error("[/admin/warta] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Warta" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <WartaListManager
      rows={data}
      canWrite={can(user, "warta", "update")}
      canCreate={can(user, "warta", "create")}
      canDelete={can(user, "warta", "delete")}
    />
  );
}
