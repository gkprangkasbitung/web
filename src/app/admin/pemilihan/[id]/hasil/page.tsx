import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HasilLive } from "@/components/pemilihan/hasil-live";
import { PemilihanLoadError } from "@/components/pemilihan/load-error";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPemilihan } from "@/lib/pemilihan/admin-data";
import type { HasilLive as HasilLiveData, PemilihanRow } from "@/lib/pemilihan/admin-types";
import { loadHasilPartisipasi, loadHasilSuara, loadKontes } from "@/lib/pemilihan/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hasil Pemilihan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("pemilihan", "read");
  const { id } = await params;
  const supabase = await createClient();
  const canHasil = can(user, "pemilihan_hasil", "read");

  let row: PemilihanRow | null;
  try {
    row = await loadPemilihan(supabase, id);
  } catch {
    return <PemilihanLoadError title="Hasil Pemilihan" />;
  }
  if (!row) notFound();

  let initial: HasilLiveData;
  let kontes;
  try {
    const [partisipasi, suara, k] = await Promise.all([
      loadHasilPartisipasi(supabase, id),
      canHasil ? loadHasilSuara(supabase, id) : Promise.resolve(null),
      loadKontes(supabase),
    ]);
    initial = { status: row.status, tampilkanHasil: row.tampilkanHasil, partisipasi, suara, waktu: new Date().toISOString() };
    kontes = k;
  } catch {
    return <PemilihanLoadError title={`Hasil: ${row.nama}`} />;
  }

  return (
    <HasilLive
      pemilihan={{ id: row.id, nama: row.nama }}
      kontes={kontes}
      initial={initial}
      canUpdate={can(user, "pemilihan", "update")}
      canBantu={can(user, "pemilihan_bantu", "create")}
    />
  );
}
