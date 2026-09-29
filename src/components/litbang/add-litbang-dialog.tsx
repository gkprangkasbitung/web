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
import { LITBANG_DESKRIPSI_PLACEHOLDER } from "@/lib/litbang";

export type AddLitbangDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/** "Tambah Litbang" dialog (brief §9.6): Nama (required) + Deskripsi; the new card goes last. */
export function AddLitbangDialog({ open, onOpenChange, onSaved }: AddLitbangDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const nameInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const deskripsi = String(formData.get("deskripsi") ?? "").trim();
    if (!name) {
      setError("Nama wajib diisi.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/litbang-template", { method: "POST", body: { name, deskripsi } });
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
      <DialogContent className="sm:max-w-md" initialFocus={nameInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Litbang</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-name`}>
              Nama
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              ref={nameInput}
              id={`${formId}-name`}
              name="name"
              maxLength={200}
              required
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-deskripsi`}>Deskripsi</Label>
            <Textarea
              id={`${formId}-deskripsi`}
              name="deskripsi"
              rows={4}
              maxLength={2000}
              placeholder={LITBANG_DESKRIPSI_PLACEHOLDER}
              disabled={pending}
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
