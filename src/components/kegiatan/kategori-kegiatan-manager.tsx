"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { KATEGORI_KEGIATAN_DELETE_DESCRIPTION, type KategoriKegiatanRow } from "@/lib/kegiatan";

import { KategoriBadge } from "./kategori-badge";
import { KategoriKegiatanDialog } from "./kategori-kegiatan-dialog";

type Row = KategoriKegiatanRow & { jumlahKegiatan: number };

const helper = createDataTableColumnHelper<Row>();

function buildColumns(): DataTableColumnDef<Row>[] {
  return [
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true },
      cell: ({ row }) => <KategoriBadge nama={row.original.nama} warna={row.original.warna} />,
    }),
    helper.accessor("sort_order", {
      header: "Urutan",
      enableSorting: true,
      meta: { numeric: true },
    }),
    helper.accessor("jumlahKegiatan", {
      id: "jumlahKegiatan",
      header: "Jumlah Kegiatan",
      meta: { numeric: true },
    }),
  ];
}

/** `/admin/kegiatan/kategori` (brief §14.4). No manual reorder — same shape as `jabatan_komisi`. */
export function KategoriKegiatanManager({
  rows,
  canWrite,
  canDelete,
}: {
  rows: Row[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [dialogRow, setDialogRow] = useState<KategoriKegiatanRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: KategoriKegiatanRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function remove(row: Row) {
    try {
      await apiFetch(`/api/admin/kegiatan/kategori/${row.id}`, { method: "DELETE" });
      toast.success("Kategori dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canWrite ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Tambah Kategori
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/kegiatan" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar kegiatan
      </Link>

      <PageHeader title="Kategori Kegiatan" description="Kategori yang dipilih saat menambah kegiatan, dengan warna dari palet tetap." actions={addAction} />

      <DataTable
        table={table}
        label="Kategori Kegiatan"
        noun="kategori"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => openDialog(row) },
          delete: {
            title: (row) => `Hapus kategori "${row.nama}"?`,
            description: () => KATEGORI_KEGIATAN_DELETE_DESCRIPTION,
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />

      <KategoriKegiatanDialog
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
