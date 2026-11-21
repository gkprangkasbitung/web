import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { requireJemaat } from "@/lib/auth/session";
import { loadKomisiSaya, PortalError } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Komisi Saya" };

/** Komisi Saya (brief §17.3): the komisi the caller belongs to (or is pembina of), and the role. */
export default async function KomisiPage() {
  await requireJemaat();
  const supabase = await createClient();

  let komisi: Awaited<ReturnType<typeof loadKomisiSaya>> = [];
  let error: string | null = null;
  try {
    komisi = await loadKomisiSaya(supabase);
  } catch (loadError) {
    error = loadError instanceof PortalError ? loadError.message : "Terjadi kesalahan di server. Coba lagi.";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl font-normal tracking-tight">Komisi Saya</h1>
        <p className="text-sm text-muted-foreground">Komisi yang Anda ikuti, dan jabatan Anda di dalamnya.</p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : komisi.length === 0 ? (
        <p className="text-sm text-muted-foreground">Anda belum tercatat sebagai anggota komisi apa pun.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {komisi.map((item, index) => (
            <li
              key={index}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5"
            >
              <div className="flex flex-col">
                <span className="font-medium">{item.komisiNama}</span>
                {item.periode && <span className="text-sm text-muted-foreground">{item.periode}</span>}
              </div>
              <Badge variant="accent">{item.jabatanNama}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
