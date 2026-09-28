"use client";

import { cn } from "cn";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { id as localeId } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatDateCompact,
  isoDateToLocalDate,
  localDateToIsoDate,
  today,
  type DateRange,
} from "@/lib/dates";

export type DateRangeValue = Partial<DateRange>;

export type DateRangeFilterProps = {
  /** `YYYY-MM-DD` bounds; both are inclusive. */
  value: DateRangeValue;
  onValueChange: (value: DateRangeValue) => void;
  /** Accessible name and empty-state text of the trigger. */
  label?: string;
  className?: string;
};

export function describeDateRange(value: DateRangeValue): string | null {
  const { start, end } = value;
  if (start && end) return start === end ? formatDateCompact(start) : `${formatDateCompact(start)} – ${formatDateCompact(end)}`;
  if (start) return `Sejak ${formatDateCompact(start)}`;
  if (end) return `Sampai ${formatDateCompact(end)}`;
  return null;
}

/**
 * Date range picker for table toolbars. The end date is inclusive: consumers
 * filter `date <= end`, or for timestamps `< jakartaDayStart(end + 1 day)`
 * (see `jakartaTimestampBounds`).
 */
export function DateRangeFilter({ value, onValueChange, label = "Rentang tanggal", className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const summary = describeDateRange(value);
  const selected: DayPickerRange | undefined = value.start
    ? { from: isoDateToLocalDate(value.start), to: value.end ? isoDateToLocalDate(value.end) : undefined }
    : undefined;

  return (
    <div className={cn("flex items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              aria-label={summary ? `${label}: ${summary}` : label}
              className={cn("justify-start border-dashed font-normal", summary && "rounded-r-none border-solid")}
            />
          }
        >
          <CalendarIcon aria-hidden />
          <span className={cn("truncate", !summary && "text-muted-foreground")}>{summary ?? label}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            locale={localeId}
            weekStartsOn={0}
            today={isoDateToLocalDate(today())}
            defaultMonth={selected?.from}
            selected={selected}
            onSelect={(range) => {
              onValueChange({
                start: range?.from ? localDateToIsoDate(range.from) : undefined,
                end: range?.to ? localDateToIsoDate(range.to) : undefined,
              });
            }}
          />
        </PopoverContent>
      </Popover>
      {summary && (
        <Button
          variant="outline"
          size="icon"
          aria-label={`Hapus ${label.toLocaleLowerCase("id")}`}
          className="-ml-px rounded-l-none"
          onClick={() => onValueChange({})}
        >
          <XIcon aria-hidden />
        </Button>
      )}
    </div>
  );
}
