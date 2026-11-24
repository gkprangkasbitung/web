"use client";

import { BarChart3Icon, EyeIcon, HandHelpingIcon, LockIcon, MegaphoneIcon, PencilIcon, PlayIcon, PlusIcon } from "lucide-react";
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
import type { PemilihanRow, StatusAksi } from "@/lib/pemilihan/admin-types";
import { alasanBelumBisaDibuka, formatJadwal, formatPartisipasi } from "@/lib/pemilihan/tampilan";
import { PEMILIHAN_STATUS_LABELS } from "@/lib/pemilihan/types";

import { PemilihanDialog } from "./pemilihan-dialog";
import { PemilihanStatusBadge } from "./pemilihan-status-badge";
import { StatusConfirmDialog } from "./status-confirm-dialog";

const helper = createDataTableColumnHelper<PemilihanRow>();

function buildColumns(): DataTableColumnDef<PemilihanRow>[] {
  return [
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
      cell: ({ row }) => (
        <Link href={`/admin/pemilihan/${row.original.id}`} className="hover:underline">
          {row.original.nama}
        </Link>
      ),
    }),
    helper.accessor("periode", {
      header: "Periode",
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("status", {
      header: "Status",
      meta: { facet: { formatValue: (value) => PEMILIHAN_STATUS_LABELS[value as PemilihanRow["status"]] ?? String(value) } },
      cell: ({ getValue }) => <PemilihanStatusBadge status={getValue()} />,
    }),
    helper.accessor((row) => row.dibukaPada ?? "", {
      id: "jadwal",
      header: "Jadwal",
      enableSorting: true,
      cell: ({ row }) => <span className="text-sm">{formatJadwal(row.original.dibukaPada, row.original.ditutupPada)}</span>,
    }),
    helper.accessor("persen", {
      header: "Partisipasi",
      enableSorting: true,
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.status === "draft" ? (
          <span className="text-muted-foreground">{row.original.totalPemilih} pemilih</span>
        ) : (
          formatPartisipasi(row.original.sudahMemilih, row.original.totalPemilih, row.original.persen)
        ),
    }),
  ];
}

/** `/admin/pemilihan` (brief §18.4): the elections, with create/edit (draft only) and Buka / Tutup / Umumkan. */
export function PemilihanManager({
  rows,
  canCreate,
  canUpdate,
  canDelete,
  canBantu,
}: {
  rows: PemilihanRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canBantu: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(), []);
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [dialogRow, setDialogRow] = useState<PemilihanRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ row: PemilihanRow; aksi: StatusAksi } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  function openDialog(row: PemilihanRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  function openStatus(row: PemilihanRow, aksi: StatusAksi) {
    if (aksi === "buka") {
      const alasan = alasanBelumBisaDibuka(row);
      if (alasan) return void toast.error(alasan);
    }
    setStatusTarget({ row, aksi });
    setStatusOpen(true);
  }

  async function remove(row: PemilihanRow) {
    try {
      await apiFetch(`/api/admin/pemilihan/${row.id}`, { method: "DELETE" });
      toast.success("Pemilihan dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canCreate ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      Buat Pemilihan
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pemilihan" description="Pemilihan Majelis Jemaat: peserta, pemungutan suara, dan hasil." actions={addAction} />

      <DataTable
        table={table}
        label="Pemilihan"
        noun="pemilihan"
        canWrite={canUpdate}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          extra: [
            { label: "Detail", icon: EyeIcon, href: (row) => `/admin/pemilihan/${row.id}` },
            { label: "Ubah", icon: PencilIcon, onSelect: (row) => openDialog(row), write: true, hidden: (row) => row.status !== "draft" },
            { label: "Hasil", icon: BarChart3Icon, href: (row) => `/admin/pemilihan/${row.id}/hasil`, hidden: (row) => row.status === "draft" },
            {
              label: "Bantu Memilih",
              icon: HandHelpingIcon,
              href: (row) => `/admin/pemilihan/${row.id}/bantu`,
              hidden: (row) => !canBantu || row.status !== "dibuka",
            },
            { label: "Buka Pemilihan", icon: PlayIcon, onSelect: (row) => openStatus(row, "buka"), write: true, hidden: (row) => row.status !== "draft" },
            { label: "Tutup Pemilihan", icon: LockIcon, onSelect: (row) => openStatus(row, "tutup"), write: true, hidden: (row) => row.status !== "dibuka" },
            {
              label: "Umumkan Hasil",
              icon: MegaphoneIcon,
              onSelect: (row) => openStatus(row, "umumkan"),
              write: true,
              hidden: (row) => row.status !== "ditutup",
            },
          ],
          delete: {
            title: (row) => `Hapus pemilihan "${row.nama}"?`,
            description: () => "Pemilihan draft ini dan daftar pesertanya akan dihapus. Tindakan ini tidak bisa dibatalkan.",
            onConfirm: remove,
            hidden: (row) => !canDelete || row.status !== "draft",
          },
        }}
      />

      <PemilihanDialog
        key={dialogRow?.id ?? "new"}
        row={dialogRow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(id) => {
          if (dialogRow) router.refresh();
          else router.push(`/admin/pemilihan/${id}`);
        }}
      />

      {statusTarget && (
        <StatusConfirmDialog
          row={statusTarget.row}
          aksi={statusTarget.aksi}
          open={statusOpen}
          onOpenChange={setStatusOpen}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}
