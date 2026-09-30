import { CalendarIcon, MapPinIcon, NewspaperIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { KontakInfo, PublicPhoto } from "@/lib/public/site-content";

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

/** Beranda's hero (docs/design/beranda.html, beranda-mobile.html): church name + a 3-card info strip. */
export function Hero({
  title,
  subtitle,
  photo,
  kontak,
}: {
  title: string;
  subtitle: string;
  photo: PublicPhoto;
  kontak: KontakInfo;
}) {
  return (
    <div className="flex flex-col">
      <section className="relative flex min-h-105 flex-col justify-end overflow-hidden bg-brand text-brand-foreground md:min-h-130 md:items-center md:text-center">
        {photo && (
          <>
            <Image src={photo.url} alt={photo.alt} fill sizes="100vw" className="absolute inset-0 -z-20 object-cover" />
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
          <p className="max-w-lg text-base text-brand-muted md:text-lg">{subtitle}</p>
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

      <div className="mx-auto -mt-8 grid w-full max-w-5xl grid-cols-1 gap-px rounded-2xl border border-border bg-card px-4 shadow-lg shadow-black/5 sm:grid-cols-3 sm:px-8 md:-mt-10">
        <InfoCard
          icon={CalendarIcon}
          label="Kebaktian Minggu"
          value={kontak.jamSekretariat ? kontak.jamSekretariat : "TODO: jam kebaktian"}
        />
        <InfoCard icon={MapPinIcon} label="Lokasi" value={kontak.alamat ?? "TODO: alamat gereja"} />
        <InfoCard icon={NewspaperIcon} label="Warta mingguan" value="Jadwal, renungan & laporan" />
      </div>
    </div>
  );
}
