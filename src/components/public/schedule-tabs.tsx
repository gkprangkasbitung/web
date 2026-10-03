"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, formatDayShort, today, type DateRange } from "@/lib/dates";
import { groupByDate, type PublicScheduleRow } from "@/lib/public-schedule";

import { JadwalEntry } from "./schedule-list";

/**
 * Jadwal Ibadah's day picker (brief §9c instruction C): one tab per day of
 * `week` (Minggu–Sabtu), keyboard-operable via Base UI's `Tabs` (arrow keys,
 * Home/End, roving tabindex come for free), defaulting to today.
 */
export function ScheduleTabs({ week, rows }: { week: DateRange; rows: PublicScheduleRow[] }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(week.start, index));
  // Sorted by Jam for display, not the functions' own date/sort_order arrival
  // order (admin's manual entry order, which Warta's schedule list still uses).
  const byDay = new Map(
    groupByDate(rows).map((day) => [day.tanggal, [...day.rows].sort((a, b) => (a.jam ?? "").localeCompare(b.jam ?? ""))]),
  );
  const current = today();
  const defaultValue = days.includes(current) ? current : days[0];

  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList
        variant="line"
        aria-label="Pilih hari"
        activateOnFocus
        // One row of seven equal columns at every width, as in the mockup (a
        // wrapping flex row broke into 2–3 ragged rows on narrow screens).
        // `h-auto!`: the shared list pins `h-9` with a more specific selector.
        className="grid h-auto! w-full grid-cols-7 gap-1.5 bg-transparent p-0 sm:gap-2"
      >
        {days.map((day) => (
          <TabsTrigger
            key={day}
            value={day}
            // `!`: the shared `line` variant resets the active tab to a transparent
            // background with a more specific selector, and draws an underline via `after:`.
            // Below `sm` the day name sits above the date so seven fit in 328px.
            className="h-14 w-full min-w-0 flex-col gap-0 rounded-2xl border border-border bg-card px-0 text-sm font-medium text-foreground shadow-none after:hidden data-active:border-brand! data-active:bg-brand! data-active:text-brand-foreground! sm:h-11 sm:flex-row sm:gap-1 sm:rounded-full"
          >
            <span>{formatDayShort(day)}</span>{" "}
            <span className="tabular-nums">{Number(day.slice(-2))}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {days.map((day) => (
        <TabsContent key={day} value={day} className="flex flex-col gap-3 pt-6">
          {(byDay.get(day) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada jadwal ibadah pada hari ini.</p>
          ) : (
            byDay.get(day)!.map((row) => <JadwalEntry key={row.id} row={row} />)
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
