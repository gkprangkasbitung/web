"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { KategoriKegiatanRow } from "@/lib/kegiatan";
import { isKegiatanWarna, type KegiatanWarna } from "@/lib/kegiatan-kategori";

import { ColorSwatchPicker } from "./color-swatch-picker";

export type KategoriKegiatanDialogProps = {
  row: KategoriKegiatanRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/** Add dialog (`row` null) or edit dialog titled with the nama (brief §14.4). */
export function KategoriKegiatanDialog({ row, open, onOpenChange, readOnly, onSaved }: KategoriKegiatanDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [nama, setNama] = useState(row?.nama ?? "");
  const [warna, setWarna] = useState<KegiatanWarna | null>(row && isKegiatanWarna(row.warna) ? row.warna : "hijau");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const trimmedNama = nama.trim();
    if (!trimmedNama) return void setError("Nama wajib diisi.");
    if (!warna) return void setError("Warna wajib dipilih.");

    setPending(true);
    setError(null);
    try {
      const endpoint = isEdit ? `/api/admin/kegiatan/kategori/${row.id}` : "/api/admin/kegiatan/kategori";
      await apiFetch(endpoint, { method: isEdit ? "PATCH" : "POST", body: { nama: trimmedNama, warna } });
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
          <DialogTitle className="text-lg font-semibold">{isEdit ? row.nama : "Tambah Kategori"}</DialogTitle>
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
              placeholder="Mis. Ibadah khusus"
              maxLength={100}
              required
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label id={`${formId}-warna-label`}>
              Warna
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <ColorSwatchPicker
              id={`${formId}-warna`}
              value={warna}
              onValueChange={setWarna}
              disabled={readOnly || pending}
              aria-describedby={`${formId}-warna-label`}
            />
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
