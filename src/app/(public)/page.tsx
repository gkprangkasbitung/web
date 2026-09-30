import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  PlaceholderBlock,
  PublicContainer,
  PublicSection,
} from "@/components/public/public-shell";
import { CompactScheduleList } from "@/components/public/schedule-list";
import { formatDateLong, weekContaining } from "@/lib/dates";
import { loadJadwalPekanIni, loadLatestPublicWarta } from "@/lib/public-site";

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
 * Brief §2/§8: a hero with the church name and this week's services, a card
 * for the latest warta, then placeholder sections (§12.4). A failed section
 * shows an inline message instead of failing the page.
 */
export default async function HomePage() {
  // The same Minggu–Sabtu week `public_jadwal_pekan_ini` computes, for the heading.
  const week = weekContaining();
  const [schedule, latest] = await Promise.all([loadJadwalPekanIni(), loadLatestPublicWarta()]);

  return (
    <PublicContainer>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="flex flex-col gap-4 lg:pt-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">GKP Rangkasbitung</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            {/* TODO(konten): a short welcome line or motto from the church. Don't invent one. */}
            Selamat datang di situs GKP Rangkasbitung.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/jadwal-ibadah" className={linkClass}>
              Jadwal Ibadah
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/warta" className={linkClass}>
              Warta Jemaat
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        <section
          aria-labelledby="jadwal-pekan-ini"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 id="jadwal-pekan-ini" className="text-lg font-semibold tracking-tight">
              Jadwal ibadah pekan ini
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatDateLong(week.start)} – {formatDateLong(week.end)}
            </p>
          </div>
          {schedule.error !== null ? (
            <LoadError />
          ) : (
            <CompactScheduleList rows={schedule.data} emptyText="Belum ada jadwal ibadah pekan ini." />
          )}
          <Link href="/jadwal-ibadah" className={linkClass}>
            Lihat jadwal lengkap
          </Link>
        </section>
      </div>

      <PublicSection id="warta-terbaru" title="Warta terbaru">
        {latest.error !== null ? (
          <LoadError />
        ) : latest.data ? (
          <Link
            href={`/warta/${latest.data.slug}`}
            className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <time dateTime={latest.data.tanggalKebaktian} className="text-sm text-muted-foreground">
              {formatDateLong(latest.data.tanggalKebaktian)}
            </time>
            <span className="text-lg font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">
              {latest.data.judulKebaktian}
            </span>
            {latest.data.temaKebaktian && <span className="text-muted-foreground">{latest.data.temaKebaktian}</span>}
            <span className="mt-2 text-sm font-medium text-primary">Baca warta</span>
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada warta yang diterbitkan.</p>
        )}
      </PublicSection>

      <PublicSection id="sambutan" title="Sambutan">
        {/* TODO(konten): a welcome from the pastor or the majelis, supplied by the church. */}
        <PlaceholderBlock />
      </PublicSection>

      <PublicSection id="kegiatan" title="Kegiatan dan pelayanan">
        {/* TODO(konten): the church's regular ministries and activities (names, short descriptions). */}
        <div className="grid gap-4 md:grid-cols-3">
          <PlaceholderBlock title="Kegiatan 1" />
          <PlaceholderBlock title="Kegiatan 2" />
          <PlaceholderBlock title="Kegiatan 3" />
        </div>
      </PublicSection>
    </PublicContainer>
  );
}
