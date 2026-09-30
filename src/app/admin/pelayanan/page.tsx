import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { PelayananManager } from "@/components/pelayanan/pelayanan-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPelayananCards } from "@/lib/pelayanan-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pelayanan" };

export default async function Page() {
  const user = await requirePermission("situs", "read");
  const supabase = await createClient();
  const { data, error } = await loadPelayananCards(supabase);

  if (error || !data) {
    console.error("[/admin/pelayanan] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pelayanan" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <PelayananManager cards={data} canWrite={can(user, "situs", "update")} canDelete={can(user, "situs", "delete")} />;
}
