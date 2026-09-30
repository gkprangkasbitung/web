import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { UsersManager } from "@/components/users/users-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadUsersOverview } from "@/lib/users-routes";

export const metadata: Metadata = { title: "Pengguna" };

export default async function Page() {
  const user = await requirePermission("users", "read");
  const supabase = await createClient();
  const { data, error } = await loadUsersOverview(supabase);

  if (error || !data) {
    console.error("[/admin/users] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pengguna" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <UsersManager
      overview={data}
      currentUserId={user.id}
      canCreate={can(user, "users", "create")}
      canUpdate={can(user, "users", "update")}
      canDelete={can(user, "users", "delete")}
    />
  );
}
