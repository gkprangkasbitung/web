import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ActivityLogTable } from "@/components/activity-log/activity-log-table";
import { PageHeader } from "@/components/admin/page-header";
import { parseTableSearchParams, tableStateToSearchParams } from "@/components/data-table/search-params";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadActivityLogPage } from "@/lib/activity-log-routes";
import { ACTIVITY_LOG_TABLE_CONFIG } from "@/lib/activity-log-table";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log Aktivitas" };

const TITLE = "Log Aktivitas";
const DESCRIPTION =
  "Setiap perubahan di admin tercatat otomatis: siapa, apa, dan dari mana. Catatan ini tidak bisa diubah atau dihapus.";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("activity_log", "read");
  const state = parseTableSearchParams(await searchParams, ACTIVITY_LOG_TABLE_CONFIG);
  const supabase = await createClient();
  const { data, error } = await loadActivityLogPage(supabase, state);

  if (error || !data) {
    console.error("[/admin/log-aktivitas] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat log</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // A page past the end: go to the last page, so the URL matches what is shown.
  if (data.pageIndex !== state.pagination.pageIndex) {
    const params = tableStateToSearchParams(
      { ...state, pagination: { ...state.pagination, pageIndex: data.pageIndex } },
      ACTIVITY_LOG_TABLE_CONFIG,
    );
    const query = params.toString();
    redirect(query ? `/admin/log-aktivitas?${query}` : "/admin/log-aktivitas");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <ActivityLogTable rows={data.rows} total={data.total} />
    </div>
  );
}
