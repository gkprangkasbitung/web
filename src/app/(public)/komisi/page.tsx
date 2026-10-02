import type { Metadata } from "next";

import { KomisiGrid } from "@/components/public/komisi-grid";
import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { loadKomisiListContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Komisi",
  description: "Komisi pelayanan di GKP Rangkasbitung.",
};

/** Brief §14.8: tampil komisi only, in the admin's own order. */
export default async function KomisiListPage() {
  const result = await loadKomisiListContent();
  if (result.error !== null) throw new Error("Failed to load the komisi list.");

  return (
    <>
      <PublicPageTitleBand breadcrumb="Beranda / Komisi" title="Komisi" description="Komisi-komisi pelayanan di GKP Rangkasbitung." />

      <PublicContainer>
        {result.data.length === 0 ? (
          <p className="text-muted-foreground">Belum ada komisi yang ditampilkan.</p>
        ) : (
          <KomisiGrid items={result.data} />
        )}
      </PublicContainer>
    </>
  );
}
