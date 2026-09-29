"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { SaranaDanaItemRow } from "@/lib/sarana-dana-routes";

export type KeteranganDialogProps = {
  row: SaranaDanaItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/** Overview's "Edit" row action (brief §9.7): Keterangan only. */
export function KeteranganDialog({ row, open, onOpenChange, readOnly, onSaved }: KeteranganDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  // Lazy initial state only: the caller keys this component by `row.id`, so
  // switching rows remounts it fresh without an effect.
  const [value, setValue] = useState(() => row?.keterangan ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending || !row) return;

    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/sarana-dana/${row.id}`, { method: "PATCH", body: { keterangan: value } });
      toast.success("Keterangan diperbarui");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{row.name}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-keterangan`}>Keterangan</Label>
            <Textarea
              id={`${formId}-keterangan`}
              autoFocus={!readOnly}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={readOnly || pending}
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
                Simpan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
