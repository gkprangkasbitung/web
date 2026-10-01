"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JabatanKomisiRow } from "@/lib/komisi";

export type JabatanDialogProps = {
  row: JabatanKomisiRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/** Add dialog (`row` null) or edit dialog titled with the nama (brief §14.8). */
export function JabatanDialog({ row, open, onOpenChange, readOnly, onSaved }: JabatanDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [nama, setNama] = useState(row?.nama ?? "");
  const [tunggal, setTunggal] = useState(row?.tunggal ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const trimmedNama = nama.trim();
    if (!trimmedNama) return void setError("Nama wajib diisi.");

    setPending(true);
    setError(null);
    try {
      const endpoint = isEdit ? `/api/admin/komisi/jabatan/${row.id}` : "/api/admin/komisi/jabatan";
      await apiFetch(endpoint, { method: isEdit ? "PATCH" : "POST", body: { nama: trimmedNama, tunggal } });
      onOpenChange(false);
      onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm" initialFocus={readOnly ? undefined : namaInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{isEdit ? row.nama : "Tambah Jabatan"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-nama`}>
              Nama
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              ref={namaInput}
              id={`${formId}-nama`}
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              placeholder="Mis. Ketua"
              maxLength={100}
              required
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-tunggal`}
              checked={tunggal}
              onCheckedChange={(checked) => setTunggal(checked === true)}
              disabled={readOnly || pending}
            />
            <Label htmlFor={`${formId}-tunggal`}>Tunggal (paling banyak satu orang per komisi)</Label>
          </div>

          <FormError id={errorId} message={error} />
        </form>
        <DialogFooter>
          {readOnly ? (
            <DialogClose render={<Button variant="outline" />}>Tutup</DialogClose>
          ) : (
            <>
              <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
              <Button type="submit" form={formId} disabled={pending} focusableWhenDisabled>
                {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                {isEdit ? "Simpan" : "Tambah"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
