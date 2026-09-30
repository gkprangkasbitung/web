import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { MajelisGrid } from "@/components/public/majelis-grid";
import { PublicImage } from "@/components/public/public-image";
import { PublicContainer, PublicPageTitleBand, PublicSection } from "@/components/public/public-shell";
import { Timeline } from "@/components/public/timeline";
import { loadTentangKamiContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description: "Tentang GKP Rangkasbitung.",
};

/**
 * Brief §8, §14.6, docs/design/tentang-kami.html. Sejarah, Linimasa, Visi,
 * and Misi come from Profil Gereja and are hidden when empty; Majelis is a
 * placeholder until stage 11b. Renders per request (the loader calls
 * `connection()`), so an edit shows on the next visit.
 */
export default async function TentangKamiPage() {
  const { profil, majelis } = await loadTentangKamiContent();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Tentang Kami"
        title="Tentang Kami"
        description="Mengenal sejarah, panggilan, dan orang-orang yang melayani di GKP Rangkasbitung."
      />

      <PublicContainer>
        {profil.error !== null ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Gagal memuat profil gereja. Muat ulang halaman untuk mencoba lagi.
          </p>
        ) : (
          <>
            {profil.data.sejarah && (
              <PublicSection id="sejarah" title="Sejarah">
                <div className={profil.data.sejarahPhoto ? "grid gap-8 md:grid-cols-2 md:items-start" : undefined}>
                  <p className="max-w-3xl leading-relaxed whitespace-pre-line text-muted-foreground">
                    {profil.data.sejarah}
                  </p>
                  {profil.data.sejarahPhoto && <PublicImage photo={profil.data.sejarahPhoto} fallbackLabel="Foto sejarah" />}
                </div>
              </PublicSection>
            )}

            {profil.data.linimasa.length > 0 && (
              <section aria-label="Linimasa">
                <Timeline items={profil.data.linimasa} />
              </section>
            )}

            {(profil.data.visi || profil.data.misi.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {profil.data.visi && (
                  <section aria-labelledby="visi" className="flex flex-col gap-3 rounded-2xl bg-brand p-8 text-brand-foreground">
                    <h2 id="visi" className="text-xs font-medium tracking-[0.12em] text-brand-muted uppercase">
                      Visi
                    </h2>
                    <p className="font-serif text-2xl leading-snug whitespace-pre-line">{profil.data.visi}</p>
                  </section>
                )}
                {profil.data.misi.length > 0 && (
                  <section aria-labelledby="misi" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-8">
                    <h2 id="misi" className="text-xs font-medium tracking-[0.12em] text-primary uppercase">
                      Misi
                    </h2>
                    <ol className="flex list-decimal flex-col gap-3 pl-5 text-muted-foreground marker:text-muted-foreground">
                      {profil.data.misi.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            )}
          </>
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
