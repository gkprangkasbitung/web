"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { PersonPicker } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { today, type IsoDate } from "@/lib/dates";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { TIPE_LABELS, TRANSACTION_TIPE, type TransactionTipe } from "@/lib/sarana-dana";
import type { TransactionRow } from "@/lib/sarana-dana-routes";

type Values = {
  tanggal: IsoDate;
  tipe: TransactionTipe;
  jemaatId: string | null;
  jumlah: number | null;
  keterangan: string;
};

function valuesFromRow(row: TransactionRow | null): Values {
  if (!row) return { tanggal: today(), tipe: "masuk", jemaatId: null, jumlah: null, keterangan: "" };
  return { tanggal: row.tanggal, tipe: row.tipe, jemaatId: row.jemaatId, jumlah: row.jumlah, keterangan: row.keterangan ?? "" };
}

export type TransactionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item's `key` (URL segment), not its uuid. */
  itemKey: string;
  isPersembahanBulanan: boolean;
  /** null = "Tambah Transaksi"; a row = edit, reset to its saved values every time the dialog opens. */
  row: TransactionRow | null;
  peopleOptions: readonly PersonOptionRow[];
  readOnly: boolean;
  /** Inclusive bounds; stage 9 passes the warta's finance week here (brief §12.5-style reuse). */
  minDate?: IsoDate;
  maxDate?: IsoDate;
  onSaved: () => void;
};

/** "Tambah Transaksi" / edit (brief §9.7): identical fields either way. */
export function TransactionDialog({
  open,
  onOpenChange,
  itemKey,
  isPersembahanBulanan,
  row,
  peopleOptions,
  readOnly,
  minDate,
  maxDate,
  onSaved,
}: TransactionDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  // Lazy initial state only: the caller remounts this component with a fresh
  // `key` each time it opens (a bumped counter for add, row.id for edit).
  const [values, setValues] = useState<Values>(() => valuesFromRow(row));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);

  const isEdit = row !== null;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;
    if (values.jumlah === null) {
      setInvalidField("jumlah");
      setError("Jumlah wajib diisi.");
      return;
    }

    setPending(true);
    setError(null);
    setInvalidField(null);
    try {
      const body = {
        tanggal: values.tanggal,
        // The DB trigger (0025) is the real enforcer for Persembahan
        // Bulanan; this just avoids sending a stale "keluar" from before the
        // dialog knew the item.
        tipe: isPersembahanBulanan ? "masuk" : values.tipe,
        jemaatId: isPersembahanBulanan ? values.jemaatId : null,
        jumlah: values.jumlah,
        keterangan: values.keterangan || null,
      };
      if (isEdit) {
        await apiFetch(`/api/admin/sarana-dana/${itemKey}/transaksi/${row.id}`, { method: "PATCH", body });
        toast.success("Transaksi diperbarui");
      } else {
        await apiFetch(`/api/admin/sarana-dana/${itemKey}/transaksi`, { method: "POST", body });
        toast.success("Transaksi ditambahkan");
      }
      onOpenChange(false);
      onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  const disabled = readOnly || pending;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{isEdit ? "Ubah Transaksi" : "Tambah Transaksi"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-tanggal`}>
              Tanggal{" "}
              {!disabled && (
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              )}
            </Label>
            <DatePicker
              id={`${formId}-tanggal`}
              value={values.tanggal}
              onValueChange={(value) => value && set("tanggal", value)}
              clearable={false}
              disabled={disabled}
              minDate={minDate}
              maxDate={maxDate}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-tipe`}>Tipe</Label>
            {isPersembahanBulanan ? (
              <p id={`${formId}-tipe`} className="flex h-9 items-center text-sm text-muted-foreground">
                Pemasukan (tetap)
              </p>
            ) : (
              <Select value={values.tipe} onValueChange={(value) => value && set("tipe", value as TransactionTipe)} disabled={disabled}>
                <SelectTrigger id={`${formId}-tipe`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TIPE.map((tipe) => (
                    <SelectItem key={tipe} value={tipe}>
                      {TIPE_LABELS[tipe]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isPersembahanBulanan && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-jemaat`}>Jemaat</Label>
              <PersonPicker
                id={`${formId}-jemaat`}
                people={peopleOptions}
                value={values.jemaatId}
                onValueChange={(id) => set("jemaatId", id)}
                disabled={disabled}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-jumlah`}>
              Jumlah{" "}
              {!disabled && (
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              )}
            </Label>
            <MoneyInput
              id={`${formId}-jumlah`}
              value={values.jumlah}
              onValueChange={(value) => set("jumlah", value)}
              disabled={disabled}
              aria-invalid={invalidField === "jumlah" || undefined}
              aria-describedby={invalidField === "jumlah" ? errorId : undefined}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-keterangan`}>Keterangan</Label>
            <Textarea
              id={`${formId}-keterangan`}
              value={values.keterangan}
              onChange={(event) => set("keterangan", event.target.value)}
              disabled={disabled}
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
