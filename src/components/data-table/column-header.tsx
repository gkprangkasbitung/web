"use client";

import { FlexRender, type Column, type Header, type RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { DataTableFeatures } from "./features";
import { SearchInput } from "./search-input";

type AnyColumn<TData extends RowData> = Column<DataTableFeatures, TData, unknown>;

/** Plain-text name of a column, for labels and aria text. */
export function getColumnLabel<TData extends RowData>(column: AnyColumn<TData>): string {
  const header = column.columnDef.header;
  return column.columnDef.meta?.label ?? (typeof header === "string" ? header : column.id);
}

/** `aria-sort` for a header cell; only sortable columns get one. */
export function getAriaSort<TData extends RowData>(
  column: AnyColumn<TData>,
): "ascending" | "descending" | "none" | undefined {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  return sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
}

export function DataTableColumnHeader<TData extends RowData>({
  header,
  debounceMs,
}: {
  header: Header<DataTableFeatures, TData, unknown>;
  debounceMs: number;
}) {
  if (header.isPlaceholder) return null;
  const column = header.column;
  const meta = column.columnDef.meta;
  const content = <FlexRender header={header} />;
  const sorted = column.getIsSorted();

  return (
    <div className={cn("flex items-center gap-0.5", meta?.numeric && "justify-end")}>
      {column.getCanSort() ? (
        <button
          type="button"
          onClick={column.getToggleSortingHandler()}
          className={cn(
            "-mx-1.5 inline-flex h-8 items-center gap-1 rounded-md px-1.5 font-medium outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            sorted && "text-foreground",
          )}
        >
          {content}
          {sorted === "asc" && <ArrowUpIcon aria-hidden className="size-3.5" />}
          {sorted === "desc" && <ArrowDownIcon aria-hidden className="size-3.5" />}
        </button>
      ) : (
        <span className={cn(meta?.search && "pr-0.5")}>{content}</span>
      )}
      {meta?.search && column.getCanFilter() && <ColumnSearch column={column} debounceMs={debounceMs} />}
    </div>
  );
}

function ColumnSearch<TData extends RowData>({ column, debounceMs }: { column: AnyColumn<TData>; debounceMs: number }) {
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const label = getColumnLabel(column);
  const value = typeof column.getFilterValue() === "string" ? (column.getFilterValue() as string) : "";
  const search = column.columnDef.meta?.search;
  const placeholder = (typeof search === "object" && search.placeholder) || `Cari ${label.toLocaleLowerCase("id")}...`;
  const active = value.trim() !== "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={active ? `Cari ${label} (aktif: ${value})` : `Cari ${label}`}
            className={cn("text-muted-foreground", active && "bg-primary/10 text-primary hover:text-primary")}
          />
        }
      >
        <SearchIcon aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 font-normal">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Cari {label}
        </label>
        <SearchInput
          id={inputId}
          value={value}
          debounceMs={debounceMs}
          placeholder={placeholder}
          onValueChange={(next) => column.setFilterValue(next)}
          onKeyDown={(event) => {
            if (event.key === "Enter") setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
