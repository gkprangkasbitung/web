import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KeluargaDetailView } from "@/components/keluarga/keluarga-detail-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listPeopleForPicker } from "@/lib/jemaat-routes";
import { loadKeluargaDetail } from "@/lib/keluarga-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail Keluarga" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const [detailRes, people] = await Promise.all([loadKeluargaDetail(supabase, id), listPeopleForPicker(supabase)]);

  if (detailRes.error) {
    console.error(`[/admin/keluarga/${id}] Failed to load:`, detailRes.error);
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Gagal memuat data</AlertTitle>
        <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
      </Alert>
    );
  }
  if (!detailRes.data) notFound();

  return <KeluargaDetailView keluarga={detailRes.data} people={people} canWrite={can(user, "warta", "update")} />;
}
