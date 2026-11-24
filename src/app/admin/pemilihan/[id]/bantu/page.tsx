import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BantuMemilih } from "@/components/pemilihan/bantu-memilih";
import { PemilihanLoadError } from "@/components/pemilihan/load-error";
import { requirePermission } from "@/lib/auth/session";
import { loadBelumMemilih, loadKandidatAdmin, loadPemilihanUntukBantu } from "@/lib/pemilihan/admin-data";
import type { PemilihanBantu, PemilihBantu } from "@/lib/pemilihan/admin-types";
import { loadKontes } from "@/lib/pemilihan/data";
import type { Kandidat, Kontes } from "@/lib/pemilihan/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bantu Memilih" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("pemilihan_bantu", "create");
  const { id } = await params;
  const supabase = await createClient();

  let pemilihan: PemilihanBantu | null;
  try {
    pemilihan = await loadPemilihanUntukBantu(supabase, id);
  } catch {
    return <PemilihanLoadError title="Bantu Memilih" />;
  }
  if (!pemilihan) notFound();

  let data: { kontes: Kontes[]; kandidat: Kandidat[]; pemilih: PemilihBantu[] } = { kontes: [], kandidat: [], pemilih: [] };
  if (pemilihan.status === "dibuka") {
    try {
      const [kontes, kandidat, pemilih] = await Promise.all([
        loadKontes(supabase),
        loadKandidatAdmin(supabase, id),
        loadBelumMemilih(supabase, id),
      ]);
      data = { kontes, kandidat, pemilih };
    } catch {
      return <PemilihanLoadError title="Bantu Memilih" />;
    }
  }

  return <BantuMemilih pemilihan={pemilihan} {...data} />;
}
