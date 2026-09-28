"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { FormError } from "@/components/auth/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { STATUS_KEANGGOTAAN_BADGE, STATUS_KEANGGOTAAN_LABELS } from "@/lib/jemaat";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import type { KeluargaDetail, KeluargaMember } from "@/lib/keluarga-routes";

import { InlineHubunganCell } from "./inline-hubungan-cell";
import { TambahAnggotaForm } from "./tambah-anggota-form";

const helper = createDataTableColumnHelper<KeluargaMember>();

export function KeluargaDetailView({
  keluarga,
  people,
  canWrite,
}: {
  keluarga: KeluargaDetail;
  people: readonly PersonOptionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const renameId = useId();

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
        <Link href={`/admin/jemaat/${row.original.id}`} className="hover:underline">
          {row.original.nama}
        </Link>
      ),
    }),
    helper.accessor("wilayahNama", {
      header: "Wilayah",
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("statusKeanggotaan", {
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue();
        if (!status) return <span className="text-muted-foreground">—</span>;
        return <Badge variant={STATUS_KEANGGOTAAN_BADGE[status]}>{STATUS_KEANGGOTAAN_LABELS[status]}</Badge>;
      },
    }),
    helper.accessor("noHp", {
      header: "Kontak",
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("hubunganKeluarga", {
      id: "hubunganKeluarga",
      header: "Hubungan Keluarga",
      cell: ({ row }) =>
        canWrite ? (
          <InlineHubunganCell
            keluargaId={keluarga.id}
            jemaatId={row.original.id}
            value={row.original.hubunganKeluarga}
            onSaved={() => router.refresh()}
          />
        ) : (
          (row.original.hubunganKeluarga ?? <span className="text-muted-foreground">—</span>)
        ),
    }),
  ];

  const table = useDataTable({ data: keluarga.anggota, columns, getRowId: (row) => row.id });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(keluarga.nama);
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [keluarkanTarget, setKeluarkanTarget] = useState<KeluargaMember | null>(null);

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameValue.trim()) {
      setRenameError("Nama Keluarga wajib diisi.");
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    try {
      await apiFetch(`/api/admin/keluarga/${keluarga.id}`, { method: "PATCH", body: { nama: renameValue } });
      toast.success("Nama keluarga diperbarui");
      setRenameOpen(false);
      router.refresh();
    } catch (error) {
      setRenameError(errorMessage(error));
    } finally {
      setRenamePending(false);
    }
  }

  async function removeKeluarga() {
    try {
      await apiFetch(`/api/admin/keluarga/${keluarga.id}`, { method: "DELETE" });
      toast.success(`Keluarga ${keluarga.nama} dihapus`);
      router.push("/admin/keluarga");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  async function keluarkan() {
    if (!keluarkanTarget) return;
    try {
      await apiFetch(`/api/admin/keluarga/${keluarga.id}/anggota/${keluarkanTarget.id}`, { method: "DELETE" });
      toast.success(`${keluarkanTarget.nama} dikeluarkan dari keluarga`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const deleteConsequence =
    keluarga.anggota.length === 0
      ? "Tindakan ini tidak bisa dibatalkan."
      : "Anggota yang masih tercatat di keluarga ini akan dilepas (tidak ikut terhapus), dan hubungan keluarganya dikosongkan. Tindakan ini tidak bisa dibatalkan.";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/keluarga" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar keluarga
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{keluarga.nama}</h1>
          <p className="text-sm text-muted-foreground">{keluarga.anggota.length} anggota</p>
        </div>
        {canWrite && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Hapus
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRenameValue(keluarga.nama);
                setRenameError(null);
                setRenameOpen(true);
              }}
            >
              Ubah Nama
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anggota</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <DataTable
            table={table}
            label="Anggota Keluarga"
            noun="anggota"
            canWrite={canWrite}
            rowActions={{
              getRowLabel: (row) => row.nama,
              extra: [{ label: "Keluarkan", write: true, onSelect: setKeluarkanTarget }],
            }}
          />

          {canWrite && (
            <div className="border-t border-border pt-6">
              <TambahAnggotaForm
                keluargaId={keluarga.id}
                keluargaNama={keluarga.nama}
                people={people}
                memberIds={keluarga.anggota.map((member) => member.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={(open) => !renamePending && setRenameOpen(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Ubah Nama Keluarga</DialogTitle>
          </DialogHeader>
          <form id={renameId} noValidate onSubmit={submitRename} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${renameId}-nama`}>Nama Keluarga</Label>
              <Input
                id={`${renameId}-nama`}
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                disabled={renamePending}
              />
            </div>
            <FormError id={`${renameId}-error`} message={renameError} />
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={renamePending} />}>Batal</DialogClose>
            <Button type="submit" form={renameId} disabled={renamePending} focusableWhenDisabled>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus keluarga ${keluarga.nama}?`}
        description={deleteConsequence}
        onConfirm={removeKeluarga}
      />

      <ConfirmDialog
        open={keluarkanTarget !== null}
        onOpenChange={(open) => !open && setKeluarkanTarget(null)}
        title={`Keluarkan ${keluarkanTarget?.nama ?? ""} dari keluarga ini?`}
        confirmLabel="Keluarkan"
        onConfirm={keluarkan}
      />
    </div>
  );
}
