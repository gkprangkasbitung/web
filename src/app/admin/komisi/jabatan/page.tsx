import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { JabatanManager } from "@/components/komisi/jabatan-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadJabatanKomisiList } from "@/lib/komisi-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jabatan Komisi" };

export default async function Page() {
  const user = await requirePermission("situs", "read");
  const supabase = await createClient();
  const { data, error } = await loadJabatanKomisiList(supabase);

  if (error || !data) {
    console.error("[/admin/komisi/jabatan] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Jabatan Komisi" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <JabatanManager
      rows={data}
      canCreate={can(user, "situs", "create")}
      canWrite={can(user, "situs", "update")}
      canDelete={can(user, "situs", "delete")}
    />
  );
}
