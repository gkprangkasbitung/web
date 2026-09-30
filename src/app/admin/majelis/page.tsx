import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { MajelisManager } from "@/components/majelis/majelis-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadMajelisCards } from "@/lib/majelis-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Majelis" };

export default async function Page() {
  const user = await requirePermission("situs", "read");
  const supabase = await createClient();
  const { data, error } = await loadMajelisCards(supabase);

  if (error || !data) {
    console.error("[/admin/majelis] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Majelis" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <MajelisManager cards={data} canWrite={can(user, "situs", "update")} canDelete={can(user, "situs", "delete")} />;
}
