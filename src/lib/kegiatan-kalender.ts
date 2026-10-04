import { addDays, formatDateLong, monthRange, weekday, type IsoDate, type IsoMonth } from "@/lib/dates";
import type { PublicKegiatanBulanRow } from "@/lib/public-kegiatan";

/**
 * Pure month-grid logic for `/kegiatan` (brief §14.4), shared by the month
 * grid and the "Daftar" agenda view so a multi-day event's per-day
 * "(n/total)" numbering is computed in exactly one place.
 */

export type KegiatanOccurrence = {
  id: string;
  slug: string;
  judul: string;
  kategoriNama: string;
  kategoriWarna: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  /** 1-based day of this occurrence within the event's own span. */
  dayIndex: number;
  totalDays: number;
};

export type KalenderCell = {
  date: IsoDate;
  inMonth: boolean;
  isToday: boolean;
  occurrences: KegiatanOccurrence[];
};

function daysBetweenInclusive(start: IsoDate, end: IsoDate): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

/**
 * Every date cell for `bulan`'s calendar grid, starting on Minggu, padded
 * with the surrounding month's dates to fill whole weeks (5 or 6 rows,
 * whichever the month needs). An event appears on every date it covers,
 * including padding dates from the previous/next month.
 */
export function buildMonthCells(bulan: IsoMonth, events: PublicKegiatanBulanRow[], today: IsoDate): KalenderCell[] {
  const { start: monthStart, end: monthEnd } = monthRange(bulan);
  const leading = weekday(monthStart);
  const daysInMonth = daysBetweenInclusive(monthStart, monthEnd);
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const gridStart = addDays(monthStart, -leading);

  const cells: KalenderCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = addDays(gridStart, i);
    cells.push({ date, inMonth: date >= monthStart && date <= monthEnd, isToday: date === today, occurrences: [] });
  }
  const byDate = new Map(cells.map((cell) => [cell.date, cell]));

  for (const event of events) {
    const totalDays = daysBetweenInclusive(event.tanggalMulai, event.tanggalSelesai);
    for (let i = 0; i < totalDays; i++) {
      const cell = byDate.get(addDays(event.tanggalMulai, i));
      if (!cell) continue;
      cell.occurrences.push({
        id: event.id,
        slug: event.slug,
        judul: event.judul,
        kategoriNama: event.kategoriNama,
        kategoriWarna: event.kategoriWarna,
        waktuMulai: event.waktuMulai,
        waktuSelesai: event.waktuSelesai,
        tempat: event.tempat,
        dayIndex: i + 1,
        totalDays,
      });
    }
  }
  return cells;
}

/** The "Daftar" view: in-month dates that have at least one event, in date order. */
export function agendaFromCells(cells: KalenderCell[]): KalenderCell[] {
  return cells.filter((cell) => cell.inMonth && cell.occurrences.length > 0);
}

/** "Kamis, 1 Oktober 2026, 2 kegiatan" (brief §14.4's exact aria-label shape). */
export function cellAriaLabel(cell: KalenderCell): string {
  const base = formatDateLong(cell.date);
  return cell.occurrences.length > 0 ? `${base}, ${cell.occurrences.length} kegiatan` : base;
}
