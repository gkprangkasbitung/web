"use client";

import { CheckIcon, RotateCcwIcon, UserXIcon, WrenchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { Badge } from "@/components/ui/badge";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { masalahBaris, type BarisImporRow, type JemaatPilihan } from "@/lib/pemilihan/admin-types";
import { LABEL_KATEGORI, type KategoriImpor } from "@/lib/pemilihan/impor";

import { SelesaikanBarisDialog } from "./selesaikan-baris-dialog";

type StatusBaris = "beres" | "belum" | "dikeluarkan";

const LABEL_STATUS: Record<StatusBaris, string> = { beres: "Beres", belum: "Belum beres", dikeluarkan: "Dikeluarkan" };

function statusBaris(row: BarisImporRow): StatusBaris {
  return row.dikeluarkan ? "dikeluarkan" : row.beres ? "beres" : "belum";
}

const KATEGORI_VARIANT: Record<KategoriImpor, "accent" | "neutral" | "destructive" | "outline"> = {
  cocok: "accent",
  ambigu: "outline",
  tidak_ditemukan: "neutral",
  error: "destructive",
};

type Row = BarisImporRow & { status: StatusBaris; jemaatNama: string | null };

const helper = createDataTableColumnHelper<Row>();

function yaTidak(value: boolean | null, ya: string, tidak: string) {
  if (value === null) return <span className="font-medium text-destructive">?</span>;
  return value ? ya : <span className="text-muted-foreground">{tidak}</span>;
}

function buildColumns(): DataTableColumnDef<Row>[] {
  return [
    helper.accessor("nama", {
      header: "Nama di file",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.nama}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {row.original.nomor ? `No. ${row.original.nomor} · ` : ""}baris {row.original.baris}
            {row.original.domisili ? ` · ${row.original.domisili}` : ""}
          </span>
        </span>
      ),
    }),
    helper.accessor("kelompokWilayah", { header: "Kelompok", meta: { facet: { title: "Kelompok" } } }),
    helper.accessor("kategori", {
      header: "Hasil cocok",
      meta: { facet: { title: "Hasil cocok", formatValue: (value) => LABEL_KATEGORI[value as KategoriImpor] } },
      cell: ({ row }) => <Badge variant={KATEGORI_VARIANT[row.original.kategori]}>{LABEL_KATEGORI[row.original.kategori]}</Badge>,
    }),
    helper.accessor("jemaatNama", {
      header: "Jemaat",
      meta: { search: true },
      cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
    }),
    helper.display({ id: "memilih", header: "Memilih", cell: ({ row }) => yaTidak(row.original.dapatMemilih, "Ya", "Tidak") }),
    helper.display({ id: "dipilih", header: "Dipilih", cell: ({ row }) => yaTidak(row.original.dapatDipilih, "Dapat", "Tidak dapat") }),
    helper.accessor("status", {
      header: "Status",
      meta: { facet: { title: "Status", formatValue: (value) => LABEL_STATUS[value as StatusBaris] } },
      cell: ({ row }) => {
        const masalah = masalahBaris(row.original);
        return (
          <span className="flex flex-col gap-1">
            <Badge variant={row.original.status === "belum" ? "destructive" : row.original.status === "beres" ? "accent" : "neutral"}>
              {LABEL_STATUS[row.original.status]}
            </Badge>
            {masalah.map((m) => (
              <span key={m} className="text-xs text-muted-foreground">
                {m}
              </span>
            ))}
          </span>
        );
      },
    }),
  ];
}

/**
 * The saved import's rows (brief §18.4), filterable by sheet, match result,
 * and status. Each unresolved row is settled through "Selesaikan": pick the
 * jemaat (Ambigu / Tidak ditemukan), correct the ticks (Error validasi),
 * confirm a blank Dapat Memilih, or leave the row out.
 */
export function BarisImporTable({
  pemilihanId,
  rows,
  jemaat,
  canWrite,
}: {
  pemilihanId: string;
  rows: BarisImporRow[];
  jemaat: readonly JemaatPilihan[];
  /** pemilihan:update while draft. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const namaJemaat = useMemo(() => new Map(jemaat.map((j) => [j.id, j.nama])), [jemaat]);
  const data = useMemo<Row[]>(
    () => rows.map((row) => ({ ...row, status: statusBaris(row), jemaatNama: row.jemaatId ? (namaJemaat.get(row.jemaatId) ?? null) : null })),
    [rows, namaJemaat],
  );
  const columns = useMemo(() => buildColumns(), []);
  const belum = data.filter((row) => row.status === "belum").length;
  const table = useDataTable({
    data,
    columns,
    getRowId: (row) => row.id,
    initialState: belum > 0 ? { columnFilters: [{ id: "status", value: ["belum"] }] } : undefined,
  });

  const [target, setTarget] = useState<BarisImporRow | null>(null);
  const [open, setOpen] = useState(false);

  async function patch(row: BarisImporRow, body: Record<string, unknown>, done: string) {
    try {
      await apiFetch(`/api/admin/pemilihan/${pemilihanId}/impor/${row.id}`, { method: "PATCH", body });
      toast.success(done);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <DataTable
        table={table}
        label="Hasil impor peserta"
        noun="baris"
        canWrite={canWrite}
        rowActions={{
          getRowLabel: (row) => row.nama,
          extra: [
            {
              label: (row) => (row.beres ? "Ubah" : "Selesaikan"),
              icon: WrenchIcon,
              onSelect: (row) => {
                setTarget(row);
                setOpen(true);
              },
              write: true,
              hidden: (row) => row.dikeluarkan,
            },
            {
              label: "Konfirmasi tidak dapat memilih",
              icon: CheckIcon,
              onSelect: (row) => patch(row, { dapatMemilih: false }, `"${row.nama}" dikonfirmasi tidak dapat memilih`),
              write: true,
              hidden: (row) => row.dikeluarkan || !row.perluKonfirmasiMemilih,
            },
            {
              label: "Keluarkan dari daftar",
              icon: UserXIcon,
              onSelect: (row) => patch(row, { dikeluarkan: true }, `"${row.nama}" dikeluarkan dari daftar`),
              write: true,
              hidden: (row) => row.dikeluarkan,
            },
            {
              label: "Kembalikan ke daftar",
              icon: RotateCcwIcon,
              onSelect: (row) => patch(row, { dikeluarkan: false }, `"${row.nama}" dikembalikan ke daftar`),
              write: true,
              hidden: (row) => !row.dikeluarkan,
            },
          ],
        }}
      />
      {target && (
        <SelesaikanBarisDialog
          key={target.id}
          pemilihanId={pemilihanId}
          row={target}
          rows={rows}
          jemaat={jemaat}
          open={open}
          onOpenChange={setOpen}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
