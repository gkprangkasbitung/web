import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { ScheduleTabs } from "@/components/public/schedule-tabs";
import { formatDateLong } from "@/lib/dates";
import { loadJadwalIbadahContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Jadwal Ibadah",
  description: "Jadwal ibadah GKP Rangkasbitung minggu ini.",
};

/**
 * Brief §8 (optional part) + §9c instruction C, docs/design/jadwal-ibadah.html:
 * a day tab per day of the Minggu–Sabtu week containing today (Asia/Jakarta,
 * `public_jadwal_pekan_ini` — same range as Beranda), defaulting to today.
 */
export default async function JadwalIbadahPage() {
  const content = await loadJadwalIbadahContent();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Jadwal Ibadah"
        title="Jadwal Ibadah"
        description={`${formatDateLong(content.week.start)} – ${formatDateLong(content.week.end)}`}
      />

      <PublicContainer>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex flex-col gap-6">
            {content.rows.error !== null ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Gagal memuat jadwal. Muat ulang halaman untuk mencoba lagi.
              </p>
            ) : (
              <ScheduleTabs week={content.week} rows={content.rows.data} />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-2xl bg-brand p-7 text-brand-foreground">
              <span className="font-serif text-xl">Pertama kali datang?</span>
              <p className="text-sm text-brand-muted">
                {/* TODO(konten): short visitor info — parking, dress, who to meet. */}
                TODO: informasi singkat untuk pengunjung baru: parkir, pakaian, dan siapa yang bisa ditemui.
              </p>
              <Link
                href="/kontak"
                className="mt-1 flex h-11 items-center justify-center rounded-full bg-brand-foreground px-4 text-sm font-medium text-brand outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Hubungi kami
              </Link>
            </div>
            <Link
              href="/warta"
              className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-xs text-muted-foreground">Detail lengkap ada di</span>
              <span className="text-base font-semibold">Warta minggu ini →</span>
            </Link>
          </aside>
        </div>
      </PublicContainer>
    </>
  );
}
