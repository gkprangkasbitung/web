"use client";

import { cn } from "cn";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";

export type PersonOption = {
  id: string;
  nama: string;
  labels: readonly string[];
};

export type PersonPickerProps = {
  people: readonly PersonOption[];
  value: string | null;
  onValueChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Ids to leave out of the list, e.g. members already in this family. */
  excludeIds?: readonly string[];
  id?: string;
  "aria-invalid"?: boolean;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("id");
}

/**
 * Searchable combobox over all jemaat (brief §9.5): matches the name or any
 * of the person's labels, and each option shows its labels. Reusable
 * wherever the app picks one person (Peribadahan roles, Tambah Anggota).
 */
export function PersonPicker({
  people,
  value,
  onValueChange,
  placeholder = "Cari nama atau label...",
  disabled,
  excludeIds,
  id,
  "aria-invalid": ariaInvalid,
}: PersonPickerProps) {
  const options = excludeIds ? people.filter((person) => !excludeIds.includes(person.id)) : people;
  const selected = options.find((person) => person.id === value) ?? null;

  return (
    <Combobox<PersonOption>
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next?.id ?? null)}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(item) => item.nama}
      filter={(item, query) => {
        const q = normalize(query);
        if (!q) return true;
        return normalize(item.nama).includes(q) || item.labels.some((label) => normalize(label).includes(q));
      }}
      disabled={disabled}
    >
      <ComboboxInput id={id} aria-invalid={ariaInvalid} placeholder={placeholder} showClear />
      <ComboboxContent>
        <ComboboxEmpty>Tidak ada jemaat yang cocok.</ComboboxEmpty>
        <ComboboxList>
          {(item: PersonOption) => (
            <ComboboxItem key={item.id} value={item}>
              <span className={cn("flex min-w-0 flex-1 items-center gap-2")}>
                <span className="truncate">{item.nama}</span>
                {item.labels.length > 0 && (
                  <span className="flex shrink-0 flex-wrap gap-1">
                    {item.labels.map((label) => (
                      <Badge key={label} variant="neutral" className="h-5 px-1.5 text-[10px]">
                        {label}
                      </Badge>
                    ))}
                  </span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
