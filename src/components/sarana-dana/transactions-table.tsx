"use client";

import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong, type IsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { formatSignedJumlah, TIPE_LABELS, type TransactionTipe } from "@/lib/sarana-dana";
import type { TransactionRow } from "@/lib/sarana-dana-routes";

import { TransactionDialog } from "./transaction-dialog";

const helper = createDataTableColumnHelper<TransactionRow>();

function dash(value: string | null): React.ReactNode {
  return value || <span className="text-muted-foreground">—</span>;
}

function buildColumns(showJemaat: boolean): DataTableColumnDef<TransactionRow>[] {
  const columns: DataTableColumnDef<TransactionRow>[] = [
    helper.accessor("tanggal", {
      header: "Tanggal",
      enableSorting: true,
      meta: { numeric: true },
      cell: ({ getValue }) => formatDateLong(getValue()),
    }),
    helper.accessor("tipe", {
      id: "tipe",
      header: "Tipe",
      enableSorting: true,
      cell: ({ getValue }) => {
        const tipe = getValue() as TransactionTipe;
        return <Badge variant={tipe === "masuk" ? "accent" : "destructive"}>{TIPE_LABELS[tipe]}</Badge>;
      },
    }),
    helper.accessor("jumlah", {
      id: "jumlah",
      header: "Jumlah",
      enableSorting: true,
      meta: { numeric: true },
      // "+"/"−" prefix is the primary indicator; color is only a secondary cue (brief §9.7).
      cell: ({ row }) => (
        <span className={row.original.tipe === "keluar" ? "text-destructive" : undefined}>
          {formatSignedJumlah(row.original.jumlah, row.original.tipe)}
        </span>
      ),
    }),
  ];
  if (showJemaat) {
    columns.push(
      helper.accessor("jemaatNama", {
        id: "jemaatNama",
        header: "Jemaat",
        meta: { search: true },
        cell: ({ getValue }) => dash(getValue()),
      }),
    );
  }
  columns.push(
    helper.accessor("keterangan", {
      header: "Keterangan",
      enableSorting: true,
      meta: { search: true },
      cell: ({ getValue }) => dash(getValue()),
    }),
  );
  return columns;
}

export type TransactionsTableProps = {
  rows: TransactionRow[];
  /** The item's `key` (URL segment). */
  itemKey: string;
  isPersembahanBulanan: boolean;
  peopleOptions: readonly PersonOptionRow[];
  canWrite: boolean;
  onChanged: () => void;
  /** Inclusive bounds passed through to the add/edit dialog; stage 9 fixes these to the warta's finance week. */
  minDate?: IsoDate;
  maxDate?: IsoDate;
  /** Extra toolbar controls; the ledger page passes its server-side DateRangeFilter here. Omit for a fixed-range view (stage 9). */
  toolbar?: React.ReactNode;
};

/**
 * The Sarana & Dana transactions table (brief §9.7): reusable as-is inside a
 * warta's finance tab (stage 9), which passes already range-filtered `rows`
 * and no `toolbar`.
 */
export function TransactionsTable({
  rows,
  itemKey,
  isPersembahanBulanan,
  peopleOptions,
  canWrite,
  onChanged,
  minDate,
  maxDate,
  toolbar,
}: TransactionsTableProps) {
  const columns = useMemo(() => buildColumns(isPersembahanBulanan), [isPersembahanBulanan]);
  const table = useDataTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: "tanggal", desc: true }] },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editRow, setEditRow] = useState<TransactionRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function remove(row: TransactionRow) {
    try {
      await apiFetch(`/api/admin/sarana-dana/${itemKey}/transaksi/${row.id}`, { method: "DELETE" });
      toast.success("Transaksi dihapus");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canWrite ? (
    <Button
      onClick={() => {
        setAddKey((key) => key + 1);
        setAddOpen(true);
      }}
    >
      <PlusIcon aria-hidden />
      Tambah Transaksi
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        table={table}
        label="Transaksi"
        noun="transaksi"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={
          <>
            {toolbar}
            {addAction}
          </>
        }
        rowActions={{
          getRowLabel: (row) => `${formatRupiah(row.jumlah)} pada ${formatDateLong(row.tanggal)}`,
          edit: {
            onSelect: (row) => {
              setEditRow(row);
              setEditOpen(true);
            },
          },
          delete: {
            title: (row) => `Hapus transaksi ${formatRupiah(row.jumlah)} pada ${formatDateLong(row.tanggal)}?`,
            onConfirm: remove,
          },
        }}
      />

      <TransactionDialog
        key={addKey}
        open={addOpen}
        onOpenChange={setAddOpen}
        itemKey={itemKey}
        isPersembahanBulanan={isPersembahanBulanan}
        row={null}
        peopleOptions={peopleOptions}
        readOnly={!canWrite}
        minDate={minDate}
        maxDate={maxDate}
        onSaved={onChanged}
      />
      <TransactionDialog
        key={editRow?.id ?? "none"}
        open={editOpen}
        onOpenChange={setEditOpen}
        itemKey={itemKey}
        isPersembahanBulanan={isPersembahanBulanan}
        row={editRow}
        peopleOptions={peopleOptions}
        readOnly={!canWrite}
        minDate={minDate}
        maxDate={maxDate}
        onSaved={onChanged}
      />
    </div>
  );
}
