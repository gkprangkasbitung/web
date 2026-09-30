import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { RolesManager } from "@/components/roles/roles-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadRolesOverview } from "@/lib/roles-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function Page() {
  const user = await requirePermission("roles", "read");
  const supabase = await createClient();
  const { data, error } = await loadRolesOverview(supabase);

  if (error || !data) {
    console.error("[/admin/roles] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Roles & Permissions" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <RolesManager
      overview={data}
      canCreate={can(user, "roles", "create")}
      canUpdate={can(user, "roles", "update")}
      canDelete={can(user, "roles", "delete")}
    />
  );
}
