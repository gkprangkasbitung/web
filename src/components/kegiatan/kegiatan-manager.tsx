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
import {
  formatTanggalRange,
  KEGIATAN_DELETE_DESCRIPTION,
  KEGIATAN_STATUS_LABELS,
  type KategoriKegiatanRow,
  type KegiatanRow,
  type KegiatanStatus,
} from "@/lib/kegiatan";

import { KategoriBadge } from "./kategori-badge";
import { KegiatanDialog } from "./kegiatan-dialog";
import { KegiatanStatusBadge } from "./kegiatan-status-badge";

const helper = createDataTableColumnHelper<KegiatanRow>();

function buildColumns(kategoriById: Map<string, KategoriKegiatanRow>): DataTableColumnDef<KegiatanRow>[] {
  return [
    helper.accessor("judul", {
      header: "Judul",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
    }),
    helper.accessor("kategori_id", {
      id: "kategori_id",
      header: "Kategori",
      meta: {
        facet: { title: "Kategori", formatValue: (value) => kategoriById.get(value as string)?.nama ?? value },
      },
      cell: ({ getValue }) => {
        const kategori = kategoriById.get(getValue());
        return kategori ? <KategoriBadge nama={kategori.nama} warna={kategori.warna} /> : "—";
      },
    }),
    helper.accessor("tanggal_mulai", {
      id: "tanggal_mulai",
      header: "Tanggal",
      enableSorting: true,
      meta: { numeric: true },
      cell: ({ row }) => formatTanggalRange(row.original.tanggal_mulai, row.original.tanggal_selesai),
    }),
    helper.accessor("status", {
      id: "status",
      header: "Status",
      meta: { facet: { title: "Status", formatValue: (value) => KEGIATAN_STATUS_LABELS[value as KegiatanStatus] ?? value } },
      cell: ({ getValue }) => <KegiatanStatusBadge status={getValue()} />,
    }),
  ];
}

/** `/admin/kegiatan` (brief §9.2, §14.4): DataTable, Kategori + Status facets, Terbitkan/Tarik ke Draft. */
export function KegiatanManager({
  rows,
  kategoriOptions,
  komisiOptions,
  canWrite,
  canDelete,
}: {
  rows: KegiatanRow[];
  kategoriOptions: KategoriKegiatanRow[];
  komisiOptions: { id: string; nama: string }[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const kategoriById = useMemo(() => new Map(kategoriOptions.map((row) => [row.id, row])), [kategoriOptions]);
  const columns = useMemo(() => buildColumns(kategoriById), [kategoriById]);
  // No initial sort: rows arrive newest tanggal_mulai first.
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

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
      <PageHeader
        title="Kegiatan"
        description={
          <>
            Kelola{" "}
            <Link href="/admin/kegiatan/kategori" className="underline underline-offset-4 hover:text-foreground">
              kategori kegiatan
            </Link>
            .
          </>
        }
        actions={addAction}
      />

      <DataTable
        table={table}
        label="Kegiatan"
        noun="kegiatan"
        canWrite={canWrite}
        addAction={addAction}
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
        kategoriOptions={kategoriOptions}
        komisiOptions={komisiOptions}
        readOnly={!canWrite}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
