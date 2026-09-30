import { CalendarIcon, MapPinIcon, NewspaperIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicPhoto } from "@/lib/public/site-content";

function InfoCard({ icon: Icon, label, value }: { icon: typeof MapPinIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-border/60 p-6 first:pl-0 md:border-r md:p-7 md:last:border-r-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-badge-accent text-badge-accent-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-balance">{value}</span>
      </div>
    </div>
  );
}

// Static class names so Tailwind sees them.
const STRIP_COLUMNS = ["sm:grid-cols-1", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3"] as const;

/**
 * Beranda's hero (docs/design/beranda.html, beranda-mobile.html): church
 * name, subtitle, optional photo, and an info strip. The strip's Kebaktian
 * Minggu times come from this week's schedule and Lokasi from Profil
 * Gereja; a card with no value is left out (brief §14.6).
 */
export function Hero({
  title,
  subtitle,
  photo,
  kebaktianMinggu,
  alamat,
}: {
  title: string;
  subtitle: string | null;
  photo: PublicPhoto;
  kebaktianMinggu: string | null;
  alamat: string | null;
}) {
  const cards = [
    kebaktianMinggu && { icon: CalendarIcon, label: "Kebaktian Minggu", value: kebaktianMinggu },
    alamat && { icon: MapPinIcon, label: "Lokasi", value: alamat },
    { icon: NewspaperIcon, label: "Warta mingguan", value: "Jadwal, renungan & laporan" },
  ].filter((card) => !!card);

  return (
    <div className="flex flex-col">
      {/* `isolate`: the photo and its tint (negative z) stay above the band's own background. */}
      <section className="relative isolate flex min-h-105 flex-col justify-end overflow-hidden bg-brand text-brand-foreground md:min-h-130 md:items-center md:text-center">
        {photo && (
          <>
            <Image src={photo.url} alt={photo.alt} fill preload sizes="100vw" className="absolute inset-0 -z-20 object-cover" />
            <div className="absolute inset-0 -z-10 bg-brand/75" />
          </>
        )}
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-14 md:items-center md:px-8 md:py-20">
          <span className="text-xs font-medium tracking-[0.16em] text-brand-muted uppercase">
            Gereja Kristen Pasundan · Jemaat Rangkasbitung
          </span>
          <h1 className="font-serif text-4xl leading-[1.05] font-normal tracking-tight text-balance md:text-6xl">
            {title}
          </h1>
          {subtitle && <p className="max-w-lg text-base text-brand-muted md:text-lg">{subtitle}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href="/jadwal-ibadah"
              className="flex h-12 items-center rounded-full bg-brand-foreground px-6 text-sm font-medium text-brand outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Lihat jadwal ibadah
            </Link>
            <Link
              href="/kontak"
              className="flex h-12 items-center rounded-full border border-brand-border px-6 text-sm font-medium outline-none hover:bg-brand-border focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Rencanakan kunjungan
            </Link>
          </div>
        </div>
      </section>

      <div
        className={`mx-auto -mt-8 grid w-full max-w-5xl grid-cols-1 gap-px rounded-2xl border border-border bg-card px-4 shadow-lg shadow-black/5 sm:px-8 md:-mt-10 ${STRIP_COLUMNS[cards.length]}`}
      >
        {cards.map((card) => (
          <InfoCard key={card.label} icon={card.icon} label={card.label} value={card.value} />
        ))}
      </div>
    </div>
  );
}
