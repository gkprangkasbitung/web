"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "cn";
import { KEGIATAN_WARNA_LABELS, KEGIATAN_WARNA_PALETTE, kategoriDotColor, type KegiatanWarna } from "@/lib/kegiatan-kategori";

export type ColorSwatchPickerProps = {
  id?: string;
  value: KegiatanWarna | null;
  onValueChange: (value: KegiatanWarna) => void;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/** A grid of labeled color swatches (brief §14.4: "pilihan warna dari palet yang tampil sebagai swatch berlabel"). */
export function ColorSwatchPicker({ id, value, onValueChange, disabled, "aria-describedby": describedBy }: ColorSwatchPickerProps) {
  return (
    <div id={id} role="radiogroup" aria-describedby={describedBy} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {KEGIATAN_WARNA_PALETTE.map((key) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onValueChange(key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              selected ? "border-ring ring-2 ring-ring/50" : "border-input hover:bg-accent",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full"
              style={{ backgroundColor: kategoriDotColor(key) }}
            />
            <span className="flex-1 text-left">{KEGIATAN_WARNA_LABELS[key]}</span>
            {selected && <CheckIcon aria-hidden className="size-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
