"use client";

import type { RowData } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatThousands } from "@/lib/format";

import { PAGE_SIZES } from "./search-params";
import type { DataTableController } from "./use-data-table";

/** "{from}–{to} dari {total} {noun}", counted over the filtered rows. */
export function describeRange(pageIndex: number, pageSize: number, total: number, noun: string): string {
  if (total === 0) return `0 dari 0 ${noun}`;
  const from = Math.min(pageIndex * pageSize + 1, total);
  const to = Math.min((pageIndex + 1) * pageSize, total);
  return `${formatThousands(from)}–${formatThousands(to)} dari ${formatThousands(total)} ${noun}`;
}

const SIZE_ITEMS: readonly { value: number; label: string }[] = PAGE_SIZES.map((size) => ({
  value: size,
  label: String(size),
}));

export function DataTablePagination<TData extends RowData>({
  controller,
  noun,
}: {
  controller: DataTableController<TData>;
  noun: string;
}) {
  const { table, state, rowCount } = controller;
  const labelId = useId();
  const { pageIndex, pageSize } = state.pagination;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span id={labelId}>Tampilkan</span>
        <Select
          items={SIZE_ITEMS}
          value={pageSize}
          onValueChange={(value) => {
            if (value !== null) table.setPageSize(value);
          }}
        >
          <SelectTrigger
            aria-label="Jumlah baris per halaman"
            className="font-mono text-foreground tabular-nums"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {SIZE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value} className="font-mono tabular-nums">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>per halaman</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground tabular-nums" aria-live="polite">
          {describeRange(pageIndex, pageSize, rowCount, noun)}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman sebelumnya"
          disabled={pageIndex <= 0}
          onClick={() => table.previousPage()}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Halaman berikutnya"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => table.nextPage()}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
