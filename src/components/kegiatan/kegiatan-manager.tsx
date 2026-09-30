"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong } from "@/lib/dates";
import { KEGIATAN_DELETE_DESCRIPTION, KEGIATAN_STATUS_LABELS, type KegiatanRow, type KegiatanStatus } from "@/lib/kegiatan";

import { KegiatanDialog } from "./kegiatan-dialog";
import { KegiatanStatusBadge } from "./kegiatan-status-badge";

const helper = createDataTableColumnHelper<KegiatanRow>();

function buildColumns(): DataTableColumnDef<KegiatanRow>[] {
  return [
    helper.accessor("judul", {
      header: "Judul",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
    }),
    helper.accessor("tanggal", {
      id: "tanggal",
      header: "Tanggal",
      enableSorting: true,
      filterFn: "inDateRange",
      meta: { numeric: true },
      cell: ({ getValue }) => formatDateLong(getValue()),
    }),
    helper.accessor("tempat", {
      header: "Tempat",
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("status", {
      id: "status",
      header: "Status",
      meta: { facet: { formatValue: (value) => KEGIATAN_STATUS_LABELS[value as KegiatanStatus] ?? value } },
      cell: ({ getValue }) => <KegiatanStatusBadge status={getValue()} />,
    }),
  ];
}

/** `/admin/kegiatan` (brief §9.2, §14.4): DataTable, Status facet, date range on tanggal, Terbitkan/Tarik ke Draft. */
export function KegiatanManager({
  rows,
  canWrite,
  canDelete,
}: {
  rows: KegiatanRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  // No initial sort: rows arrive newest tanggal first.
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });
  const tanggalColumn = table.table.getColumn("tanggal");

  const [dialogRow, setDialogRow] = useState<KegiatanRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: KegiatanRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function togglePublish(row: KegiatanRow) {
    const next = row.status === "published" ? "draft" : "published";
    try {
      await apiFetch(`/api/admin/kegiatan/${row.id}/status`, { method: "PATCH", body: { status: next } });
      toast.success(next === "published" ? "Kegiatan diterbitkan" : "Kegiatan ditarik ke draft");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(row: KegiatanRow) {
    try {
      await apiFetch(`/api/admin/kegiatan/${row.id}`, { method: "DELETE" });
      toast.success("Kegiatan dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canWrite ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Tambah Kegiatan
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kegiatan" actions={addAction} />

      <DataTable
        table={table}
        label="Kegiatan"
        noun="kegiatan"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={
          <DateRangeFilter
            label="Tanggal"
            value={(tanggalColumn?.getFilterValue() as DateRangeValue | undefined) ?? {}}
            onValueChange={(value) => tanggalColumn?.setFilterValue(value.start || value.end ? value : undefined)}
          />
        }
        rowActions={{
          getRowLabel: (row) => row.judul,
          edit: { onSelect: (row) => openDialog(row) },
          extra: [
            {
              label: (row) => (row.status === "published" ? "Tarik ke Draft" : "Terbitkan"),
              onSelect: togglePublish,
              write: true,
            },
          ],
          delete: {
            title: (row) => `Hapus "${row.judul}"?`,
            description: () => KEGIATAN_DELETE_DESCRIPTION,
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />

      <KegiatanDialog
        key={dialogRow?.id ?? "new"}
        row={dialogRow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        readOnly={!canWrite}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
