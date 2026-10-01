"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
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
import { komisiDeleteDescription, type KomisiListRow } from "@/lib/komisi";
import type { KomisiPersonOption } from "@/lib/komisi-routes";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { KomisiDialog } from "./komisi-dialog";

const helper = createDataTableColumnHelper<KomisiListRow>();

function KomisiThumb({ row }: { row: KomisiListRow }) {
  if (row.foto_path && row.foto_alt) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={situsPhotoUrl(row.foto_path)} alt={row.foto_alt} className="size-9 rounded-full object-cover" />;
  }
  return <InitialsAvatar name={row.nama} className="size-9" />;
}

/** Swaps `id` with its neighbour in `ids`, or returns null at a boundary. */
function moveAdjacent(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const temp = next[index]!;
  next[index] = next[target]!;
  next[target] = temp;
  return next;
}

function buildColumns(): DataTableColumnDef<KomisiListRow>[] {
  return [
    helper.display({
      id: "foto",
      header: "Foto",
      cell: ({ row }) => <KomisiThumb row={row.original} />,
    }),
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
      cell: ({ row }) => (
        <Link href={`/admin/komisi/${row.original.id}`} className="hover:underline">
          {row.original.nama}
        </Link>
      ),
    }),
    helper.accessor("pembinaNama", {
      header: "Pembina",
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("periode", {
      header: "Periode",
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("jumlahAnggota", {
      header: "Jumlah Anggota",
      enableSorting: true,
      meta: { numeric: true },
    }),
    helper.accessor("tampil", {
      id: "tampil",
      header: "Tampil",
      meta: { facet: { formatValue: (value) => (value ? "Tampil" : "Disembunyikan") } },
      cell: ({ getValue }) => <Badge variant={getValue() ? "accent" : "neutral"}>{getValue() ? "Tampil" : "Disembunyikan"}</Badge>,
    }),
  ];
}

/** `/admin/komisi` (brief §9.2, §14.8): DataTable with an atomically-reordered "tampil" order. */
export function KomisiManager({
  rows,
  pembinaOptions,
  canCreate,
  canWrite,
  canDelete,
}: {
  rows: KomisiListRow[];
  pembinaOptions: readonly KomisiPersonOption[];
  /** situs:create: "Tambah Komisi". */
  canCreate: boolean;
  /** situs:update: editing, reordering. */
  canWrite: boolean;
  /** situs:delete. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  // No initial sort: rows arrive in the admin's own "tampil" order.
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [dialogRow, setDialogRow] = useState<KomisiListRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: KomisiListRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function move(row: KomisiListRow, direction: "up" | "down") {
    const ids = rows.map((r) => r.id);
    const next = moveAdjacent(ids, row.id, direction);
    if (!next) return;
    try {
      await apiFetch("/api/admin/komisi/reorder", { method: "POST", body: { ids: next } });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(row: KomisiListRow) {
    try {
      await apiFetch(`/api/admin/komisi/${row.id}`, { method: "DELETE" });
      toast.success("Komisi dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canCreate ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Tambah Komisi
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Komisi"
        description={
          <>
            Kelola komisi jemaat. Lihat{" "}
            <Link href="/admin/komisi/jabatan" className="underline underline-offset-4 hover:text-foreground">
              master jabatan
            </Link>
            .
          </>
        }
        actions={addAction}
      />

      <DataTable
        table={table}
        label="Komisi"
        noun="komisi"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => openDialog(row) },
          extra: [
            { label: "Naik", icon: ArrowUpIcon, onSelect: (row) => move(row, "up"), write: true },
            { label: "Turun", icon: ArrowDownIcon, onSelect: (row) => move(row, "down"), write: true },
          ],
          delete: {
            title: (row) => `Hapus "${row.nama}"?`,
            description: (row) => komisiDeleteDescription(row.jumlahAnggota),
            onConfirm: remove,
            hidden: () => !canDelete,
          },
        }}
      />

      <KomisiDialog
        key={dialogRow?.id ?? "new"}
        row={dialogRow}
        pembinaOptions={pembinaOptions}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        readOnly={dialogRow ? !canWrite : !canCreate}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
