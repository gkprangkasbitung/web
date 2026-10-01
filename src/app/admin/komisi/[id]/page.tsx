import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KomisiDetailView } from "@/components/komisi/komisi-detail-view";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadJabatanKomisiList, loadKomisiDetail, loadKomisiPeopleOptions } from "@/lib/komisi-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail Komisi" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requirePermission("situs", "read");
  const supabase = await createClient();

  const [detailRes, jabatanRes, people] = await Promise.all([
    loadKomisiDetail(supabase, id),
    loadJabatanKomisiList(supabase),
    loadKomisiPeopleOptions(supabase),
  ]);

  if (detailRes.error || !jabatanRes.data) {
    console.error(`[/admin/komisi/${id}] Failed to load:`, detailRes.error ?? jabatanRes.error);
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Gagal memuat data</AlertTitle>
        <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
      </Alert>
    );
  }
  if (!detailRes.data) notFound();

  return (
    <KomisiDetailView
      komisi={detailRes.data}
      jabatanOptions={jabatanRes.data}
      pembinaOptions={people.pembinaOptions}
      anggotaOptions={people.anggotaOptions}
      canWrite={can(user, "situs", "update")}
      canDelete={can(user, "situs", "delete")}
      canManageAnggota={can(user, "situs", "update") && can(user, "warta", "read")}
    />
  );
}
