import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActivityGrid } from "@/components/public/activity-grid";
import { PelayananList } from "@/components/jemaat-portal/pelayanan-list";
import { EyebrowHeading } from "@/components/public/public-shell";
import { displayName, requireJemaat } from "@/lib/auth/session";
import { formatDateLong, weekContaining } from "@/lib/dates";
import { loadMyJemaat } from "@/lib/jemaat-portal";
import { loadPelayananSaya, PortalError } from "@/lib/portal/data";
import { loadKegiatanMendatangList, type KegiatanItem } from "@/lib/public/site-content";
import { loadLatestPublicWarta, type PublicWartaListItem } from "@/lib/public-site";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Beranda" };

function LoadError() {
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Gagal memuat bagian ini. Muat ulang halaman untuk mencoba lagi.
    </p>
  );
}

function WartaCard({ warta }: { warta: PublicWartaListItem | null }) {
  if (!warta) return <p className="text-sm text-muted-foreground">Belum ada warta yang diterbitkan.</p>;
  return (
    <Link
      href={`/warta/${warta.slug}`}
      className="group flex flex-col gap-2 rounded-xl bg-brand p-5 text-brand-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <time dateTime={warta.tanggalKebaktian} className="text-sm text-brand-muted">
        {formatDateLong(warta.tanggalKebaktian)}
      </time>
      <span className="font-serif text-xl leading-tight group-hover:underline group-hover:underline-offset-4">
        {warta.judulKebaktian}
      </span>
      {warta.temaKebaktian && <span className="text-sm text-brand-foreground/85">Tema: {warta.temaKebaktian}</span>}
      <span className="mt-1 text-sm font-medium">Baca warta →</span>
    </Link>
  );
}

/**
 * Portal Jemaat Beranda (brief §17.3): greeting, this week's own schedule
 * (Minggu–Sabtu, matching Jadwal Ibadah's "minggu ini"), the latest
 * published warta, and 3 upcoming kegiatan — the same public functions the
 * public site already uses (brief §12.1), read with the anon client since
 * none of this is personal data.
 */
export default async function JemaatHomePage() {
  const user = await requireJemaat();
  const supabase = await createClient();
  const week = weekContaining();

  const [jemaat, pelayananResult, warta, kegiatan] = await Promise.all([
    loadMyJemaat(supabase),
    loadPelayananSaya(supabase, week.start, week.end).then(
      (data) => ({ data, error: null as string | null }),
      (error: unknown) => ({ data: null, error: error instanceof PortalError ? error.message : "Terjadi kesalahan." }),
    ),
    loadLatestPublicWarta(),
    loadKegiatanMendatangList(3).catch((error: unknown): KegiatanItem[] => {
      console.error("[/jemaat] kegiatan mendatang failed:", error);
      return [];
    }),
  ]);
  const nama = jemaat?.nama ?? displayName(user);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium tracking-[0.08em] text-primary uppercase">Portal Jemaat</span>
        <h1 className="font-serif text-3xl leading-tight font-normal tracking-tight sm:text-4xl">
          Selamat datang, {nama}
        </h1>
      </div>

      <section aria-labelledby="pelayanan-minggu-ini" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <EyebrowHeading id="pelayanan-minggu-ini" eyebrow="Pelayanan" title="Pelayanan saya minggu ini" />
          <p className="text-sm text-muted-foreground">
            {formatDateLong(week.start)} – {formatDateLong(week.end)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          {pelayananResult.error ? (
            <LoadError />
          ) : (
            <PelayananList rows={pelayananResult.data ?? []} emptyText="Tidak ada jadwal pelayanan minggu ini." dateFormat="short" />
          )}
        </div>
      </section>

      <section aria-labelledby="warta-terbaru" className="flex flex-col gap-4">
        <EyebrowHeading id="warta-terbaru" eyebrow="Warta" title="Warta terbaru" />
        {warta.error !== null ? <LoadError /> : <WartaCard warta={warta.data} />}
      </section>

      <section aria-labelledby="kegiatan-mendatang" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <EyebrowHeading id="kegiatan-mendatang" eyebrow="Kegiatan" title="Kegiatan mendatang" />
          <Link
            href="/kegiatan"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Semua kegiatan
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {kegiatan.length > 0 ? (
          <ActivityGrid items={kegiatan} />
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada kegiatan mendatang.</p>
        )}
      </section>
    </div>
  );
}
