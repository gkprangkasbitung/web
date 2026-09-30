"use client";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useUrlTableState } from "@/components/data-table/use-url-table-state";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { ACTIVITY_LOG_TABLE_CONFIG, type ActivityLogRow } from "@/lib/activity-log-table";
import { ACTIVITY_MODULES, MODULE_LABELS, moduleLabel } from "@/lib/activity-modules";
import { formatTimestamp } from "@/lib/dates";

const helper = createDataTableColumnHelper<ActivityLogRow>();
const MODULE_OPTIONS = ACTIVITY_MODULES.map((value) => ({ value, label: MODULE_LABELS[value] }));

const COLUMNS = helper.columns([
  helper.accessor("created_at", {
    header: "Waktu",
    enableSorting: true,
    meta: { numeric: true, className: "whitespace-nowrap" },
    cell: ({ getValue }) => formatTimestamp(getValue()),
  }),
  helper.accessor("user_email", {
    header: "Pengguna",
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("module", {
    header: "Modul",
    enableSorting: true,
    meta: { facet: { title: "Modul", options: MODULE_OPTIONS, multiple: false } },
    cell: ({ getValue }) => <Badge variant="accent">{moduleLabel(getValue())}</Badge>,
  }),
  helper.accessor("activity", { header: "Aktivitas", meta: { className: "min-w-64 whitespace-normal" } }),
  helper.accessor("ip_address", {
    header: "IP",
    meta: { mono: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
]);

/**
 * Log Aktivitas (brief §9.13): server-side filtering, sorting, and paging
 * through the URL. The server page reads the same params.
 */
export function ActivityLogTable({ rows, total }: { rows: ActivityLogRow[]; total: number }) {
  const url = useUrlTableState(ACTIVITY_LOG_TABLE_CONFIG);
  const table = useDataTable({
    data: rows,
    columns: COLUMNS,
    getRowId: (row) => row.id,
    server: { ...url, rowCount: total },
  });
  const waktu = table.table.getColumn("created_at");

  return (
    <DataTable
      table={table}
      label="Log Aktivitas"
      noun="aktivitas"
      canWrite={false}
      searchPlaceholder="Cari aktivitas atau email..."
      toolbar={
        <DateRangeFilter
          label="Rentang tanggal"
          value={(waktu?.getFilterValue() as DateRangeValue | undefined) ?? {}}
          onValueChange={(value) => waktu?.setFilterValue(value.start || value.end ? value : undefined)}
        />
      }
    />
  );
}
