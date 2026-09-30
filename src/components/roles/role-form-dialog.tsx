"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type RoleFormValues = { name: string; description: string };

/**
 * "Tambah Role" (brief §9.12) and the Edit dialog (Nama + Deskripsi). The
 * super_admin name is fixed (the database refuses a rename too). Remount
 * with a new `key` to reset.
 */
export function RoleFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  nameLocked = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: RoleFormValues;
  nameLocked?: boolean;
  /** Resolves when saved; rejects with the message to show inline. */
  onSubmit: (values: RoleFormValues) => Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Nama Role wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({ name, description });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {mode === "create" ? "Tambah Role" : `Edit role ${initial?.name ?? ""}`}
          </DialogTitle>
          {mode === "create" && (
            <DialogDescription>Permission role baru diatur lewat tabel permission setelah role dibuat.</DialogDescription>
          )}
        </DialogHeader>
        <form id={id} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-name`}>Nama Role</Label>
            <Input
              id={`${id}-name`}
              autoFocus={!nameLocked}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending || nameLocked}
              aria-describedby={nameLocked ? `${id}-name-note` : undefined}
              aria-invalid={error === "Nama Role wajib diisi." || undefined}
              placeholder="mis. bendahara"
            />
            {nameLocked && (
              <p id={`${id}-name-note`} className="text-xs text-muted-foreground">
                Nama role super_admin tidak bisa diubah.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-description`}>Deskripsi</Label>
            <Textarea
              id={`${id}-description`}
              autoFocus={nameLocked}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              rows={3}
            />
          </div>
          <FormError id={`${id}-error`} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={id} disabled={pending} focusableWhenDisabled>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            {mode === "create" ? "Tambah" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
