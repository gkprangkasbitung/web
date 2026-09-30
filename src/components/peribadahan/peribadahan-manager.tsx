"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { SearchInput } from "@/components/data-table/search-input";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import type { PeribadahanCategoryOption, PeribadahanItemRow, SmkaKelompokRow } from "@/lib/peribadahan-routes";

import { buildAllColumns, buildCategoryColumns } from "./peribadahan-columns";
import { usePeribadahanActions } from "./use-peribadahan-actions";

export type PeribadahanScope = { type: "all" } | { type: "category"; key: string; name: string };

export function PeribadahanManager({
  scope,
  rows,
  categories,
  tempatOptions,
  wilayahOptions,
  peopleOptions,
  smkaGroups,
  canWrite,
  initialSearch,
}: {
  scope: PeribadahanScope;
  rows: PeribadahanItemRow[];
  categories: readonly PeribadahanCategoryOption[];
  tempatOptions: readonly { id: string; nama: string }[];
  wilayahOptions: readonly { id: string; nama: string }[];
  peopleOptions: readonly PersonOptionRow[];
  smkaGroups: Map<string, SmkaKelompokRow[]>;
  canWrite: boolean;
  /** Current `?q=`; only meaningful for scope "all" (brief §9.5's server-side search). */
  initialSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const columns = useMemo(
    () => (scope.type === "all" ? buildAllColumns() : buildCategoryColumns(scope.key)),
    [scope],
  );
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });
  const tanggalColumn = table.table.getColumn("tanggal");

  const { addAction, rowActions, dialogs } = usePeribadahanActions({
    categories,
    fixedCategoryKey: scope.type === "category" ? scope.key : undefined,
    tempatOptions,
    wilayahOptions,
    peopleOptions,
    smkaGroups,
    canWrite,
  });

  function updateSearch(value: string) {
    const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }

  const title = scope.type === "all" ? "Peribadahan" : scope.name;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} actions={addAction} />

      <DataTable
        table={table}
        label={title}
        noun="jadwal"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={
          scope.type === "all" ? (
            <>
              <div className="relative w-full sm:w-64">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <SearchInput
                  aria-label="Cari tema/DPA/catatan"
                  placeholder="Cari tema/DPA/catatan..."
                  value={initialSearch ?? ""}
                  onValueChange={updateSearch}
                  debounceMs={300}
                  className="pl-8"
                />
              </div>
              <DateRangeFilter
                label="Rentang tanggal"
                value={(tanggalColumn?.getFilterValue() as DateRangeValue | undefined) ?? {}}
                onValueChange={(value) => tanggalColumn?.setFilterValue(value.start || value.end ? value : undefined)}
              />
            </>
          ) : undefined
        }
        rowActions={rowActions}
      />

      {dialogs}
    </div>
  );
}
