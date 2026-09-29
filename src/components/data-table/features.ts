/* eslint-disable @typescript-eslint/no-explicit-any -- filter/sort fns are shared by every row type, like the TanStack built-ins (`CreatedFilterFn<any, any>`). */
import {
  columnFacetingFeature,
  columnFilteringFeature,
  createColumnHelper,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type FilterFn,
  type RowData,
  type SortFn,
  type SortingState,
} from "@tanstack/react-table";

import type { DateRange } from "@/lib/dates";

/** One option of a faceted filter. `value: null` is the "Tanpa {title}" option. */
export type FacetOption = { value: FacetValue; label: string };
export type FacetValue = string | null;

export type DataTableColumnMeta = {
  /** Plain-text column name for aria labels, search, and facets. Defaults to a string `header`. */
  label?: string;
  /** Numbers, amounts, and dates: right-aligned with tabular figures (brief §2). */
  numeric?: boolean;
  /** Monospace text such as No. Anggota, slugs, and IP addresses. */
  mono?: boolean;
  /** Free-text column: a search popover in the header ("contains", case-insensitive). */
  search?: boolean | { placeholder?: string };
  /** Categorical column: a filter in the toolbar. */
  facet?: {
    /** Toolbar label; defaults to `label`. */
    title?: string;
    /** Display text for a value; defaults to the value itself. */
    formatValue?: (value: string) => string;
    /**
     * Known options. Client mode shows only the values present in the data,
     * in this order; server mode shows exactly these.
     */
    options?: readonly FacetOption[];
    /** Label of the empty-value option; defaults to "Tanpa {title}". */
    emptyLabel?: string;
    /** `false` renders a single-select dropdown instead of the multi-select. */
    multiple?: boolean;
  };
  /**
   * Feeds a toolbar facet without its own header/body cell: for a value
   * that's already shown merged into another column (e.g. a combined
   * "Ringkasan" column), so the facet still filters on the raw value while
   * the table doesn't show it twice.
   */
  facetOnly?: boolean;
  /** Extra classes for the header and body cells of this column. */
  className?: string;
};

const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });

export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

function isBlank(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

/** Facet key of a cell value: blanks collapse to `null`, everything else to a string. */
export function toFacetValue(value: unknown): FacetValue {
  return isBlank(value) ? null : String(value);
}

function toSearchText(value: unknown): string {
  if (isBlank(value)) return "";
  if (Array.isArray(value)) return value.map(toSearchText).join(" ");
  return String(value);
}

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("id");
}

/** Case-insensitive "contains" on one column. */
const contains: FilterFn<any, any> = (row, columnId, filterValue: string) =>
  normalizeSearch(toSearchText(row.getValue(columnId))).includes(normalizeSearch(filterValue));
contains.autoRemove = (value: unknown) => typeof value !== "string" || normalizeSearch(value) === "";

/** Faceted filter: the cell's value is one of the selected values. */
const inSet: FilterFn<any, any> = (row, columnId, filterValue: FacetValue[]) =>
  filterValue.includes(toFacetValue(row.getValue(columnId)));
inSet.autoRemove = (value: unknown) => !Array.isArray(value) || value.length === 0;

/** Inclusive `YYYY-MM-DD` range; string comparison is calendar order for ISO dates. */
const inDateRange: FilterFn<any, any> = (row, columnId, filterValue: Partial<DateRange>) => {
  const value = row.getValue<string | null>(columnId);
  if (!value) return false;
  const day = value.slice(0, 10);
  return (!filterValue.start || day >= filterValue.start) && (!filterValue.end || day <= filterValue.end);
};
inDateRange.autoRemove = (value: unknown) =>
  !value || typeof value !== "object" || (!("start" in value && value.start) && !("end" in value && value.end));

/**
 * Blank values sort last in both directions. The table negates the comparator
 * for descending order, so the blank rule is negated back when the column is
 * sorted descending.
 */
function blanksLast(compare: (a: unknown, b: unknown) => number): SortFn<any, any> {
  return (rowA, rowB, columnId) => {
    const a = rowA.getValue(columnId);
    const b = rowB.getValue(columnId);
    const blankA = isBlank(a);
    const blankB = isBlank(b);
    if (!blankA && !blankB) return compare(a, b);
    if (blankA && blankB) return 0;
    const sorting: SortingState = rowA.table.atoms.sorting?.get() ?? [];
    const desc = sorting.find((sort) => sort.id === columnId)?.desc ?? false;
    const last = blankA ? 1 : -1;
    return desc ? -last : last;
  };
}

/** Text in Indonesian collation: case- and accent-insensitive, "Contoh 2" before "Contoh 10". */
const text = blanksLast((a, b) => compareText(toSearchText(a), toSearchText(b)));

/** Numbers, booleans, and ISO dates/timestamps (which sort correctly as strings). */
const basic = blanksLast((a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
});

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { contains, inSet, inDateRange },
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text, basic },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

/** Column helper bound to the shared table features. */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}
