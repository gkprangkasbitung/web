import type { Metadata } from "next";

import { MajelisGrid } from "@/components/public/majelis-grid";
import { PendetaFeatured, PendetaPastGrid } from "@/components/public/pendeta-grid";
import { PublicContainer, PublicPageTitleBand, PublicSection } from "@/components/public/public-shell";
import { loadPendetaMajelisContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Pendeta & Majelis",
  description: "Pendeta dan majelis jemaat GKP Rangkasbitung.",
};

/**
 * Brief §14.3, §14.7, stage 11g follow-up: Pendeta Jemaat and Majelis each
 * come from their own module, split out of Tentang Kami onto their own page
 * (reached from the header's "Tentang Kami" dropdown, like Komisi). Every
 * section is hidden when empty. Renders per request (the loader calls
 * `connection()`), so an edit shows on the next visit.
 */
export default async function PendetaMajelisPage() {
  const { pendetaMelayani, pendetaPernahMelayani, majelis } = await loadPendetaMajelisContent();
  const isEmpty = pendetaMelayani.length === 0 && pendetaPernahMelayani.length === 0 && majelis.length === 0;

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Tentang Kami / Pendeta & Majelis"
        title="Pendeta & Majelis"
        description="Pendeta dan majelis yang melayani di GKP Rangkasbitung."
      />

      <PublicContainer>
        {isEmpty && <p className="text-muted-foreground">Belum ada data pendeta atau majelis yang ditampilkan.</p>}

        {pendetaMelayani.length > 0 && (
          <PublicSection id="pendeta" title="Pendeta Jemaat">
            <PendetaFeatured items={pendetaMelayani} />
          </PublicSection>
        )}

        {pendetaPernahMelayani.length > 0 && (
          <PublicSection id="pendeta-pernah-melayani" title="Pendeta yang pernah melayani">
            <PendetaPastGrid items={pendetaPernahMelayani} />
          </PublicSection>
        )}

        {majelis.length > 0 && (
          <PublicSection id="pelayan" title="Majelis Jemaat">
            <MajelisGrid items={majelis} />
          </PublicSection>
        )}
      </PublicContainer>
    </>
  );
}
