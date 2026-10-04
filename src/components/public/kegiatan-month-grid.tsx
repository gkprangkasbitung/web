"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { KategoriBadge } from "@/components/kegiatan/kategori-badge";
import { formatDateLong, type IsoDate, type IsoMonth } from "@/lib/dates";
import { formatWaktuRange } from "@/lib/kegiatan";
import { buildMonthCells, cellAriaLabel, type KalenderCell } from "@/lib/kegiatan-kalender";
import { kategoriBadgeStyle, kategoriDotColor } from "@/lib/kegiatan-kategori";
import type { PublicKegiatanBulanRow } from "@/lib/public-kegiatan";

const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ARROW_DELTA: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };

/**
 * `/kegiatan`'s month grid + the selected date's panel (brief §14.4). One
 * component for every width: each cell shows up to 2 titled chips from
 * `md` up, and up to 3 color dots below it (the dots never disappear — a
 * multi-day event crossing the grid's edge still needs *some* marker on an
 * out-of-month filler date, which gets no button at all).
 */
export function KegiatanMonthGrid({ bulan, events, today }: { bulan: IsoMonth; events: PublicKegiatanBulanRow[]; today: IsoDate }) {
  const cells = useMemo(() => buildMonthCells(bulan, events, today), [bulan, events, today]);
  const byDate = useMemo(() => new Map(cells.map((cell) => [cell.date, cell])), [cells]);
  const defaultActive = byDate.get(today)?.inMonth ? today : cells.find((cell) => cell.inMonth)!.date;
  const [activeDate, setActiveDate] = useState<IsoDate>(defaultActive);
  const buttonRefs = useRef(new Map<IsoDate, HTMLButtonElement | null>());

  function moveFocus(date: IsoDate, delta: number) {
    const index = cells.findIndex((cell) => cell.date === date);
    const next = cells[index + delta];
    if (!next || !next.inMonth) return;
    setActiveDate(next.date);
    buttonRefs.current.get(next.date)?.focus();
  }

  const activeCell = byDate.get(activeDate) ?? cells[0]!;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="overflow-hidden rounded-[18px] border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAY_SHORT.map((label) => (
            <span key={label} className="px-1 py-3 text-center text-xs font-medium text-muted-foreground sm:px-3 sm:text-left">
              {label}
            </span>
          ))}
        </div>
        <div aria-label={`Kalender ${bulan}`} className="grid grid-cols-7">
          {cells.map((cell) => (
            <KegiatanDayCell
              key={cell.date}
              cell={cell}
              active={cell.date === activeDate}
              onFocusRef={(el) => buttonRefs.current.set(cell.date, el)}
              onSelect={() => setActiveDate(cell.date)}
              onArrowKey={(key) => moveFocus(cell.date, ARROW_DELTA[key] ?? 0)}
            />
          ))}
        </div>
      </div>

      <aside className="flex flex-col gap-4 rounded-[18px] border border-border bg-card p-6 lg:sticky lg:top-6">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Kegiatan pada</span>
          <span className="font-serif text-2xl">{formatDateLong(activeCell.date)}</span>
        </div>
        {activeCell.occurrences.length === 0 ? (
          <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">Tidak ada kegiatan pada tanggal ini.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activeCell.occurrences.map((occurrence) => (
              <li key={occurrence.id}>
                <Link
                  href={`/kegiatan/${occurrence.slug}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-4 hover:bg-accent"
                >
                  <KategoriBadge nama={occurrence.kategoriNama} warna={occurrence.kategoriWarna} className="self-start" />
                  <span className="font-serif text-xl leading-tight">
                    {occurrence.judul}
                    {occurrence.totalDays > 1 && <span className="text-muted-foreground"> ({occurrence.dayIndex}/{occurrence.totalDays})</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatWaktuRange(occurrence.waktuMulai, occurrence.waktuSelesai)}
                    {occurrence.tempat ? ` · ${occurrence.tempat}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function KegiatanDayCell({
  cell,
  active,
  onFocusRef,
  onSelect,
  onArrowKey,
}: {
  cell: KalenderCell;
  active: boolean;
  onFocusRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onArrowKey: (key: string) => void;
}) {
  const day = Number(cell.date.slice(8, 10));

  if (!cell.inMonth) {
    return (
      <div
        aria-hidden
        className="flex h-24 flex-col gap-1 border-r border-b border-border/60 p-2 text-muted-foreground/50 sm:h-32"
      >
        <span className="text-sm">{day}</span>
        <DotRow occurrences={cell.occurrences} />
      </div>
    );
  }

  return (
    <button
      ref={onFocusRef}
      type="button"
      tabIndex={active ? 0 : -1}
      aria-pressed={active}
      aria-label={cellAriaLabel(cell)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          onArrowKey(event.key);
        }
      }}
      className={cn(
        "flex h-24 min-w-0 flex-col gap-1 border-r border-b border-border p-2 text-left sm:h-32 sm:p-3",
        active ? "bg-primary/10 ring-2 ring-inset ring-primary" : "bg-background hover:bg-accent",
      )}
    >
      {cell.isToday ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {day}
        </span>
      ) : (
        <span className="text-sm font-medium">{day}</span>
      )}

      <DotRow occurrences={cell.occurrences} />

      <div className="hidden min-w-0 flex-col gap-1 md:flex">
        {cell.occurrences.slice(0, 2).map((occurrence) => (
          <span
            key={occurrence.id}
            className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={kategoriBadgeStyle(occurrence.kategoriWarna)}
          >
            {occurrence.judul}
            {occurrence.totalDays > 1 ? ` (${occurrence.dayIndex}/${occurrence.totalDays})` : ""}
          </span>
        ))}
        {cell.occurrences.length > 2 && <span className="pl-1.5 text-[11px] text-muted-foreground">+{cell.occurrences.length - 2} lagi</span>}
      </div>
    </button>
  );
}

function DotRow({ occurrences }: { occurrences: KalenderCell["occurrences"] }) {
  if (occurrences.length === 0) return null;
  return (
    <div className="flex gap-1 md:hidden">
      {occurrences.slice(0, 3).map((occurrence, index) => (
        <span key={index} aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: kategoriDotColor(occurrence.kategoriWarna) }} />
      ))}
    </div>
  );
}
