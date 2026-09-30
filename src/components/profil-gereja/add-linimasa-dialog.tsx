"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** "Tambah Linimasa": Tahun and Keterangan, both required; the item goes last. */
export function AddLinimasaDialog({
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
  const tahunInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const tahun = String(formData.get("tahun") ?? "").trim();
    const teks = String(formData.get("teks") ?? "").trim();
    if (!tahun) return setError("Tahun wajib diisi.");
    if (!teks) return setError("Keterangan wajib diisi.");

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/profil-gereja/linimasa", { method: "POST", body: { tahun, teks } });
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
      <DialogContent className="sm:max-w-md" initialFocus={tahunInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Linimasa</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-tahun`}>
              Tahun
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              ref={tahunInput}
              id={`${formId}-tahun`}
              name="tahun"
              maxLength={20}
              required
              placeholder="Mis. 1950 atau 1950-an"
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-teks`}>
              Keterangan
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Textarea id={`${formId}-teks`} name="teks" rows={3} maxLength={500} required disabled={pending} />
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
