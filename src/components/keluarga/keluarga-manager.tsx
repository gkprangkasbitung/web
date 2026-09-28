"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { KeluargaListRow } from "@/lib/keluarga-routes";

const helper = createDataTableColumnHelper<KeluargaListRow>();

const columns = [
  helper.accessor("nama", {
    header: "Nama Keluarga",
    enableSorting: true,
    meta: { search: true, className: "font-medium" },
    cell: ({ row }) => (
      <Link href={`/admin/keluarga/${row.original.id}`} className="hover:underline">
        {row.original.nama}
      </Link>
    ),
  }),
  helper.accessor("jumlahAnggota", {
    header: "Jumlah Anggota",
    enableSorting: true,
    meta: { numeric: true },
  }),
  helper.accessor("anggota", {
    header: "Anggota",
    meta: { search: true },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
];

function deleteConsequence(row: KeluargaListRow): string {
  if (row.jumlahAnggota === 0) return "Tindakan ini tidak bisa dibatalkan.";
  return "Anggota yang masih tercatat di keluarga ini akan dilepas (tidak ikut terhapus), dan hubungan keluarganya dikosongkan. Tindakan ini tidak bisa dibatalkan.";
}

export function KeluargaManager({ rows, canWrite }: { rows: KeluargaListRow[]; canWrite: boolean }) {
  const router = useRouter();
  const formId = useId();
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  const [addOpen, setAddOpen] = useState(false);
  const [nama, setNama] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nama.trim()) {
      setError("Nama Keluarga wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/keluarga", { method: "POST", body: { nama } });
      toast.success("Keluarga ditambahkan");
      setAddOpen(false);
      setNama("");
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  async function remove(row: KeluargaListRow) {
    try {
      await apiFetch(`/api/admin/keluarga/${row.id}`, { method: "DELETE" });
      toast.success(`Keluarga ${row.nama} dihapus`);
      router.refresh();
    } catch (removeError) {
      toast.error(errorMessage(removeError));
      throw removeError;
    }
  }

  const addAction = canWrite ? (
    <Button
      onClick={() => {
        setNama("");
        setError(null);
        setAddOpen(true);
      }}
    >
      <PlusIcon aria-hidden />
      Tambah Keluarga
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Keluarga"
        description={`${rows.length} kartu keluarga. Setiap jemaat bisa dikaitkan ke satu keluarga dengan hubungannya masing-masing - atur relasinya di halaman detail keluarga.`}
        actions={addAction}
      />

      <DataTable
        table={table}
        label="Keluarga"
        noun="keluarga"
        canWrite={canWrite}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { href: (row) => `/admin/keluarga/${row.id}` },
          delete: { title: (row) => `Hapus keluarga ${row.nama}?`, description: deleteConsequence, onConfirm: remove },
        }}
      />

      <Dialog open={addOpen} onOpenChange={(open) => !pending && setAddOpen(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Tambah Keluarga</DialogTitle>
          </DialogHeader>
          <form id={formId} noValidate onSubmit={submitAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-nama`}>Nama Keluarga</Label>
              <Input
                id={`${formId}-nama`}
                autoFocus
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                placeholder="mis. Kel. Saragih"
                disabled={pending}
              />
            </div>
            <FormError id={`${formId}-error`} message={error} />
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
            <Button type="submit" form={formId} disabled={pending} focusableWhenDisabled>
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
