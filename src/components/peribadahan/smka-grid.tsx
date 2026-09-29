"use client";

import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SMKA_GROUPS, type SmkaGroupKey } from "@/lib/peribadahan";
import type { SmkaKelompokRow } from "@/lib/peribadahan-routes";

export type SmkaGroupValue = {
  kelompok: SmkaGroupKey;
  pfId: string | null;
  lakiLaki: number | null;
  perempuan: number | null;
};

/** The 8 rows, empty, in display order — the edit form's starting point for a fresh item. */
export function emptySmkaGrid(): SmkaGroupValue[] {
  return SMKA_GROUPS.map((group) => ({ kelompok: group.key, pfId: null, lakiLaki: null, perempuan: null }));
}

/** Fills the 8 fixed rows from what's saved; a group with no row yet is blank. */
export function smkaGridFromRows(rows: readonly SmkaKelompokRow[]): SmkaGroupValue[] {
  const byKelompok = new Map(rows.map((row) => [row.kelompok, row]));
  return SMKA_GROUPS.map((group) => {
    const saved = byKelompok.get(group.key);
    return { kelompok: group.key, pfId: saved?.pfId ?? null, lakiLaki: saved?.lakiLaki ?? null, perempuan: saved?.perempuan ?? null };
  });
}

function parseCount(raw: string): number | null {
  return raw === "" ? null : Number(raw);
}

/** The SMKA 8-group grid (brief §9.5): PF for the 6 kelas rows, L/P for all 8. */
export function SmkaGrid({
  value,
  onValueChange,
  peopleOptions,
  disabled,
}: {
  value: readonly SmkaGroupValue[];
  onValueChange: (value: SmkaGroupValue[]) => void;
  peopleOptions: readonly PersonOption[];
  disabled?: boolean;
}) {
  function update(kelompok: SmkaGroupKey, patch: Partial<SmkaGroupValue>) {
    onValueChange(value.map((row) => (row.kelompok === kelompok ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {SMKA_GROUPS.map((group) => {
        const row = value.find((r) => r.kelompok === group.key) ?? { kelompok: group.key, pfId: null, lakiLaki: null, perempuan: null };
        return (
          <div key={group.key} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_4.5rem_4.5rem]">
            <div className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-2">{group.label}</div>
            {group.hasPf ? (
              <PersonPicker
                people={peopleOptions}
                value={row.pfId}
                onValueChange={(id) => update(group.key, { pfId: id })}
                placeholder="Pilih PF"
                disabled={disabled}
              />
            ) : (
              <div aria-hidden />
            )}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">L</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={row.lakiLaki ?? ""}
                onChange={(event) => update(group.key, { lakiLaki: parseCount(event.target.value) })}
                disabled={disabled}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">P</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={row.perempuan ?? ""}
                onChange={(event) => update(group.key, { perempuan: parseCount(event.target.value) })}
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
