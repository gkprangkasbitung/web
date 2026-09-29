"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong } from "@/lib/dates";
import { WARTA_DELETE_DESCRIPTION, WARTA_STATUS_LABELS, type WartaListRow, type WartaStatus } from "@/lib/warta";

import { WartaStatusBadge } from "./warta-status-badge";

const helper = createDataTableColumnHelper<WartaListRow>();

function buildColumns(): DataTableColumnDef<WartaListRow>[] {
  return [
    helper.accessor("tanggalKebaktian", {
      id: "tanggal",
      header: "Tanggal",
      enableSorting: true,
      filterFn: "inDateRange",
      meta: { numeric: true },
      cell: ({ getValue }) => formatDateLong(getValue()),
    }),
    helper.accessor("judulKebaktian", {
      id: "judul",
      header: "Judul",
      enableSorting: true,
      meta: { search: true },
    }),
    helper.accessor("status", {
      id: "status",
      header: "Status",
      meta: { facet: { formatValue: (value) => WARTA_STATUS_LABELS[value as WartaStatus] ?? value } },
      cell: ({ getValue }) => <WartaStatusBadge status={getValue()} />,
    }),
  ];
}

/** `/admin/warta` (brief §9.4): newest first (§12.7), Status facet, date range on tanggal kebaktian. */
export function WartaListManager({
  rows,
  canWrite,
  canCreate,
  canDelete,
}: {
  rows: WartaListRow[];
  canWrite: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  // No initial sort: rows arrive newest tanggal kebaktian first.
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });
  const tanggalColumn = table.table.getColumn("tanggal");

  async function remove(row: WartaListRow) {
    try {
      await apiFetch(`/api/admin/warta/${row.id}`, { method: "DELETE" });
      toast.success("Warta dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canCreate ? (
    <Link href="/admin/warta/new" className={buttonVariants()}>
      <PlusIcon aria-hidden />
      Buat Warta Baru
    </Link>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Warta" description="Warta jemaat mingguan, terbaru di atas." actions={addAction} />

      <DataTable
        table={table}
        label="Warta"
        noun="warta"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={
          <DateRangeFilter
            label="Tanggal kebaktian"
            value={(tanggalColumn?.getFilterValue() as DateRangeValue | undefined) ?? {}}
            onValueChange={(value) => tanggalColumn?.setFilterValue(value.start || value.end ? value : undefined)}
          />
        }
        rowActions={{
          getRowLabel: (row) => row.judulKebaktian,
          edit: { href: (row) => `/admin/warta/${row.id}` },
          delete: {
            title: (row) => `Hapus "${row.judulKebaktian}"?`,
            description: () => WARTA_DELETE_DESCRIPTION,
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />
    </div>
  );
}
