"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { PELAYANAN_ICONS } from "@/lib/pelayanan-icons";

export type AddPelayananDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/** "Tambah Pelayanan" dialog (brief §14.2): Nama (required), Jadwal, Ikon, Deskripsi; the new card goes last. */
export function AddPelayananDialog({ open, onOpenChange, onSaved }: AddPelayananDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const [icon, setIcon] = useState(PELAYANAN_ICONS[0]!.key);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const nama = String(formData.get("nama") ?? "").trim();
    const deskripsi = String(formData.get("deskripsi") ?? "").trim();
    const jadwal = String(formData.get("jadwal") ?? "").trim();
    if (!nama) {
      setError("Nama wajib diisi.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/pelayanan", { method: "POST", body: { nama, deskripsi, jadwal, icon } });
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
          <DialogTitle className="text-lg font-semibold">Tambah Pelayanan</DialogTitle>
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
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-jadwal`}>Jadwal</Label>
            <Input
              id={`${formId}-jadwal`}
              name="jadwal"
              maxLength={300}
              placeholder="Mis. Setiap Minggu, pkl. 09.00 WIB"
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-icon`}>Ikon</Label>
            <Select value={icon} onValueChange={(value) => value && setIcon(value)} disabled={pending}>
              <SelectTrigger id={`${formId}-icon`} className="w-full">
                <SelectValue placeholder="Pilih ikon" />
              </SelectTrigger>
              <SelectContent>
                {PELAYANAN_ICONS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    <item.icon aria-hidden className="size-4" />
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-deskripsi`}>Deskripsi</Label>
            <Textarea id={`${formId}-deskripsi`} name="deskripsi" rows={3} maxLength={2000} disabled={pending} />
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
