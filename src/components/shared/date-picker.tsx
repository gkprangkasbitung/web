"use client";

import { cn } from "cn";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { id as localeId } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateCompact, isoDateToLocalDate, localDateToIsoDate, today, type IsoDate } from "@/lib/dates";

export type DatePickerProps = {
  /** `YYYY-MM-DD`, or null when empty. */
  value: IsoDate | null;
  onValueChange: (value: IsoDate | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
};

/** A single-date picker (brief §9.9: Tanggal Lahir, Tanggal Masuk, and pastoral note dates). */
export function DatePicker({
  value,
  onValueChange,
  placeholder = "Pilih tanggal",
  disabled,
  clearable = true,
  id,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? isoDateToLocalDate(value) : undefined;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-invalid={ariaInvalid}
              className={cn("w-full justify-start font-normal", value && clearable && "rounded-r-none")}
            />
          }
        >
          <CalendarIcon aria-hidden />
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? formatDateCompact(value) : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={localeId}
            weekStartsOn={0}
            today={isoDateToLocalDate(today())}
            defaultMonth={selected}
            selected={selected}
            onSelect={(date) => {
              onValueChange(date ? localDateToIsoDate(date) : null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && clearable && !disabled && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Hapus tanggal"
          className="-ml-px rounded-l-none"
          onClick={() => onValueChange(null)}
        >
          <XIcon aria-hidden />
        </Button>
      )}
    </div>
  );
}
