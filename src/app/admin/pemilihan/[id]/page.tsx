import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PemilihanLoadError } from "@/components/pemilihan/load-error";
import { PemilihanDetail } from "@/components/pemilihan/pemilihan-detail";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadBarisImpor, loadJemaatPilihan, loadPemilihan, loadPencatat, loadPeserta } from "@/lib/pemilihan/admin-data";
import type { PemilihanRow } from "@/lib/pemilihan/admin-types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pemilihan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("pemilihan", "read");
  const { id } = await params;
  const supabase = await createClient();
  const canUpdate = can(user, "pemilihan", "update");

  let row: PemilihanRow | null;
  try {
    row = await loadPemilihan(supabase, id);
  } catch {
    return <PemilihanLoadError title="Pemilihan" />;
  }
  if (!row) notFound();

  const bisaUbahDaftar = canUpdate && row.status === "draft";
  let rest;
  try {
    const [pencatat, baris, peserta, jemaat] = await Promise.all([
      loadPencatat(supabase, id),
      loadBarisImpor(supabase, id),
      loadPeserta(supabase, id),
      // The picker and the matching need Data Jemaat; only for those who may change the list.
      bisaUbahDaftar ? loadJemaatPilihan(supabase) : Promise.resolve([]),
    ]);
    rest = { pencatat, baris, peserta, jemaat };
  } catch {
    return <PemilihanLoadError title={row.nama} />;
  }

  return (
    <PemilihanDetail
      row={row}
      {...rest}
      canUpdate={canUpdate}
      canHasil={can(user, "pemilihan_hasil", "read")}
      canBantu={can(user, "pemilihan_bantu", "create")}
    />
  );
}
