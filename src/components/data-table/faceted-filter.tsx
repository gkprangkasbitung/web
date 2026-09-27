"use client";

import type { Column, RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { ListFilterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatThousands } from "@/lib/format";

import { getColumnLabel } from "./column-header";
import { compareText, toFacetValue, type DataTableFeatures, type FacetValue } from "./features";

type AnyColumn<TData extends RowData> = Column<DataTableFeatures, TData, unknown>;

export type FacetEntry = { value: FacetValue; label: string; count?: number };

/**
 * The options of a faceted filter.
 *
 * Client mode: the distinct values present in *all* loaded rows, so options
 * never disappear while filtering. Each count is the number of rows the
 * option would match under the other active filters (the column's own
 * filter is left out), so it tells how many rows appear when that option is
 * added. Server mode: exactly `meta.facet.options`, without counts.
 */
export function getFacetEntries<TData extends RowData>(column: AnyColumn<TData>, mode: "client" | "server"): FacetEntry[] {
  const facet = column.columnDef.meta?.facet;
  const title = facet?.title ?? getColumnLabel(column);
  const known = facet?.options ?? [];
  const labelOf = (value: FacetValue) =>
    value === null
      ? (facet?.emptyLabel ?? `Tanpa ${title}`)
      : (known.find((option) => option.value === value)?.label ?? facet?.formatValue?.(value) ?? value);

  if (mode === "server") return known.map((option) => ({ value: option.value, label: labelOf(option.value) }));

  const present = new Set<FacetValue>();
  for (const row of column.table.getCoreRowModel().rows) present.add(toFacetValue(row.getValue(column.id)));

  const counts = new Map<FacetValue, number>();
  for (const [raw, count] of column.getFacetedUniqueValues()) {
    const key = toFacetValue(raw);
    counts.set(key, (counts.get(key) ?? 0) + count);
  }

  const order = new Map(known.map((option, index) => [option.value, index]));
  return [...present]
    .map((value) => ({ value, label: labelOf(value), count: counts.get(value) ?? 0 }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === null ? (b.value === null ? 0 : 1) : -1;
      const ia = order.get(a.value);
      const ib = order.get(b.value);
      if (ia !== undefined || ib !== undefined) return (ia ?? Infinity) - (ib ?? Infinity);
      return compareText(a.label, b.label);
    });
}

function selectedValues<TData extends RowData>(column: AnyColumn<TData>): FacetValue[] {
  const value = column.getFilterValue();
  return Array.isArray(value) ? (value as FacetValue[]) : [];
}

export function DataTableFacetedFilter<TData extends RowData>({
  column,
  mode,
}: {
  column: AnyColumn<TData>;
  mode: "client" | "server";
}) {
  const facet = column.columnDef.meta?.facet;
  const title = facet?.title ?? getColumnLabel(column);
  // Recomputed on every table render: the column object is stable while data and filters change.
  const entries = getFacetEntries(column, mode);
  const selected = selectedValues(column);

  if (facet?.multiple === false) {
    return <SingleFacetFilter column={column} title={title} entries={entries} selected={selected[0]} />;
  }

  function toggle(value: FacetValue, checked: boolean) {
    const next = checked ? [...selected, value] : selected.filter((item) => item !== value);
    column.setFilterValue(next.length > 0 ? next : undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            aria-label={selected.length > 0 ? `Filter ${title}, ${selected.length} dipilih` : `Filter ${title}`}
            className={cn("border-dashed", selected.length > 0 && "border-solid")}
          />
        }
      >
        <ListFilterIcon aria-hidden />
        {title}
        {selected.length > 0 && (
          <span className="ml-0.5 rounded-full bg-badge-accent px-1.5 font-mono text-xs leading-5 text-badge-accent-foreground tabular-nums">
            {selected.length} dipilih
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          {entries.length === 0 && <p className="px-1.5 py-1 text-sm text-muted-foreground">Tidak ada pilihan.</p>}
          {entries.map((entry) => (
            <DropdownMenuCheckboxItem
              key={entry.value ?? "\u0000empty"}
              checked={selected.includes(entry.value)}
              closeOnClick={false}
              onCheckedChange={(checked) => toggle(entry.value, checked)}
              className={cn(entry.count === 0 && !selected.includes(entry.value) && "text-muted-foreground")}
            >
              <span className={cn("min-w-0 flex-1 truncate", entry.value === null && "italic")}>{entry.label}</span>
              {entry.count !== undefined && (
                <span className="ml-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatThousands(entry.count)}
                </span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>Hapus pilihan</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ALL = "__semua__";
const EMPTY = "__kosong__";

function SingleFacetFilter<TData extends RowData>({
  column,
  title,
  entries,
  selected,
}: {
  column: AnyColumn<TData>;
  title: string;
  entries: FacetEntry[];
  selected: FacetValue | undefined;
}) {
  const allLabel = `Semua ${title.toLocaleLowerCase("id")}`;
  const items = [
    { value: ALL, label: allLabel },
    ...entries.map((entry) => ({ value: entry.value ?? EMPTY, label: entry.label })),
  ];
  const current = selected === undefined ? ALL : (selected ?? EMPTY);

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(value) => {
        if (value === null || value === ALL) column.setFilterValue(undefined);
        else column.setFilterValue([value === EMPTY ? null : value]);
      }}
    >
      <SelectTrigger aria-label={`Filter ${title}`} className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
