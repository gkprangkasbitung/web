import type { Metadata } from "next";

import {
  PlaceholderBlock,
  PublicContainer,
  PublicPageHeader,
  PublicSection,
} from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description: "Tentang GKP Rangkasbitung.",
};

// No data: prerendered, refreshed daily so the footer's year rolls over.
export const revalidate = 86400;

/** Brief §8, §12.4: a real layout; every piece of content is a placeholder until the church supplies it. */
export default function TentangKamiPage() {
  return (
    <PublicContainer narrow>
      <PublicPageHeader title="Tentang Kami" description="Mengenal GKP Rangkasbitung." />

      <PublicSection id="sejarah" title="Sejarah">
        {/* TODO(konten): the congregation's history (founding, milestones), supplied by the church. */}
        <PlaceholderBlock />
      </PublicSection>

      <PublicSection id="visi-misi" title="Visi dan Misi">
        {/* TODO(konten): the official vision and mission statements. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <PlaceholderBlock title="Visi" />
          <PlaceholderBlock title="Misi" />
        </div>
      </PublicSection>

      <PublicSection id="pelayan" title="Pelayan Jemaat">
        {/* TODO(konten): pastor(s) and majelis, only with their consent to be listed publicly. */}
        <PlaceholderBlock />
      </PublicSection>
    </PublicContainer>
  );
}
