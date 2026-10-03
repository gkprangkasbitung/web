import { CalendarIcon, MapPinIcon, NewspaperIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicPhoto } from "@/lib/public/site-content";

type InfoCardData = { icon: typeof MapPinIcon; label: string; value: string; sub?: string | null };

function InfoCard({ icon: Icon, label, value, sub }: InfoCardData) {
  return (
    <div className="flex items-start gap-4 p-6 md:px-8 md:py-7">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-badge-accent text-badge-accent-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="text-[17px] font-semibold wrap-break-word whitespace-pre-line">{value}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

// Static class names so Tailwind sees them.
const STRIP_COLUMNS = ["md:grid-cols-1", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"] as const;

/**
 * Beranda's hero (docs/design/beranda.html, beranda-mobile.html): a tall
 * brand band with the church name, subtitle, optional photo, and two calls
 * to action, then an info strip that overlaps its bottom edge. The strip's
 * Kebaktian Minggu times come from this week's schedule and Lokasi from
 * Profil Gereja; a card with no value is left out (brief §14.6).
 */
export function Hero({
  title,
  subtitle,
  photo,
  kebaktianMinggu,
  alamat,
  wartaTerbaruTanggal,
}: {
  title: string;
  subtitle: string | null;
  photo: PublicPhoto;
  kebaktianMinggu: string | null;
  alamat: string | null;
  /** The latest published warta's date, already formatted; null when there is none. */
  wartaTerbaruTanggal: string | null;
}) {
  const cards = [
    kebaktianMinggu && { icon: CalendarIcon, label: "Kebaktian Minggu", value: kebaktianMinggu, sub: "Pekan ini" },
    alamat && { icon: MapPinIcon, label: "Lokasi", value: alamat },
    {
      icon: NewspaperIcon,
      label: "Warta mingguan",
      value: "Jadwal, renungan & laporan",
      sub: wartaTerbaruTanggal && `Terbaru: ${wartaTerbaruTanggal}`,
    },
  ].filter((card) => !!card);

  return (
    <div className="flex flex-col">
      {/* `isolate`: the photo and its tint (negative z) stay above the band's own background. */}
      <section className="relative isolate flex min-h-120 flex-col justify-center overflow-hidden bg-brand text-brand-foreground md:min-h-170 md:items-center md:text-center">
        {photo && (
          <>
            <Image src={photo.url} alt={photo.alt} fill preload sizes="100vw" className="absolute inset-0 -z-20 object-cover" />
            <div className="absolute inset-0 -z-10 bg-brand/75" />
          </>
        )}
        <div className="mx-auto flex w-full max-w-4xl flex-col items-start gap-5 px-4 pt-14 pb-24 md:items-center md:gap-7 md:px-8 md:pt-16 md:pb-28">
          <span className="text-xs font-medium tracking-[0.16em] text-brand-muted uppercase md:text-sm">
            Gereja Kristen Pasundan · Jemaat Rangkasbitung
          </span>
          <h1 className="font-serif text-5xl leading-[1.02] font-normal tracking-[-0.02em] text-balance md:text-7xl lg:text-[5.5rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-2xl text-base leading-relaxed text-brand-foreground/85 md:text-[1.2rem]">{subtitle}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3.5">
            <Link
              href="/jadwal-ibadah"
              className="flex h-13 items-center rounded-full bg-brand-foreground px-6.5 text-base font-medium text-brand outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Lihat jadwal ibadah
            </Link>
            <Link
              href="/kontak"
              className="flex h-13 items-center rounded-full border-[1.5px] border-brand-foreground/60 px-6.5 text-base font-medium outline-none hover:bg-brand-border focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Rencanakan kunjungan
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <div
          className={`relative -mt-14 grid grid-cols-1 divide-y divide-border/60 rounded-[18px] border border-border bg-card shadow-[0_12px_32px_rgb(28_25_23/0.08)] md:divide-x md:divide-y-0 ${STRIP_COLUMNS[cards.length]}`}
        >
          {cards.map((card) => (
            <InfoCard key={card.label} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}
