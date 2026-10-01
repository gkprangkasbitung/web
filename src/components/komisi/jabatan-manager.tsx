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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JabatanKomisiRow } from "@/lib/komisi";

import { JabatanDialog } from "./jabatan-dialog";

const helper = createDataTableColumnHelper<JabatanKomisiRow>();

function buildColumns(): DataTableColumnDef<JabatanKomisiRow>[] {
  return [
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
    }),
    helper.accessor("tunggal", {
      id: "tunggal",
      header: "Tunggal",
      meta: { facet: { formatValue: (value) => (value ? "Tunggal" : "Boleh lebih dari satu") } },
      cell: ({ getValue }) => <Badge variant={getValue() ? "accent" : "neutral"}>{getValue() ? "Tunggal" : "Boleh lebih dari satu"}</Badge>,
    }),
    helper.accessor("sort_order", {
      header: "Urutan",
      enableSorting: true,
      meta: { numeric: true },
    }),
  ];
}

/** `/admin/komisi/jabatan`: master jabatan (brief §14.8). No manual reordering; the seeded order rarely changes. */
export function JabatanManager({
  rows,
  canCreate,
  canWrite,
  canDelete,
}: {
  rows: JabatanKomisiRow[];
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [dialogRow, setDialogRow] = useState<JabatanKomisiRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: JabatanKomisiRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function remove(row: JabatanKomisiRow) {
    try {
      await apiFetch(`/api/admin/komisi/jabatan/${row.id}`, { method: "DELETE" });
      toast.success("Jabatan dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canCreate ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Tambah Jabatan
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/komisi" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar komisi
      </Link>

      <PageHeader title="Jabatan Komisi" description="Master jabatan yang bisa dipilih saat menambah anggota komisi." actions={addAction} />

      <DataTable
        table={table}
        label="Jabatan Komisi"
        noun="jabatan"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => openDialog(row) },
          delete: {
            title: (row) => `Hapus jabatan "${row.nama}"?`,
            description: () => "Jabatan yang masih dipakai oleh anggota komisi tidak bisa dihapus.",
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />

      <JabatanDialog
        key={dialogRow?.id ?? "new"}
        row={dialogRow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        readOnly={dialogRow ? !canWrite : !canCreate}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
