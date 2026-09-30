"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, formatDayShort, today, type DateRange } from "@/lib/dates";
import { groupByDate, type PublicScheduleRow } from "@/lib/public-schedule";

import { ScheduleEntry } from "./schedule-list";

/**
 * Jadwal Ibadah's day picker (brief §9c instruction C): one tab per day of
 * `week` (Minggu–Sabtu), keyboard-operable via Base UI's `Tabs` (arrow keys,
 * Home/End, roving tabindex come for free), defaulting to today.
 */
export function ScheduleTabs({ week, rows }: { week: DateRange; rows: PublicScheduleRow[] }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(week.start, index));
  const byDay = new Map(groupByDate(rows).map((day) => [day.tanggal, day.rows]));
  const current = today();
  const defaultValue = days.includes(current) ? current : days[0];

  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList
        variant="line"
        aria-label="Pilih hari"
        activateOnFocus
        className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0"
      >
        {days.map((day) => (
          <TabsTrigger
            key={day}
            value={day}
            className="h-11 flex-none rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-none data-active:border-brand data-active:bg-brand data-active:text-brand-foreground"
          >
            {formatDayShort(day)} {Number(day.slice(-2))}
          </TabsTrigger>
        ))}
      </TabsList>
      {days.map((day) => (
        <TabsContent key={day} value={day} className="flex flex-col gap-3 pt-6">
          {(byDay.get(day) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada jadwal ibadah pada hari ini.</p>
          ) : (
            byDay.get(day)!.map((row) => <ScheduleEntry key={row.id} row={row} />)
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
