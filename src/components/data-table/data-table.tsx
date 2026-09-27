"use client";

import { FlexRender, type RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { DataTableColumnHeader, getAriaSort } from "./column-header";
import { DataTableSkeletonRows } from "./data-table-skeleton";
import { DataTableFacetedFilter } from "./faceted-filter";
import type { DataTableColumnMeta } from "./features";
import { DataTablePagination } from "./pagination";
import { resolveRowActions, RowActionsMenu, type RowActionsConfig } from "./row-actions";
import { SearchInput } from "./search-input";
import type { DataTableController } from "./use-data-table";

/** Server-side searches wait for a pause in typing before requesting a page. */
const SERVER_DEBOUNCE_MS = 300;

export type DataTableProps<TData extends RowData> = {
  /** From `useDataTable`. */
  table: DataTableController<TData>;
  /** Accessible name of the table, usually the page title. */
  label: string;
  /** Counted noun for pagination and empty states: "jemaat", "tempat", "transaksi". */
  noun: string;
  /** `warta:update` (or the module's write permission). False = read-only mode. */
  canWrite: boolean;
  /** The add action, shown in the empty state when `canWrite`. */
  addAction?: React.ReactNode;
  /** Placeholder of the toolbar search box; the box shows only when this is set. */
  searchPlaceholder?: string;
  /** Extra toolbar controls, such as a date range filter. */
  toolbar?: React.ReactNode;
  rowActions?: RowActionsConfig<TData>;
  /** Shows skeleton rows; server mode also shows them while a page loads. */
  isLoading?: boolean;
};

function cellClasses(meta: DataTableColumnMeta | undefined) {
  return cn(
    "px-3",
    meta?.numeric && "text-right font-mono tabular-nums",
    meta?.mono && "font-mono",
    meta?.className,
  );
}

/** The shared admin table (brief §9.2). */
export function DataTable<TData extends RowData>({
  table: controller,
  label,
  noun,
  canWrite,
  addAction,
  searchPlaceholder,
  toolbar,
  rowActions,
  isLoading = false,
}: DataTableProps<TData>) {
  const { table, state, mode, isFiltered, resetFilters, isPending } = controller;
  const debounceMs = mode === "server" ? SERVER_DEBOUNCE_MS : 0;

  // The dialog keeps its row while closing so the title doesn't blank out mid-animation.
  const [deleteTarget, setDeleteTarget] = useState<TData | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const rows = table.getRowModel().rows;
  const leafColumns = table.getAllLeafColumns();
  const facetColumns = leafColumns.filter((column) => column.columnDef.meta?.facet);

  const resolved = rowActions
    ? rows.map((row) =>
        resolveRowActions(rowActions, row.original, canWrite, (target) => {
          setDeleteTarget(target);
          setDeleteOpen(true);
        }),
      )
    : [];
  const hasActions = resolved.some(({ items, deleteItem }) => items.length > 0 || deleteItem);
  const columnCount = leafColumns.length + (hasActions ? 1 : 0);
  const loading = isLoading || isPending;

  const hasToolbar = Boolean(searchPlaceholder || facetColumns.length > 0 || toolbar || isFiltered);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <div className="relative w-full sm:w-64">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <SearchInput
                aria-label={searchPlaceholder.replace(/\.+$/, "")}
                placeholder={searchPlaceholder}
                value={state.globalFilter}
                onValueChange={(value) => table.setGlobalFilter(value)}
                debounceMs={debounceMs}
                className="pl-8"
              />
            </div>
          )}
          {facetColumns.map((column) => (
            <DataTableFacetedFilter key={column.id} column={column} mode={mode} />
          ))}
          {toolbar}
          {isFiltered && (
            <Button variant="ghost" onClick={resetFilters}>
              Reset
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table aria-label={label} aria-busy={loading || undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={getAriaSort(header.column)}
                    className={cn(cellClasses(header.column.columnDef.meta), "font-sans font-medium text-muted-foreground")}
                  >
                    <DataTableColumnHeader header={header} debounceMs={debounceMs} />
                  </TableHead>
                ))}
                {hasActions && (
                  <TableHead className="w-12 px-3">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                )}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <DataTableSkeletonRows columnCount={columnCount} rowCount={Math.min(state.pagination.pageSize, 5)} />
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-40 px-3 text-center whitespace-normal">
                  <div className="flex flex-col items-center gap-3">
                    {isFiltered ? (
                      <>
                        <p className="text-muted-foreground">Tidak ada {noun} yang cocok dengan filter ini.</p>
                        <Button variant="outline" onClick={resetFilters}>
                          Reset filter
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">Belum ada {noun}.</p>
                        {canWrite && addAction}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.id} className="group/row h-12">
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cellClasses(cell.column.columnDef.meta)}>
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                  {hasActions && (
                    <TableCell className="px-3 text-right">
                      {rowActions && resolved[index] && (
                        <RowActionsMenu
                          label={rowActions.getRowLabel(row.original)}
                          items={resolved[index].items}
                          deleteItem={resolved[index].deleteItem}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {controller.rowCount > 0 && <DataTablePagination controller={controller} noun={noun} />}

      {rowActions?.delete && deleteTarget !== null && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={rowActions.delete.title(deleteTarget)}
          description={rowActions.delete.description?.(deleteTarget)}
          onConfirm={() => rowActions.delete?.onConfirm(deleteTarget)}
        />
      )}
    </div>
  );
}
