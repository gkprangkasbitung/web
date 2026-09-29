"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { formatRupiah } from "@/lib/format";
import type { SaranaDanaItemRow } from "@/lib/sarana-dana-routes";

import { KeteranganDialog } from "./keterangan-dialog";

const helper = createDataTableColumnHelper<SaranaDanaItemRow>();

const columns = [
  helper.accessor("name", {
    header: "Nama",
    enableSorting: true,
    meta: { search: true, className: "font-medium" },
  }),
  helper.accessor("saldo", {
    id: "saldo",
    header: "Saldo Saat Ini",
    enableSorting: true,
    meta: { numeric: true },
    cell: ({ getValue }) => formatRupiah(getValue()),
  }),
  helper.accessor("keterangan", {
    header: "Keterangan",
    meta: { search: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
];

/** `/admin/sarana-dana` (brief §9.7): the 3 fixed items. No add/delete — only Edit (Keterangan) and Lihat Transaksi. */
export function SaranaDanaOverviewManager({ items, canWrite }: { items: SaranaDanaItemRow[]; canWrite: boolean }) {
  const router = useRouter();
  const table = useDataTable({ data: items, columns, getRowId: (row) => row.id });

  const [editRow, setEditRow] = useState<SaranaDanaItemRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sarana & Dana" />

      <DataTable
        table={table}
        label="Sarana & Dana"
        noun="item"
        canWrite={canWrite}
        rowActions={{
          getRowLabel: (row) => row.name,
          edit: {
            onSelect: (row) => {
              setEditRow(row);
              setEditOpen(true);
            },
          },
          extra: [{ label: "Lihat Transaksi", href: (row) => `/admin/sarana-dana/${row.key}` }],
        }}
      />

      <KeteranganDialog
        key={editRow?.id ?? "none"}
        row={editRow}
        open={editOpen}
        onOpenChange={setEditOpen}
        readOnly={!canWrite}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
