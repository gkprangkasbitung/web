"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DatePicker } from "@/components/shared/date-picker";
import { FormError } from "@/components/auth/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateCompact, today, type IsoDate } from "@/lib/dates";

export type CatatanPastoral = {
  id: string;
  jenis: string;
  tanggal: string;
  penulis_nama: string | null;
  isi: string;
};

const helper = createDataTableColumnHelper<CatatanPastoral>();

const columns = [
  helper.accessor("tanggal", {
    header: "Tanggal",
    enableSorting: true,
    meta: { numeric: true },
    cell: ({ getValue }) => formatDateCompact(getValue()),
  }),
  helper.accessor("jenis", {
    header: "Jenis",
    cell: ({ getValue }) => <Badge variant="neutral">{getValue()}</Badge>,
  }),
  helper.accessor("penulis_nama", {
    header: "Penulis",
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("isi", {
    header: "Isi",
    meta: { className: "whitespace-pre-wrap" },
  }),
];

type FormValues = { jenis: string; tanggal: IsoDate; isi: string };

function emptyForm(): FormValues {
  return { jenis: "", tanggal: today(), isi: "" };
}

export function CatatanPastoralSection({
  jemaatId,
  catatan,
  canWrite,
}: {
  jemaatId: string;
  catatan: readonly CatatanPastoral[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const table = useDataTable({
    data: catatan as CatatanPastoral[],
    columns,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: "tanggal", desc: true }] },
  });

  const [addValues, setAddValues] = useState<FormValues>(emptyForm());
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editRow, setEditRow] = useState<CatatanPastoral | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editValues, setEditValues] = useState<FormValues>(emptyForm());
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function submitAdd() {
    if (!addValues.jenis.trim() || !addValues.isi.trim()) {
      setAddError("Jenis dan Isi wajib diisi.");
      return;
    }
    setAddPending(true);
    setAddError(null);
    try {
      await apiFetch(`/api/admin/jemaat/${jemaatId}/catatan`, { method: "POST", body: addValues });
      toast.success("Catatan pastoral ditambahkan");
      setAddValues(emptyForm());
      router.refresh();
    } catch (error) {
      setAddError(errorMessage(error));
    } finally {
      setAddPending(false);
    }
  }

  function openEdit(row: CatatanPastoral) {
    setEditRow(row);
    setEditValues({ jenis: row.jenis, tanggal: row.tanggal, isi: row.isi });
    setEditError(null);
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!editRow) return;
    if (!editValues.jenis.trim() || !editValues.isi.trim()) {
      setEditError("Jenis dan Isi wajib diisi.");
      return;
    }
    setEditPending(true);
    setEditError(null);
    try {
      await apiFetch(`/api/admin/jemaat/${jemaatId}/catatan/${editRow.id}`, { method: "PATCH", body: editValues });
      toast.success("Catatan pastoral diperbarui");
      setEditOpen(false);
      router.refresh();
    } catch (error) {
      setEditError(errorMessage(error));
    } finally {
      setEditPending(false);
    }
  }

  async function remove(row: CatatanPastoral) {
    try {
      await apiFetch(`/api/admin/jemaat/${jemaatId}/catatan/${row.id}`, { method: "DELETE" });
      toast.success("Catatan pastoral dihapus");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catatan Pastoral</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <DataTable
          table={table}
          label="Catatan Pastoral"
          noun="catatan pastoral"
          canWrite={canWrite}
          rowActions={{
            getRowLabel: () => "catatan ini",
            edit: { onSelect: openEdit },
            delete: { title: () => "Hapus catatan ini?", onConfirm: remove },
          }}
        />

        {canWrite && (
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submitAdd();
            }}
            className="flex flex-col gap-4 border-t border-border pt-6"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-jenis`}>Jenis</Label>
                <Input
                  id={`${formId}-jenis`}
                  value={addValues.jenis}
                  onChange={(event) => setAddValues({ ...addValues, jenis: event.target.value })}
                  placeholder="Jenis (mis. Kunjungan)"
                  disabled={addPending}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-tanggal`}>Tanggal</Label>
                <DatePicker
                  id={`${formId}-tanggal`}
                  value={addValues.tanggal}
                  onValueChange={(value) => setAddValues({ ...addValues, tanggal: value ?? today() })}
                  clearable={false}
                  disabled={addPending}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-isi`}>Isi</Label>
              <Textarea
                id={`${formId}-isi`}
                value={addValues.isi}
                onChange={(event) => setAddValues({ ...addValues, isi: event.target.value })}
                placeholder="Hasil kunjungan, pergumulan keluarga, kebutuhan diakonia..."
                disabled={addPending}
              />
            </div>
            <FormError id={`${formId}-error`} message={addError} />
            <div>
              <Button type="submit" disabled={addPending} focusableWhenDisabled>
                {addPending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                Simpan Catatan
              </Button>
            </div>
          </form>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={(open) => !editPending && setEditOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Catatan Pastoral</DialogTitle>
          </DialogHeader>
          <form
            id={`${formId}-edit`}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submitEdit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-edit-jenis`}>Jenis</Label>
              <Input
                id={`${formId}-edit-jenis`}
                value={editValues.jenis}
                onChange={(event) => setEditValues({ ...editValues, jenis: event.target.value })}
                disabled={editPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-edit-tanggal`}>Tanggal</Label>
              <DatePicker
                id={`${formId}-edit-tanggal`}
                value={editValues.tanggal}
                onValueChange={(value) => setEditValues({ ...editValues, tanggal: value ?? today() })}
                clearable={false}
                disabled={editPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-edit-isi`}>Isi</Label>
              <Textarea
                id={`${formId}-edit-isi`}
                value={editValues.isi}
                onChange={(event) => setEditValues({ ...editValues, isi: event.target.value })}
                disabled={editPending}
              />
            </div>
            <FormError id={`${formId}-edit-error`} message={editError} />
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={editPending} />}>Batal</DialogClose>
            <Button type="submit" form={`${formId}-edit`} disabled={editPending} focusableWhenDisabled>
              {editPending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
