import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActivityGrid } from "@/components/public/activity-grid";
import { ContactCards } from "@/components/public/contact-cards";
import { Hero } from "@/components/public/hero";
import { MapLink } from "@/components/public/map-link";
import { MinistryGrid } from "@/components/public/ministry-grid";
import { PublicImage } from "@/components/public/public-image";
import { PublicContainer, PublicSection } from "@/components/public/public-shell";
import { RekeningBanner } from "@/components/public/rekening-banner";
import { CompactScheduleList } from "@/components/public/schedule-list";
import { formatDateLong } from "@/lib/dates";
import { loadBerandaContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Beranda",
  description: "Situs resmi GKP Rangkasbitung: jadwal ibadah dan warta jemaat.",
};

const linkClass =
  "inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

function LoadError() {
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Gagal memuat bagian ini. Muat ulang halaman untuk mencoba lagi.
    </p>
  );
}

/**
 * Brief §2/§8, docs/design/beranda.html + beranda-mobile.html: a hero with
 * this week's schedule and the latest warta, then Sambutan, Pelayanan,
 * Kegiatan, Persembahan, and Kunjungi Kami. Hero, Sambutan, Persembahan, and
 * Kunjungi Kami come from Profil Gereja, and each is hidden when empty
 * (brief §14.6); Pelayanan and Kegiatan are placeholders until stage 11b.
 * A failed schedule or warta load shows an inline message instead of
 * failing the page.
 */
export default async function HomePage() {
  const content = await loadBerandaContent();

  return (
    <>
      <Hero
        title={content.heroTitle}
        subtitle={content.heroSubtitle}
        photo={content.heroPhoto}
        kebaktianMinggu={content.kebaktianMinggu}
        alamat={content.kontak?.alamat ?? null}
      />

      <PublicContainer>
        <section aria-labelledby="jadwal-pekan-ini" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="jadwal-pekan-ini" className="font-serif text-2xl font-normal tracking-tight">
              Jadwal ibadah pekan ini
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatDateLong(content.jadwalMingguIniRange.start)} – {formatDateLong(content.jadwalMingguIniRange.end)}
            </p>
          </div>
          {content.jadwalMingguIni.error !== null ? (
            <LoadError />
          ) : (
            <CompactScheduleList rows={content.jadwalMingguIni.data} emptyText="Belum ada jadwal ibadah pekan ini." />
          )}
          <Link href="/jadwal-ibadah" className={linkClass}>
            Semua jadwal
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </section>

        <PublicSection id="warta-terbaru" title="Warta terbaru">
          {content.wartaTerbaru.error !== null ? (
            <LoadError />
          ) : content.wartaTerbaru.data ? (
            <Link
              href={`/warta/${content.wartaTerbaru.data.slug}`}
              className="group flex flex-col gap-2 rounded-2xl bg-brand p-6 text-brand-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <time dateTime={content.wartaTerbaru.data.tanggalKebaktian} className="text-sm text-brand-muted">
                {formatDateLong(content.wartaTerbaru.data.tanggalKebaktian)}
              </time>
              <span className="font-serif text-2xl group-hover:underline group-hover:underline-offset-4">
                {content.wartaTerbaru.data.judulKebaktian}
              </span>
              {content.wartaTerbaru.data.temaKebaktian && (
                <span className="text-brand-muted">Tema: {content.wartaTerbaru.data.temaKebaktian}</span>
              )}
              <span className="mt-1 text-sm font-medium">Baca warta →</span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada warta yang diterbitkan.</p>
          )}
        </PublicSection>

        {content.sambutan && (
          <PublicSection id="sambutan" title="Sambutan">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              {content.sambutan.photo && (
                <PublicImage
                  photo={content.sambutan.photo}
                  ratio="portrait"
                  fallbackLabel="Foto pendeta"
                  className="w-full max-w-sm"
                />
              )}
              <figure className="flex flex-col gap-4">
                <blockquote className="font-serif text-xl leading-relaxed whitespace-pre-line text-muted-foreground italic">
                  {content.sambutan.teks}
                </blockquote>
                {(content.sambutan.nama || content.sambutan.jabatan) && (
                  <figcaption className="flex flex-col gap-0.5">
                    {content.sambutan.nama && <span className="font-semibold">{content.sambutan.nama}</span>}
                    {content.sambutan.jabatan && (
                      <span className="text-sm text-muted-foreground">{content.sambutan.jabatan}</span>
                    )}
                  </figcaption>
                )}
              </figure>
            </div>
          </PublicSection>
        )}

        {content.pelayanan.length > 0 && (
          <PublicSection id="pelayanan" title="Ada tempat untuk setiap usia">
            <MinistryGrid items={content.pelayanan} />
          </PublicSection>
        )}

        {content.kegiatan.length > 0 && (
          <PublicSection id="kegiatan" title="Kegiatan mendatang">
            <ActivityGrid items={content.kegiatan} />
          </PublicSection>
        )}

        {content.rekening && <RekeningBanner rekening={content.rekening} />}

        {content.kontak && (
          <PublicSection id="kunjungi-kami" title="Kami menantikan kehadiran Anda">
            <div className="grid gap-6 lg:grid-cols-2">
              <ContactCards kontak={content.kontak} />
              {content.kontak.mapsUrl && <MapLink mapsUrl={content.kontak.mapsUrl} />}
            </div>
          </PublicSection>
        )}
      </PublicContainer>
    </>
  );
}
