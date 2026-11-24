"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { DatePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { jakartaDateTimeParts, TIME_PATTERN, type IsoDate } from "@/lib/dates";
import type { PemilihanRow } from "@/lib/pemilihan/admin-types";

type Jadwal = { tanggal: IsoDate | null; jam: string };

function initialJadwal(value: string | null, jam: string): Jadwal {
  if (!value) return { tanggal: null, jam };
  const parts = jakartaDateTimeParts(value);
  return { tanggal: parts.date, jam: parts.time };
}

function Required() {
  return (
    <span className="text-muted-foreground" aria-hidden>
      *
    </span>
  );
}

/**
 * Create (`row` null) or edit an election (brief §18.4). Only drafts can be
 * edited; the database refuses otherwise. The schedule is in WIB: opening
 * at "dibuka" (inclusive) and closing at "ditutup".
 */
export function PemilihanDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: PemilihanRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [nama, setNama] = useState(row?.nama ?? "");
  const [periode, setPeriode] = useState(row?.periode ?? "");
  const [dibuka, setDibuka] = useState<Jadwal>(() => initialJadwal(row?.dibukaPada ?? null, "08:00"));
  const [ditutup, setDitutup] = useState<Jadwal>(() => initialJadwal(row?.ditutupPada ?? null, "17:00"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function jadwalBody(value: Jadwal) {
    return value.tanggal ? { tanggal: value.tanggal, jam: value.jam } : null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!nama.trim()) return void setError("Nama wajib diisi.");
    if (!!dibuka.tanggal !== !!ditutup.tanggal) return void setError("Isi jadwal dibuka dan ditutup, atau kosongkan keduanya.");
    if ((dibuka.tanggal && !TIME_PATTERN.test(dibuka.jam)) || (ditutup.tanggal && !TIME_PATTERN.test(ditutup.jam))) {
      return void setError("Jam tidak valid.");
    }

    setPending(true);
    setError(null);
    try {
      const body = { nama: nama.trim(), periode: periode.trim() || null, dibuka: jadwalBody(dibuka), ditutup: jadwalBody(ditutup) };
      const result = await apiFetch<{ id: string }>(isEdit ? `/api/admin/pemilihan/${row.id}` : "/api/admin/pemilihan", {
        method: isEdit ? "PATCH" : "POST",
        body,
      });
      onOpenChange(false);
      onSaved(result.id);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" initialFocus={namaInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{isEdit ? `Ubah "${row.nama}"` : "Buat Pemilihan"}</DialogTitle>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" aria-describedby={error ? errorId : undefined}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-nama`}>
              Nama <Required />
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
              placeholder="Pemilihan Majelis Jemaat"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-periode`}>Periode</Label>
            <Input
              id={`${formId}-periode`}
              value={periode}
              onChange={(event) => setPeriode(event.target.value)}
              maxLength={50}
              disabled={pending}
              autoComplete="off"
              placeholder="2027–2031"
            />
          </div>

          {(
            [
              ["dibuka", "Dibuka", dibuka, setDibuka],
              ["ditutup", "Ditutup", ditutup, setDitutup],
            ] as const
          ).map(([key, label, value, setValue]) => (
            <fieldset key={key} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{label} (WIB)</legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <DatePicker
                  id={`${formId}-${key}-tanggal`}
                  value={value.tanggal}
                  onValueChange={(tanggal) => setValue({ ...value, tanggal })}
                  disabled={pending}
                  placeholder="Pilih tanggal"
                />
                <Input
                  id={`${formId}-${key}-jam`}
                  aria-label={`Jam ${label.toLowerCase()}`}
                  type="time"
                  value={value.jam}
                  onChange={(event) => setValue({ ...value, jam: event.target.value })}
                  disabled={pending || !value.tanggal}
                />
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted-foreground">
            Jadwal wajib diisi sebelum pemilihan dibuka. Pemilih bisa memberikan suara mulai waktu dibuka sampai sebelum waktu
            ditutup. Setelah dibuka, nama, periode, dan jadwal tidak bisa diubah.
          </p>

          <FormError id={errorId} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={formId} disabled={pending}>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
