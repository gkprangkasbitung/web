import type { Metadata } from "next";

import {
  PlaceholderBlock,
  PublicContainer,
  PublicPageHeader,
  PublicSection,
} from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Kontak",
  description: "Alamat dan kontak GKP Rangkasbitung.",
};

// No data: prerendered, refreshed daily so the footer's year rolls over.
export const revalidate = 86400;

/** Brief §8, §12.4: a real layout with placeholders; never invent an address or phone number. */
export default function KontakPage() {
  return (
    <PublicContainer narrow>
      <PublicPageHeader title="Kontak" description="Hubungi atau kunjungi GKP Rangkasbitung." />

      <PublicSection id="alamat" title="Alamat">
        {/* TODO(konten): the church's street address and, if wanted, a link to a map. */}
        <PlaceholderBlock />
      </PublicSection>

      <PublicSection id="hubungi" title="Hubungi kami">
        {/* TODO(konten): the official phone/WhatsApp number and email of the sekretariat. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <PlaceholderBlock title="Telepon / WhatsApp" />
          <PlaceholderBlock title="Email" />
        </div>
      </PublicSection>

      <PublicSection id="sekretariat" title="Jam pelayanan sekretariat">
        {/* TODO(konten): the sekretariat's opening days and hours. */}
        <PlaceholderBlock />
      </PublicSection>
    </PublicContainer>
  );
}
