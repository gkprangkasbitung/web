import type { Metadata } from "next";

import { ContactCards, WhatsappButton } from "@/components/public/contact-cards";
import { MapPlaceholder } from "@/components/public/map-placeholder";
import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { loadKontakContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Kontak",
  description: "Alamat dan kontak GKP Rangkasbitung.",
};

// No data yet beyond the loader's placeholders: prerendered, refreshed daily so the footer's year rolls over.
export const revalidate = 86400;

/** Brief §8, §9c instruction D, docs/design/kontak.html: no form, a real wa.me link, and a map placeholder. */
export default function KontakPage() {
  const content = loadKontakContent();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Kontak"
        title="Hubungi Kami"
        description="Sekretariat siap membantu pertanyaan seputar ibadah, pelayanan, dan administrasi jemaat."
      />

      <PublicContainer>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-stretch">
          <div className="flex flex-col gap-4">
            <ContactCards kontak={content.kontak} />
            <WhatsappButton waLink={content.waLink} />
          </div>
          <MapPlaceholder className="min-h-full" />
        </div>
      </PublicContainer>
    </>
  );
}
