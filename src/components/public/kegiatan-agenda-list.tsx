import Link from "next/link";

import { KategoriBadge } from "@/components/kegiatan/kategori-badge";
import { formatDayShort, type IsoDate } from "@/lib/dates";
import { formatWaktuRange } from "@/lib/kegiatan";
import type { KalenderCell } from "@/lib/kegiatan-kalender";

/** `/kegiatan`'s "Daftar" tab: every date in the month with at least one event, one row per occurrence. */
export function KegiatanAgendaList({ days }: { days: KalenderCell[] }) {
  if (days.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">Belum ada kegiatan bulan ini.</p>;
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card">
      {days.map((day) =>
        day.occurrences.map((occurrence) => (
          <Link
            key={`${day.date}-${occurrence.id}`}
            href={`/kegiatan/${occurrence.slug}`}
            className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 border-b border-border p-4 last:border-b-0 hover:bg-accent sm:grid-cols-[64px_auto_minmax(0,1fr)_auto] sm:gap-6"
          >
            <DateBadge date={day.date} />
            <span className="hidden sm:block">
              <KategoriBadge nama={occurrence.kategoriNama} warna={occurrence.kategoriWarna} />
            </span>
            <span className="font-serif text-lg leading-tight sm:text-xl">
              {occurrence.judul}
              {occurrence.totalDays > 1 && (
                <span className="text-sm text-muted-foreground"> ({occurrence.dayIndex}/{occurrence.totalDays})</span>
              )}
              <span className="mt-0.5 block text-sm font-sans text-muted-foreground sm:hidden">{occurrence.kategoriNama}</span>
            </span>
            <span className="text-right text-sm text-muted-foreground">
              {formatWaktuRange(occurrence.waktuMulai, occurrence.waktuSelesai)}
              {occurrence.tempat ? ` · ${occurrence.tempat}` : ""}
            </span>
          </Link>
        )),
      )}
    </div>
  );
}

function DateBadge({ date }: { date: IsoDate }) {
  return (
    <span className="flex w-16 flex-col items-center gap-0.5 rounded-xl bg-muted/60 py-2">
      <span className="text-xs text-muted-foreground">{formatDayShort(date)}</span>
      <span className="font-serif text-2xl leading-none">{Number(date.slice(8, 10))}</span>
    </span>
  );
}
