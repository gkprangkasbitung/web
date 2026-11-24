import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BeritaAcara } from "@/components/pemilihan/berita-acara";
import { PemilihanLoadError } from "@/components/pemilihan/load-error";
import { requirePermission } from "@/lib/auth/session";
import { loadPemilihan, loadPencatat } from "@/lib/pemilihan/admin-data";
import type { Pencatat, PemilihanRow } from "@/lib/pemilihan/admin-types";
import { loadHasilPartisipasi, loadHasilSuara, loadKontes } from "@/lib/pemilihan/data";
import type { HasilKandidat, HasilPartisipasi, Kontes } from "@/lib/pemilihan/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Berita Acara Pemilihan" };

/** Brief §18.4: after close, for pemilihan_hasil:read (it carries the tallies) and pemilihan:read (RLS on the election). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("pemilihan_hasil", "read");
  await requirePermission("pemilihan", "read");
  const { id } = await params;
  const supabase = await createClient();

  let row: PemilihanRow | null;
  try {
    row = await loadPemilihan(supabase, id);
  } catch {
    return <PemilihanLoadError title="Berita Acara" />;
  }
  if (!row) notFound();
  if (row.status !== "ditutup" && row.status !== "diumumkan") {
    return <PemilihanLoadError title="Berita Acara" message="Berita acara tersedia setelah pemilihan ditutup." />;
  }

  let data: { pencatat: Pencatat; partisipasi: HasilPartisipasi; suara: HasilKandidat[]; kontes: Kontes[] };
  try {
    const [pencatat, partisipasi, suara, kontes] = await Promise.all([
      loadPencatat(supabase, id),
      loadHasilPartisipasi(supabase, id),
      loadHasilSuara(supabase, id),
      loadKontes(supabase),
    ]);
    data = { pencatat, partisipasi, suara, kontes };
  } catch {
    return <PemilihanLoadError title="Berita Acara" />;
  }

  return <BeritaAcara row={row} {...data} />;
}
