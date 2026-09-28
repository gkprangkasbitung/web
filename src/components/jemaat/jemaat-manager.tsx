"use client";

import { DownloadIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import type { JemaatOverview, JemaatListRow } from "@/lib/jemaat-routes";
import { STATUS_KEANGGOTAAN_BADGE, STATUS_KEANGGOTAAN_LABELS, type StatusKeanggotaan } from "@/lib/jemaat";

import { emptyJemaatProfile, JemaatProfileForm, type JemaatProfileValues } from "./jemaat-profile-form";

const helper = createDataTableColumnHelper<JemaatListRow>();

const columns = [
  helper.accessor("nomorAnggota", {
    header: "No. Anggota",
    meta: { mono: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("nama", {
    header: "Nama",
    enableSorting: true,
    meta: { search: true, className: "font-medium" },
    cell: ({ row }) => (
      <Link href={`/admin/jemaat/${row.original.id}`} className="flex items-center gap-2 hover:underline">
        <InitialsAvatar name={row.original.nama} />
        {row.original.nama}
      </Link>
    ),
  }),
  helper.accessor("keluargaNama", {
    header: "Keluarga",
    meta: { search: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("wilayahNama", {
    id: "wilayahNama",
    header: "Wilayah",
    meta: { facet: { emptyLabel: "Tanpa Wilayah" } },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("statusKeanggotaan", {
    id: "statusKeanggotaan",
    header: "Status",
    meta: {
      facet: {
        emptyLabel: "Tanpa Status",
        formatValue: (value) => STATUS_KEANGGOTAAN_LABELS[value as StatusKeanggotaan] ?? value,
      },
    },
    cell: ({ getValue }) => {
      const status = getValue();
      if (!status) return <span className="text-muted-foreground">—</span>;
      return <Badge variant={STATUS_KEANGGOTAAN_BADGE[status]}>{STATUS_KEANGGOTAAN_LABELS[status]}</Badge>;
    },
  }),
  helper.accessor("noHp", {
    id: "noHp",
    header: "Kontak",
    meta: { search: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
];

function toProfilePayload(values: JemaatProfileValues) {
  return {
    nama: values.nama,
    nomorAnggota: values.nomorAnggota || null,
    jenisKelamin: values.jenisKelamin,
    statusKeanggotaan: values.statusKeanggotaan,
    wilayahId: values.wilayahId,
    pekerjaan: values.pekerjaan || null,
    alamat: values.alamat || null,
    noHp: values.noHp || null,
    tanggalLahir: values.tanggalLahir,
    tanggalMasuk: values.tanggalMasuk,
    keluargaNama: values.keluargaNama || null,
    hubunganKeluarga: values.hubunganKeluarga,
    labelIds: values.labelIds,
  };
}

function exportFilename(): string {
  return `data-jemaat-${today()}.csv`;
}

export function JemaatManager({ overview, canWrite }: { overview: JemaatOverview; canWrite: boolean }) {
  const router = useRouter();
  const table = useDataTable({ data: overview.rows, columns, getRowId: (row) => row.id });

  const [addOpen, setAddOpen] = useState(false);
  const [values, setValues] = useState<JemaatProfileValues>(emptyJemaatProfile());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(row: JemaatListRow) {
    try {
      await apiFetch(`/api/admin/jemaat/${row.id}`, { method: "DELETE" });
      toast.success(`${row.nama} dihapus`);
      router.refresh();
    } catch (removeError) {
      toast.error(errorMessage(removeError));
      throw removeError;
    }
  }

  async function submitAdd() {
    if (!values.nama.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/jemaat", { method: "POST", body: toProfilePayload(values) });
      toast.success("Jemaat ditambahkan");
      setAddOpen(false);
      setValues(emptyJemaatProfile());
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  function exportCsv() {
    const header = ["No. Anggota", "Nama", "Keluarga", "Wilayah", "Status", "Kontak"];
    const rows = table.filteredRows.map((row) => [
      row.nomorAnggota ?? "",
      row.nama,
      row.keluargaNama ?? "",
      row.wilayahNama ?? "",
      row.statusKeanggotaan ? STATUS_KEANGGOTAAN_LABELS[row.statusKeanggotaan] : "",
      row.noHp ?? "",
    ]);
    downloadCsv(exportFilename(), toCsv(header, rows));
  }

  const addAction = canWrite ? (
    <Button
      onClick={() => {
        setValues(emptyJemaatProfile());
        setError(null);
        setAddOpen(true);
      }}
    >
      <PlusIcon aria-hidden />
      Tambah Jemaat
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data Jemaat"
        description={`${overview.jumlahJemaat} jiwa · ${overview.jumlahKeluarga} keluarga`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <DownloadIcon aria-hidden />
              Ekspor CSV
            </Button>
            {addAction}
          </>
        }
      />

      <DataTable
        table={table}
        label="Data Jemaat"
        noun="jemaat"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { href: (row) => `/admin/jemaat/${row.id}` },
          delete: {
            title: (row) => `Hapus ${row.nama}?`,
            onConfirm: remove,
          },
        }}
      />

      <Dialog open={addOpen} onOpenChange={(open) => !pending && setAddOpen(open)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Tambah Jemaat</DialogTitle>
          </DialogHeader>
          <JemaatProfileForm
            formId="tambah-jemaat"
            values={values}
            onValuesChange={setValues}
            wilayahOptions={overview.wilayahOptions}
            keluargaSuggestions={overview.keluargaSuggestions}
            labelOptions={overview.labelOptions}
            disabled={pending}
            onSubmit={submitAdd}
            errorId="tambah-jemaat-error"
          />
          {error && (
            <p id="tambah-jemaat-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
            <Button type="submit" form="tambah-jemaat" disabled={pending} focusableWhenDisabled>
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
