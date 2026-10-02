"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  PENDETA_DELETE_DESCRIPTION,
  PENDETA_DELETE_SAMBUTAN_NOTE,
  PENDETA_STATUS_LABELS,
  pendetaPeriode,
  pendetaStatus,
  type PendetaRow,
  type PendetaStatus,
} from "@/lib/pendeta";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { PendetaDialog } from "./pendeta-dialog";

const helper = createDataTableColumnHelper<PendetaRow>();

function PendetaThumb({ row }: { row: PendetaRow }) {
  if (row.foto_path && row.foto_alt) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={situsPhotoUrl(row.foto_path)} alt={row.foto_alt} className="size-9 rounded-full object-cover" />;
  }
  return <InitialsAvatar name={row.nama} className="size-9" />;
}

function buildColumns(): DataTableColumnDef<PendetaRow>[] {
  return [
    helper.display({
      id: "foto",
      header: "Foto",
      cell: ({ row }) => <PendetaThumb row={row.original} />,
    }),
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
    }),
    helper.accessor("peran", {
      header: "Peran",
      enableSorting: true,
      meta: { search: true },
    }),
    helper.display({
      id: "periode",
      header: "Periode",
      cell: ({ row }) => pendetaPeriode(row.original),
    }),
    helper.accessor((row): PendetaStatus => pendetaStatus(row), {
      id: "status",
      header: "Status",
      meta: {
        facet: {
          title: "Status",
          formatValue: (value) => PENDETA_STATUS_LABELS[value as keyof typeof PENDETA_STATUS_LABELS] ?? value,
        },
      },
      cell: ({ getValue }) => {
        const status = getValue() as PendetaStatus;
        return <Badge variant={status === "melayani" ? "accent" : "neutral"}>{PENDETA_STATUS_LABELS[status]}</Badge>;
      },
    }),
  ];
}

/** `/admin/pendeta` (brief §9.2, §14.7): DataTable in the fixed default order (no manual reordering). */
export function PendetaManager({
  rows,
  sambutanPendetaId,
  canWrite,
  canDelete,
}: {
  rows: PendetaRow[];
  sambutanPendetaId: string | null;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  // No initial sort: rows already arrive in the brief's default order.
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [dialogRow, setDialogRow] = useState<PendetaRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: PendetaRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function remove(row: PendetaRow) {
    try {
      await apiFetch(`/api/admin/pendeta/${row.id}`, { method: "DELETE" });
      toast.success("Pendeta dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canWrite ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Tambah Pendeta
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pendeta" actions={addAction} />

      <DataTable
        table={table}
        label="Pendeta"
        noun="pendeta"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => openDialog(row) },
          delete: {
            title: (row) => `Hapus "${row.nama}"?`,
            description: (row) =>
              row.id === sambutanPendetaId
                ? `${PENDETA_DELETE_SAMBUTAN_NOTE} ${PENDETA_DELETE_DESCRIPTION}`
                : PENDETA_DELETE_DESCRIPTION,
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />

      <PendetaDialog
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
