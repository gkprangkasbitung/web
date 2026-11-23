import type { Metadata } from "next";

import { PelayananTabs } from "@/components/jemaat-portal/pelayanan-tabs";
import { requireJemaat } from "@/lib/auth/session";
import { addDays, today } from "@/lib/dates";
import { loadPelayananSaya, PortalError } from "@/lib/portal/data";
import type { PelayananSaya } from "@/lib/portal/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pelayanan Saya" };

/**
 * Pelayanan Saya (brief §17.3): "Akan datang" (today through +59 days,
 * 60 days inclusive) and "Riwayat" (the 90 days before today, so the two
 * ranges never overlap), each grouped by date with the role as a badge.
 */
export default async function PelayananPage() {
  await requireJemaat();
  const supabase = await createClient();
  const now = today();

  let akanDatang: PelayananSaya[] = [];
  let riwayat: PelayananSaya[] = [];
  let error: string | null = null;
  try {
    [akanDatang, riwayat] = await Promise.all([
      loadPelayananSaya(supabase, now, addDays(now, 59)),
      loadPelayananSaya(supabase, addDays(now, -90), addDays(now, -1)),
    ]);
  } catch (loadError) {
    error = loadError instanceof PortalError ? loadError.message : "Terjadi kesalahan di server. Coba lagi.";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl font-normal tracking-tight">Pelayanan Saya</h1>
        <p className="text-sm text-muted-foreground">Jadwal pelayanan Anda, yang akan datang dan yang sudah lewat.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : <PelayananTabs akanDatang={akanDatang} riwayat={riwayat} />}
    </div>
  );
}
