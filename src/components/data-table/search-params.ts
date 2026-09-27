import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";

import { isValidIsoDate, type DateRange } from "@/lib/dates";

/**
 * Table state shared by both data modes, and its URL encoding for
 * server-side tables (Log Aktivitas). No "use client": server pages parse
 * their `searchParams` with the same code the client uses to write them.
 */

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type DataTableState = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pagination: PaginationState;
};

export const INITIAL_TABLE_STATE: DataTableState = {
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
};

export type TableFilterKind = "text" | "set" | "dateRange";

export type TableParamsConfig = {
  /** Column ids the server may order by. Anything else in `sort` is ignored. */
  sortable?: readonly string[];
  /** Column filters read from the URL, keyed by column id. */
  filters?: Readonly<Record<string, TableFilterKind>>;
};

type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

const RESERVED = new Set(["page", "size", "sort", "q"]);
const MAX_TEXT = 200;

function getAll(params: SearchParamsInput, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function getOne(params: SearchParamsInput, key: string): string | undefined {
  return getAll(params, key)[0];
}

function assertConfig(config: TableParamsConfig) {
  for (const id of Object.keys(config.filters ?? {})) {
    if (RESERVED.has(id)) throw new Error(`Filter id "${id}" clashes with a reserved table param.`);
  }
}

function parseDateRange(raw: string): Partial<DateRange> | undefined {
  const [start = "", end = ""] = raw.split("~");
  const range: Partial<DateRange> = {};
  if (isValidIsoDate(start)) range.start = start;
  if (isValidIsoDate(end)) range.end = end;
  if (range.start && range.end && range.end < range.start) return undefined;
  return range.start || range.end ? range : undefined;
}

/**
 * Reads table state from URL search params. Invalid values fall back to the
 * defaults instead of failing: `page` ≥ 1, `size` one of `PAGE_SIZES`,
 * `sort` limited to `config.sortable`.
 */
export function parseTableSearchParams(params: SearchParamsInput, config: TableParamsConfig = {}): DataTableState {
  assertConfig(config);

  const page = Number(getOne(params, "page"));
  const size = Number(getOne(params, "size"));
  const pagination: PaginationState = {
    pageIndex: Number.isInteger(page) && page >= 1 ? page - 1 : 0,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };

  const sorting: SortingState = [];
  const sortMatch = /^([\w-]+)\.(asc|desc)$/.exec(getOne(params, "sort") ?? "");
  if (sortMatch && config.sortable?.includes(sortMatch[1]!)) {
    sorting.push({ id: sortMatch[1]!, desc: sortMatch[2] === "desc" });
  }

  const columnFilters: ColumnFiltersState = [];
  for (const [id, kind] of Object.entries(config.filters ?? {})) {
    if (kind === "text") {
      const value = getOne(params, id)?.trim().slice(0, MAX_TEXT);
      if (value) columnFilters.push({ id, value });
    } else if (kind === "set") {
      const values = [...new Set(getAll(params, id).map((v) => v.slice(0, MAX_TEXT)))].map((v) => (v === "" ? null : v));
      if (values.length > 0) columnFilters.push({ id, value: values });
    } else {
      const range = parseDateRange(getOne(params, id) ?? "");
      if (range) columnFilters.push({ id, value: range });
    }
  }

  const globalFilter = (getOne(params, "q") ?? "").trim().slice(0, MAX_TEXT);

  return { sorting, columnFilters, globalFilter, pagination };
}

/** Writes table state as URL search params, leaving defaults out. */
export function tableStateToSearchParams(state: DataTableState, config: TableParamsConfig = {}): URLSearchParams {
  assertConfig(config);
  const params = new URLSearchParams();

  const { pageIndex, pageSize } = state.pagination;
  if (pageIndex > 0) params.set("page", String(pageIndex + 1));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(pageSize));

  const sort = state.sorting[0];
  if (sort && config.sortable?.includes(sort.id)) params.set("sort", `${sort.id}.${sort.desc ? "desc" : "asc"}`);

  const query = state.globalFilter.trim();
  if (query) params.set("q", query);

  for (const [id, kind] of Object.entries(config.filters ?? {})) {
    const value = state.columnFilters.find((filter) => filter.id === id)?.value;
    if (value === undefined) continue;
    if (kind === "text" && typeof value === "string" && value.trim()) {
      params.set(id, value.trim());
    } else if (kind === "set" && Array.isArray(value)) {
      for (const item of value) params.append(id, item === null ? "" : String(item));
    } else if (kind === "dateRange" && typeof value === "object") {
      const { start, end } = value as Partial<DateRange>;
      if (start || end) params.set(id, `${start ?? ""}~${end ?? ""}`);
    }
  }

  return params;
}
