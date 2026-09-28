"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

export type KeluargaComboboxProps = {
  /** Existing family names, for suggestions only. */
  suggestions: readonly string[];
  /** The typed family name itself (brief §9.9: resolved by name on the server, not by picking a record). */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("id");
}

/**
 * A creatable combobox over existing keluarga (brief §9.9): typing suggests
 * matching families, but the typed text is always the value that gets
 * submitted — the server resolves it (find case-insensitively, or create).
 */
export function KeluargaCombobox({
  suggestions,
  value,
  onValueChange,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
}: KeluargaComboboxProps) {
  return (
    <Combobox
      items={suggestions}
      inputValue={value}
      onInputValueChange={(next) => onValueChange(next)}
      filter={(item: string, query) => normalize(item).includes(normalize(query))}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        aria-invalid={ariaInvalid}
        name="keluarga_nama"
        placeholder="Cari atau ketik nama keluarga..."
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>Tidak ditemukan - buat dulu di halaman Keluarga.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
