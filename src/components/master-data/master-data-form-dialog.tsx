"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldRequiredMessage, type MasterDataConfig, type MasterDataRow } from "@/lib/master-data";

export type MasterDataValues = Partial<Record<"nama" | "keterangan", string>>;

/**
 * Add dialog (`row` null) or edit dialog titled with the record's name.
 * Read-only users get the same dialog with disabled fields and no "Simpan".
 */
export function MasterDataFormDialog({
  config,
  open,
  onOpenChange,
  row,
  readOnly,
  onSubmit,
}: {
  config: MasterDataConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MasterDataRow | null;
  readOnly: boolean;
  /** Resolves when saved; rejects with the message to show. */
  onSubmit: (values: MasterDataValues) => Promise<void>;
}) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const firstInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);

  const isEdit = row !== null;
  const title = isEdit ? row.nama : config.addLabel;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const formData = new FormData(event.currentTarget);
    const values: MasterDataValues = {};
    for (const field of config.fields) {
      const value = String(formData.get(field.name) ?? "").trim();
      if (field.required && !value) {
        setInvalidField(field.name);
        setError(fieldRequiredMessage(field));
        return;
      }
      values[field.name] = value;
    }

    setPending(true);
    setError(null);
    setInvalidField(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Coba lagi.");
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
          setInvalidField(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" initialFocus={readOnly ? undefined : firstInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>

        {/* Keyed by the row so the fields reset to the saved values each time the dialog opens. */}
        <form
          key={row?.id ?? "new"}
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          {config.fields.map((field, index) => {
            const inputId = `${formId}-${field.name}`;
            return (
              <div key={field.name} className="flex flex-col gap-2">
                <Label htmlFor={inputId}>
                  {field.label}
                  {field.required && !readOnly && (
                    <span className="text-muted-foreground" aria-hidden>
                      *
                    </span>
                  )}
                </Label>
                <Input
                  ref={index === 0 ? firstInput : undefined}
                  id={inputId}
                  name={field.name}
                  defaultValue={row?.[field.name] ?? ""}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  required={field.required}
                  disabled={readOnly || pending}
                  autoComplete="off"
                  aria-invalid={invalidField === field.name || undefined}
                  aria-describedby={invalidField === field.name ? errorId : undefined}
                />
              </div>
            );
          })}
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
