import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { PeribadahanManager } from "@/components/peribadahan/peribadahan-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPeribadahanFormOptions, loadPeribadahanOverview } from "@/lib/peribadahan-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Peribadahan" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const search = q ?? "";
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const [overviewRes, optionsRes] = await Promise.all([
    loadPeribadahanOverview(supabase, search),
    loadPeribadahanFormOptions(supabase),
  ]);

  if (overviewRes.error || !overviewRes.data || !optionsRes.data) {
    console.error("[/admin/peribadahan] Failed to load:", overviewRes.error ?? optionsRes.error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Peribadahan" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <PeribadahanManager
      scope={{ type: "all" }}
      rows={overviewRes.data.rows}
      categories={overviewRes.data.categories}
      tempatOptions={optionsRes.data.tempatOptions}
      wilayahOptions={optionsRes.data.wilayahOptions}
      peopleOptions={optionsRes.data.peopleOptions}
      smkaGroups={overviewRes.data.smkaGroups}
      canWrite={can(user, "warta", "update")}
      initialSearch={search}
    />
  );
}
