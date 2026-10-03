import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActivityGrid } from "@/components/public/activity-grid";
import { ContactList } from "@/components/public/contact-cards";
import { Hero } from "@/components/public/hero";
import { MapEmbed } from "@/components/public/map-embed";
import { MinistryGrid } from "@/components/public/ministry-grid";
import { PublicImage } from "@/components/public/public-image";
import { EyebrowHeading } from "@/components/public/public-shell";
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

/** Page width and side padding, matching the header (brief §2). */
const CONTAINER = "mx-auto w-full max-w-5xl px-4 md:px-8";

/**
 * Brief §2/§8, docs/design/beranda.html + beranda-mobile.html: a hero with
 * an info strip, this week's schedule and the latest warta (brief §2; the
 * desktop mockup leaves them out, the mobile one has them), then Sambutan,
 * Pelayanan, Kegiatan, Persembahan, and Kunjungi Kami. Hero, Sambutan,
 * Persembahan, and Kunjungi Kami come from Profil Gereja, and each is hidden
 * when empty (brief §14.6), as are Pelayanan and Kegiatan with no items. A
 * failed schedule or warta load shows an inline message instead of failing
 * the page. Each section below the first row owns only its bottom spacing,
 * so any of them can be hidden without doubling a gap.
 */
export default async function HomePage() {
  const content = await loadBerandaContent();
  const warta = content.wartaTerbaru.data;
  const kontak = content.kontak;
  const hasContactLines =
    kontak !== null && [kontak.alamat, kontak.telepon, kontak.email, kontak.jamSekretariat].some((v) => v !== null);

  return (
    <>
      <Hero
        title={content.heroTitle}
        subtitle={content.heroSubtitle}
        photo={content.heroPhoto}
        kebaktianMinggu={content.kebaktianMinggu}
        alamat={kontak?.alamat ?? null}
        wartaTerbaruTanggal={warta ? formatDateLong(warta.tanggalKebaktian) : null}
      />

      <div className={`${CONTAINER} grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16`}>
        <section aria-labelledby="jadwal-pekan-ini" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <EyebrowHeading id="jadwal-pekan-ini" eyebrow="Jadwal" title="Jadwal ibadah pekan ini" />
            <p className="text-sm text-muted-foreground">
              {formatDateLong(content.jadwalMingguIniRange.start)} – {formatDateLong(content.jadwalMingguIniRange.end)}
            </p>
          </div>
          <div className="rounded-[18px] border border-border bg-card p-6">
            {content.jadwalMingguIni.error !== null ? (
              <LoadError />
            ) : (
              <CompactScheduleList rows={content.jadwalMingguIni.data} emptyText="Belum ada jadwal ibadah pekan ini." />
            )}
          </div>
          <Link href="/jadwal-ibadah" className={linkClass}>
            Semua jadwal
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </section>

        <section aria-labelledby="warta-terbaru" className="flex flex-col gap-6">
          <EyebrowHeading id="warta-terbaru" eyebrow="Warta" title="Warta terbaru" />
          {content.wartaTerbaru.error !== null ? (
            <LoadError />
          ) : warta ? (
            <Link
              href={`/warta/${warta.slug}`}
              className="group flex flex-col gap-2.5 rounded-[18px] bg-brand p-6 text-brand-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:p-8"
            >
              <time dateTime={warta.tanggalKebaktian} className="text-sm text-brand-muted">
                {formatDateLong(warta.tanggalKebaktian)}
              </time>
              <span className="font-serif text-2xl leading-tight group-hover:underline group-hover:underline-offset-4 md:text-[1.7rem]">
                {warta.judulKebaktian}
              </span>
              {warta.temaKebaktian && <span className="text-sm text-brand-foreground/85">Tema: {warta.temaKebaktian}</span>}
              <span className="mt-1.5 text-sm font-medium">Baca warta →</span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada warta yang diterbitkan.</p>
          )}
        </section>
      </div>

      {content.sambutan && (
        <section
          aria-labelledby="sambutan"
          className={`${CONTAINER} grid gap-10 pb-16 md:pb-26 ${content.sambutan.photo ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center lg:gap-22" : ""}`}
        >
          {content.sambutan.photo && (
            <PublicImage
              photo={content.sambutan.photo}
              ratio="portrait"
              fallbackLabel="Foto pendeta"
              className="w-full max-w-md rounded-[20px] md:max-w-none"
            />
          )}
          <div className="flex flex-col gap-6">
            <EyebrowHeading id="sambutan" eyebrow="Sambutan" title="Selamat datang di keluarga GKP Rangkasbitung" />
            <figure className="flex flex-col gap-6">
              <blockquote className="font-serif text-lg leading-[1.7] whitespace-pre-line text-foreground/80 md:text-[21px]">
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
        </section>
      )}

      {content.pelayanan.length > 0 && (
        <section aria-labelledby="pelayanan" className="mb-16 border-y border-border bg-card py-16 md:mb-26 md:py-26">
          <div className={`${CONTAINER} flex flex-col gap-10 md:gap-12`}>
            <EyebrowHeading id="pelayanan" eyebrow="Pelayanan" title="Ada tempat untuk setiap usia" align="center" />
            <MinistryGrid items={content.pelayanan} />
          </div>
        </section>
      )}

      {content.kegiatan.length > 0 && (
        <section aria-labelledby="kegiatan" className={`${CONTAINER} flex flex-col gap-10 pb-16 md:pb-26`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <EyebrowHeading id="kegiatan" eyebrow="Kegiatan" title="Kegiatan mendatang" />
            <Link href="/warta" className={linkClass}>
              Lihat warta terbaru
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ActivityGrid items={content.kegiatan} />
        </section>
      )}

      {content.rekening && (
        <div className={`${CONTAINER} pb-16 md:pb-26`}>
          <RekeningBanner rekening={content.rekening} />
        </div>
      )}

      {kontak && (hasContactLines || kontak.mapEmbedSrc) && (
        <section
          aria-labelledby="kunjungi-kami"
          className={`${CONTAINER} grid gap-10 pb-16 md:pb-26 ${hasContactLines && kontak.mapEmbedSrc ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16" : ""}`}
        >
          <div className="flex flex-col gap-6">
            <EyebrowHeading id="kunjungi-kami" eyebrow="Kunjungi kami" title="Kami menantikan kehadiran Anda" />
            <ContactList kontak={kontak} />
          </div>
          {kontak.mapEmbedSrc && (
            <MapEmbed src={kontak.mapEmbedSrc} mapsUrl={kontak.mapsUrl} className="min-h-96 rounded-[20px] lg:min-h-110" />
          )}
        </section>
      )}
    </>
  );
}
