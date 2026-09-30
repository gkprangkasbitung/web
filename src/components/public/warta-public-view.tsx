import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { financeWeek, formatDateLong, serviceWeek, type DateRange } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { PublicFinanceItem, PublicWarta } from "@/lib/public-site";

import { PublicSection } from "./public-shell";
import { ScheduleList } from "./schedule-list";

function hasText(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

function RangeText({ range, suffix }: { range: DateRange; suffix: string }) {
  return (
    <>
      {formatDateLong(range.start)} – {formatDateLong(range.end)} {suffix}
    </>
  );
}

function FinanceItem({ item }: { item: PublicFinanceItem }) {
  const figures = [
    ["Saldo Awal", item.saldoAwal],
    ["Pemasukan", item.pemasukan],
    ["Pengeluaran", item.pengeluaran],
    ["Saldo Akhir", item.saldoAkhir],
  ] as const;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{item.name}</h3>
      <dl className="grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2 lg:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 min-[400px]:flex-col min-[400px]:items-start min-[400px]:gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono font-semibold tabular-nums">{formatRupiah(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/**
 * `/warta/[slug]` (brief §8), sections in order:
 * 1. header; 2. Renungan (only with a judul or isi); 3. Bidang Peribadahan
 * (service week); 4. Bidang Litbang (if any); 5. Bidang Sarana dan Dana
 * (finance week, four figures per item from `public_warta_finance`);
 * 6. Bidang Kesaksian dan Keesaan (if any).
 *
 * Multi-line text is plain text with `white-space: pre-line`; nothing is
 * rendered as HTML.
 */
export function WartaPublicView({ warta }: { warta: PublicWarta }) {
  const showRenungan = hasText(warta.renunganJudul) || hasText(warta.renunganIsi);

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/warta"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Semua warta
        </Link>
        <p className="text-sm text-muted-foreground">
          <time dateTime={warta.tanggalKebaktian}>{formatDateLong(warta.tanggalKebaktian)}</time>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{warta.judulKebaktian}</h1>
        {hasText(warta.temaKebaktian) && <p className="text-lg text-muted-foreground">{warta.temaKebaktian}</p>}
      </header>

      {showRenungan && (
        <PublicSection id="renungan" title="Renungan">
          <div className="flex flex-col gap-3">
            {hasText(warta.renunganJudul) && <h3 className="text-lg font-semibold">{warta.renunganJudul}</h3>}
            {hasText(warta.renunganKitab) && (
              <p className="text-sm font-medium text-muted-foreground">{warta.renunganKitab}</p>
            )}
            {hasText(warta.renunganIsi) && <p className="leading-relaxed whitespace-pre-line">{warta.renunganIsi}</p>}
            {hasText(warta.renunganSumber) && (
              <p className="text-sm text-muted-foreground">Sumber: {warta.renunganSumber}</p>
            )}
          </div>
        </PublicSection>
      )}

      <PublicSection
        id="bidang-peribadahan"
        title="Bidang Peribadahan"
        description={<RangeText range={serviceWeek(warta.tanggalKebaktian)} suffix="(Minggu-Sabtu)" />}
      >
        <ScheduleList rows={warta.schedule} emptyText="Belum ada jadwal untuk minggu ini." />
      </PublicSection>

      {warta.litbang.length > 0 && (
        <PublicSection id="bidang-litbang" title="Bidang Litbang">
          <ol className="flex list-decimal flex-col gap-4 pl-6 marker:font-semibold marker:text-muted-foreground">
            {warta.litbang.map((item) => (
              <li key={item.id} className="pl-1">
                <h3 className="font-semibold">{item.name}</h3>
                {hasText(item.deskripsi) && (
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{item.deskripsi}</p>
                )}
              </li>
            ))}
          </ol>
        </PublicSection>
      )}

      <PublicSection
        id="bidang-sarana-dana"
        title="Bidang Sarana dan Dana"
        description={
          <RangeText range={financeWeek(warta.tanggalKebaktian)} suffix="(Minggu-Sabtu sebelum tanggal kebaktian)" />
        }
      >
        {warta.finance.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada laporan keuangan.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {warta.finance.map((item) => (
              <FinanceItem key={item.key} item={item} />
            ))}
          </div>
        )}
      </PublicSection>

      {warta.kesaksian.length > 0 && (
        <PublicSection id="bidang-kesaksian" title="Bidang Kesaksian dan Keesaan">
          <div className="flex flex-col gap-4">
            {warta.kesaksian.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <h3 className="font-semibold">{item.judul}</h3>
                {hasText(item.deskripsi) && (
                  <p className="text-sm leading-relaxed whitespace-pre-line">{item.deskripsi}</p>
                )}
              </div>
            ))}
          </div>
        </PublicSection>
      )}
    </article>
  );
}
