"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";

export type LabelOption = { id: string; nama: string };

export type LabelMultiSelectProps = {
  labels: readonly LabelOption[];
  value: readonly string[];
  onValueChange: (ids: string[]) => void;
  disabled?: boolean;
  id?: string;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("id");
}

/** Multi-select combobox over Label Jemaat, shown as chips (brief §9.9). */
export function LabelMultiSelect({ labels, value, onValueChange, disabled, id }: LabelMultiSelectProps) {
  const anchor = useComboboxAnchor();
  const selected = labels.filter((label) => value.includes(label.id));

  if (labels.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada label - buat di halaman Label Jemaat.</p>;
  }

  return (
    <Combobox<LabelOption, true>
      multiple
      items={labels}
      value={selected}
      onValueChange={(next) => onValueChange(next.map((label) => label.id))}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(item) => item.nama}
      filter={(item, query) => normalize(item.nama).includes(normalize(query))}
      disabled={disabled}
    >
      <ComboboxChips ref={anchor} id={id}>
        {selected.map((label) => (
          <ComboboxChip key={label.id} aria-label={label.nama}>
            {label.nama}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput placeholder={selected.length === 0 ? "Pilih label..." : undefined} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Tidak ada label yang cocok.</ComboboxEmpty>
        <ComboboxList>
          {(item: LabelOption) => <ComboboxItem key={item.id} value={item}>{item.nama}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
