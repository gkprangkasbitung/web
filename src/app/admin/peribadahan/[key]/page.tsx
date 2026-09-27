import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { PeribadahanManager } from "@/components/peribadahan/peribadahan-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPeribadahanCategoryOverview, loadPeribadahanFormOptions } from "@/lib/peribadahan-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Peribadahan" };

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const [overviewRes, optionsRes] = await Promise.all([
    loadPeribadahanCategoryOverview(supabase, key),
    loadPeribadahanFormOptions(supabase),
  ]);

  if (overviewRes.error || !optionsRes.data) {
    console.error(`[/admin/peribadahan/${key}] Failed to load:`, overviewRes.error ?? optionsRes.error);
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
  if (!overviewRes.data) notFound();

  return (
    <PeribadahanManager
      scope={{ type: "category", key: overviewRes.data.category.key, name: overviewRes.data.category.name }}
      rows={overviewRes.data.rows}
      categories={[]}
      tempatOptions={optionsRes.data.tempatOptions}
      wilayahOptions={optionsRes.data.wilayahOptions}
      peopleOptions={optionsRes.data.peopleOptions}
      smkaGroups={overviewRes.data.smkaGroups}
      canWrite={can(user, "warta", "update")}
    />
  );
}
