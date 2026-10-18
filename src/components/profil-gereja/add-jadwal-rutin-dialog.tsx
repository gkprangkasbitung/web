"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** "Tambah Jadwal Rutin": Nama and Keterangan Waktu, both required; the item goes last. */
export function AddJadwalRutinDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const nama = String(formData.get("nama") ?? "").trim();
    const keteranganWaktu = String(formData.get("keteranganWaktu") ?? "").trim();
    if (!nama) return setError("Nama wajib diisi.");
    if (!keteranganWaktu) return setError("Keterangan waktu wajib diisi.");

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/profil-gereja/jadwal-rutin", { method: "POST", body: { nama, keteranganWaktu } });
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
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" initialFocus={namaInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Jadwal Rutin</DialogTitle>
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
              name="nama"
              maxLength={200}
              required
              placeholder="Mis. Kebaktian Minggu"
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-keterangan-waktu`}>
              Keterangan Waktu
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id={`${formId}-keterangan-waktu`}
              name="keteranganWaktu"
              maxLength={200}
              required
              placeholder="Mis. Minggu, pkl. 08.00 WIB"
              disabled={pending}
              autoComplete="off"
            />
          </div>
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
