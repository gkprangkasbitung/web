import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { PendetaManager } from "@/components/pendeta/pendeta-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPendetaList } from "@/lib/pendeta-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pendeta" };

export default async function Page() {
  const user = await requirePermission("situs", "read");
  const supabase = await createClient();
  const [{ data, error }, profil] = await Promise.all([
    loadPendetaList(supabase),
    supabase.from("profil_gereja").select("sambutan_pendeta_id").eq("id", 1).maybeSingle(),
  ]);

  if (error || !data) {
    console.error("[/admin/pendeta] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pendeta" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <PendetaManager
      rows={data}
      sambutanPendetaId={profil.data?.sambutan_pendeta_id ?? null}
      canWrite={can(user, "situs", "update")}
      canDelete={can(user, "situs", "delete")}
    />
  );
}
