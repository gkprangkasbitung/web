import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SaranaDanaLedgerManager } from "@/components/sarana-dana/sarana-dana-ledger-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { parseLedgerRangeParam } from "@/lib/sarana-dana";
import { loadSaranaDanaFormOptions, loadSaranaDanaLedger } from "@/lib/sarana-dana-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sarana & Dana" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tanggal?: string }>;
}) {
  const { key } = await params;
  const { tanggal } = await searchParams;
  const range = parseLedgerRangeParam(tanggal);

  const user = await requirePermission("warta", "read");
  const supabase = await createClient();

  const [ledgerRes, peopleOptions] = await Promise.all([
    loadSaranaDanaLedger(supabase, key, range),
    loadSaranaDanaFormOptions(supabase),
  ]);

  if (ledgerRes.error) {
    console.error(`[/admin/sarana-dana/${key}] Failed to load:`, ledgerRes.error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Sarana & Dana" />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!ledgerRes.data) notFound();

  return (
    <SaranaDanaLedgerManager
      item={ledgerRes.data.item}
      rows={ledgerRes.data.rows}
      peopleOptions={peopleOptions}
      canWrite={can(user, "warta", "update")}
      initialRange={range}
    />
  );
}
