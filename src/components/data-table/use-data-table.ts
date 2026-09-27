"use client";

import { functionalUpdate, useTable, type RowData, type Updater } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { dataTableFeatures, type DataTableColumnDef } from "./features";
import { INITIAL_TABLE_STATE, type DataTableState } from "./search-params";

export type ServerTableOptions = {
  /** Current state, parsed from the URL (see `useUrlTableState`). */
  state: DataTableState;
  onStateChange: (next: DataTableState) => void;
  /** Total rows matching the filters, across all pages. */
  rowCount: number;
  /** True while the server is loading the requested page. */
  isPending?: boolean;
};

export type UseDataTableOptions<TData extends RowData> = {
  /** Client mode: every row. Server mode: the current page, already filtered and sorted. */
  data: TData[];
  columns: DataTableColumnDef<TData>[];
  getRowId: (row: TData) => string;
  /** Starting state in client mode (server mode reads it from the URL). */
  initialState?: Partial<DataTableState>;
  /** Columns matched by the toolbar search box (`globalFilter`). */
  searchColumns?: readonly string[];
  /** Present for server-side tables: sort, filter, and pagination happen on the server. */
  server?: ServerTableOptions;
};

/**
 * Builds a table for `<DataTable>`. Client mode loads every row and sorts,
 * filters, and paginates in the browser so facet counts are right (brief
 * §9.2). Server mode hands every state change to `server.onStateChange`.
 */
export function useDataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  initialState,
  searchColumns,
  server,
}: UseDataTableOptions<TData>) {
  const [localState, setLocalState] = useState<DataTableState>(() => ({
    ...INITIAL_TABLE_STATE,
    ...initialState,
  }));
  const state = server ? server.state : localState;

  function commit(next: (current: DataTableState) => DataTableState) {
    if (server) server.onStateChange(next(server.state));
    else setLocalState(next);
  }

  /** A sort or filter change starts over at page 1. */
  function changeAndRestart<K extends "sorting" | "columnFilters" | "globalFilter">(key: K) {
    return (updater: Updater<DataTableState[K]>) =>
      commit((current) => ({
        ...current,
        [key]: functionalUpdate(updater, current[key]),
        pagination: { ...current.pagination, pageIndex: 0 },
      }));
  }

  const resolvedColumns = useMemo(() => columns.map(withDefaults), [columns]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: resolvedColumns,
    getRowId,
    state,
    onSortingChange: changeAndRestart("sorting"),
    onColumnFiltersChange: changeAndRestart("columnFilters"),
    onGlobalFilterChange: changeAndRestart("globalFilter"),
    onPaginationChange: (updater) =>
      commit((current) => {
        const next = functionalUpdate(updater, current.pagination);
        // Changing the page size returns to page 1.
        const pageIndex = next.pageSize === current.pagination.pageSize ? next.pageIndex : 0;
        return { ...current, pagination: { pageSize: next.pageSize, pageIndex } };
      }),
    // One sort at a time, cycling ascending → descending → unsorted.
    enableMultiSort: false,
    enableSortingRemoval: true,
    sortDescFirst: false,
    // Refreshed data (after a mutation) keeps the current page.
    autoResetPageIndex: false,
    globalFilterFn: "contains",
    getColumnCanGlobalFilter: (column) => searchColumns?.includes(column.id) ?? false,
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    manualPagination: Boolean(server),
    rowCount: server?.rowCount,
  });

  const rowCount = server ? server.rowCount : table.getPrePaginatedRowModel().rows.length;
  const pageCount = Math.ceil(rowCount / state.pagination.pageSize);

  // After a delete empties the last page, move to the page that still exists
  // (adjusting state while rendering, so no stale empty page is painted).
  if (!server && pageCount > 0 && state.pagination.pageIndex >= pageCount) {
    setLocalState((current) => ({ ...current, pagination: { ...current.pagination, pageIndex: pageCount - 1 } }));
  }

  const prePaginatedRows = table.getPrePaginatedRowModel().rows;
  const filteredRows = useMemo(
    () => (server ? data : prePaginatedRows.map((row) => row.original)),
    [server, data, prePaginatedRows],
  );

  const isFiltered = state.columnFilters.length > 0 || state.globalFilter.trim() !== "";

  return {
    table,
    state,
    mode: server ? ("server" as const) : ("client" as const),
    /** Rows matching the filters across all pages. */
    rowCount,
    /**
     * Every row matching the current filters and search, in the current sort
     * order: not only the visible page. Use it for CSV export (brief §12.2).
     * In server mode it is the loaded page.
     */
    filteredRows,
    isFiltered,
    isPending: server?.isPending ?? false,
    /** Clears every column filter and the search box. */
    resetFilters: () =>
      commit((current) => ({
        ...current,
        columnFilters: [],
        globalFilter: "",
        pagination: { ...current.pagination, pageIndex: 0 },
      })),
  };
}

export type DataTableController<TData extends RowData> = ReturnType<typeof useDataTable<TData>>;

/** Sorting is opt-in per column; filter and sort functions follow the column's meta. */
function withDefaults<TData extends RowData>(column: DataTableColumnDef<TData>): DataTableColumnDef<TData> {
  const meta = column.meta;
  return {
    enableSorting: false,
    sortFn: meta?.numeric ? "basic" : "text",
    filterFn: meta?.facet ? "inSet" : "contains",
    ...column,
  } as DataTableColumnDef<TData>;
}
