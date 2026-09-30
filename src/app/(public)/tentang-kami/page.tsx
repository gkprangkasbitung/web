import type { Metadata } from "next";

import { MajelisGrid } from "@/components/public/majelis-grid";
import { PublicContainer, PublicPageTitleBand, PublicSection } from "@/components/public/public-shell";
import { Timeline } from "@/components/public/timeline";
import { loadTentangKamiContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description: "Tentang GKP Rangkasbitung.",
};

// No data: prerendered, refreshed daily so the footer's year rolls over.
export const revalidate = 86400;

/** Brief §8, docs/design/tentang-kami.html. Every piece of content is a placeholder until stage 11a/11b. */
export default function TentangKamiPage() {
  const content = loadTentangKamiContent();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Tentang Kami"
        title="Tentang Kami"
        description="Mengenal sejarah, panggilan, dan orang-orang yang melayani di GKP Rangkasbitung."
      />

      <PublicContainer>
        <PublicSection id="sejarah" title={content.sejarah.title}>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">{content.sejarah.text}</p>
        </PublicSection>

        <Timeline items={content.linimasa} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-2xl bg-brand p-8 text-brand-foreground">
            <span className="text-xs font-medium tracking-[0.12em] text-brand-muted uppercase">Visi</span>
            <p className="font-serif text-2xl leading-snug">{content.visi}</p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-8">
            <span className="text-xs font-medium tracking-[0.12em] text-primary uppercase">Misi</span>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-muted-foreground marker:text-muted-foreground">
              {content.misi.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        </div>

        <PublicSection id="pelayan" title="Majelis Jemaat">
          <MajelisGrid items={content.majelis} />
        </PublicSection>
      </PublicContainer>
    </>
  );
}
