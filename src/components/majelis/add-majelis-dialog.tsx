"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { initialPhotoValue, photoWillExist, PhotoField } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED } from "@/lib/situs-photo";

export type AddMajelisDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/** "Tambah Majelis" dialog (brief §14.3): Nama, Jabatan (both required), Foto; the new card goes last. */
export function AddMajelisDialog({ open, onOpenChange, onSaved }: AddMajelisDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altInvalid, setAltInvalid] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedNama = nama.trim();
    const trimmedJabatan = jabatan.trim();
    if (!trimmedNama) return void setError("Nama wajib diisi.");
    if (!trimmedJabatan) return void setError("Jabatan wajib diisi.");
    if (photoWillExist(null, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      setError(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("nama", trimmedNama);
    form.append("jabatan", trimmedJabatan);
    appendPhotoFields(form, photoValue);

    setPending(true);
    setError(null);
    setAltInvalid(false);
    try {
      await apiFetch("/api/admin/majelis", { method: "POST", body: form });
      onOpenChange(false);
      onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setError(null);
          setNama("");
          setJabatan("");
          setPhotoValue(initialPhotoValue(null));
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" initialFocus={namaInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Majelis</DialogTitle>
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
              maxLength={200}
              required
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-jabatan`}>
              Jabatan
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id={`${formId}-jabatan`}
              value={jabatan}
              onChange={(event) => setJabatan(event.target.value)}
              maxLength={200}
              required
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <PhotoField
            label="Foto"
            saved={null}
            value={photoValue}
            onValueChange={(next) => {
              setPhotoValue(next);
              if (altInvalid && next.alt.trim()) setAltInvalid(false);
            }}
            disabled={pending}
            altHint={`Foto ${nama || "majelis"}`}
            invalid={altInvalid}
            errorId={errorId}
          />
          <FormError id={errorId} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={formId} disabled={pending} focusableWhenDisabled>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
