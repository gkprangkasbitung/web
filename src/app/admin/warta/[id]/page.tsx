import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WartaEditor } from "@/components/warta/warta-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { financeWeek, serviceWeek } from "@/lib/dates";
import { loadPeribadahanFormOptions, loadPeribadahanRange } from "@/lib/peribadahan-routes";
import { loadWartaFinance } from "@/lib/sarana-dana-routes";
import { createClient } from "@/lib/supabase/server";
import { loadWartaEditor } from "@/lib/warta-routes";

export const metadata: Metadata = { title: "Edit Warta" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function LoadError() {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>Gagal memuat data</AlertTitle>
      <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
    </Alert>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const editorRes = await loadWartaEditor(supabase, id);
  if (editorRes.error) {
    console.error(`[/admin/warta/${id}] Failed to load:`, editorRes.error);
    return <LoadError />;
  }
  if (!editorRes.data) notFound();

  // Both weeks come from tanggal kebaktian (brief §11), the same arithmetic as the public page.
  const { warta, litbang, kesaksian } = editorRes.data;
  const service = serviceWeek(warta.tanggalKebaktian);
  const finance = financeWeek(warta.tanggalKebaktian);

  const [scheduleRes, financeRes, optionsRes] = await Promise.all([
    loadPeribadahanRange(supabase, service),
    loadWartaFinance(supabase, finance),
    loadPeribadahanFormOptions(supabase),
  ]);
  if (!scheduleRes.data || !financeRes.data || !optionsRes.data) {
    console.error(`[/admin/warta/${id}] Failed to load:`, scheduleRes.error ?? financeRes.error ?? optionsRes.error);
    return <LoadError />;
  }

  return (
    <WartaEditor
      // Remount per warta so each section's local form state starts from this warta.
      key={warta.id}
      warta={warta}
      litbang={litbang}
      kesaksian={kesaksian}
      serviceWeek={service}
      schedule={{
        ...scheduleRes.data,
        tempatOptions: optionsRes.data.tempatOptions,
        wilayahOptions: optionsRes.data.wilayahOptions,
      }}
      financeWeek={finance}
      finance={financeRes.data}
      peopleOptions={optionsRes.data.peopleOptions}
      canWrite={can(user, "warta", "update")}
      canDelete={can(user, "warta", "delete")}
    />
  );
}
