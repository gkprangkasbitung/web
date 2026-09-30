import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { ContactCards, WhatsappButton } from "@/components/public/contact-cards";
import { MapLink } from "@/components/public/map-link";
import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { loadKontakContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Kontak",
  description: "Alamat dan kontak GKP Rangkasbitung.",
};

/**
 * Brief §8, §14.6, docs/design/kontak.html: no form, the contact cards from
 * Profil Gereja (each hidden when empty), a wa.me link when there is a
 * number, and a Google Maps link when there is a URL. Renders per request.
 */
export default async function KontakPage() {
  const content = await loadKontakContent();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Kontak"
        title="Hubungi Kami"
        description="Sekretariat siap membantu pertanyaan seputar ibadah, pelayanan, dan administrasi jemaat."
      />

      <PublicContainer>
        {content.error !== null ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Gagal memuat kontak. Muat ulang halaman untuk mencoba lagi.
          </p>
        ) : !content.data.kontak ? (
          <p className="text-muted-foreground">Informasi kontak belum tersedia.</p>
        ) : (
          <div
            className={
              content.data.kontak.mapsUrl
                ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-stretch"
                : "flex max-w-xl flex-col gap-6"
            }
          >
            <div className="flex flex-col gap-4">
              <ContactCards kontak={content.data.kontak} />
              {content.data.waLink && <WhatsappButton waLink={content.data.waLink} />}
            </div>
            {content.data.kontak.mapsUrl && <MapLink mapsUrl={content.data.kontak.mapsUrl} className="min-h-full" />}
          </div>
        )}
      </PublicContainer>
    </>
  );
}
