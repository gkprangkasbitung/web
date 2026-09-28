import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JemaatDetailView } from "@/components/jemaat/jemaat-detail-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadCatatanPastoral, loadJemaatDetail, loadJemaatFormOptions } from "@/lib/jemaat-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail Jemaat" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const [detailRes, optionsRes] = await Promise.all([loadJemaatDetail(supabase, id), loadJemaatFormOptions(supabase)]);

  if (detailRes.error || !optionsRes.data) {
    console.error(`[/admin/jemaat/${id}] Failed to load:`, detailRes.error ?? optionsRes.error);
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Gagal memuat data</AlertTitle>
        <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
      </Alert>
    );
  }
  if (!detailRes.data) notFound();

  const catatanRes = await loadCatatanPastoral(supabase, id);
  const labelsById = new Map(optionsRes.data.labelOptions.map((label) => [label.id, label.nama]));

  return (
    <JemaatDetailView
      detail={detailRes.data}
      catatan={catatanRes.data}
      options={optionsRes.data}
      labelsById={labelsById}
      canWrite={can(user, "warta", "update")}
    />
  );
}
