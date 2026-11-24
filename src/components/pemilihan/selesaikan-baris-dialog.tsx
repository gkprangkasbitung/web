"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BarisImporRow, JemaatPilihan } from "@/lib/pemilihan/admin-types";
import { LABEL_KATEGORI } from "@/lib/pemilihan/impor";

const LAIN = "__lain__";

function lokasi(j: JemaatPilihan): string {
  return [j.alamat, j.wilayah].filter(Boolean).join(" · ") || "Alamat belum diisi";
}

function Pilihan<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="size-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Resolves one imported row (brief §18.4): which jemaat it is (Ambigu: the
 * candidates with Domisili's hint, best first; Tidak ditemukan: anyone via
 * the person picker), Dapat Memilih (confirms a blank cell), and Dapat
 * Dipilih / Tidak Dapat Dipilih. Saved atomically with the peserta row.
 */
export function SelesaikanBarisDialog({
  pemilihanId,
  row,
  rows,
  jemaat,
  open,
  onOpenChange,
  onSaved,
}: {
  pemilihanId: string;
  row: BarisImporRow;
  rows: readonly BarisImporRow[];
  jemaat: readonly JemaatPilihan[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const id = useId();
  const byId = useMemo(() => new Map(jemaat.map((j) => [j.id, j])), [jemaat]);
  const calon = row.calonJemaatIds.map((cid) => byId.get(cid)).filter((j): j is JemaatPilihan => Boolean(j));

  const [pilihan, setPilihan] = useState<string | null>(() => {
    if (row.jemaatId && row.calonJemaatIds.includes(row.jemaatId)) return row.jemaatId;
    if (row.jemaatId) return LAIN;
    return calon.length === 0 ? LAIN : null;
  });
  const [lain, setLain] = useState<string | null>(row.jemaatId && !row.calonJemaatIds.includes(row.jemaatId) ? row.jemaatId : null);
  const [memilih, setMemilih] = useState<"ya" | "tidak" | null>(
    row.dapatMemilih === null || row.perluKonfirmasiMemilih ? null : row.dapatMemilih ? "ya" : "tidak",
  );
  const [dipilih, setDipilih] = useState<"ya" | "tidak" | null>(row.dapatDipilih === null ? null : row.dapatDipilih ? "ya" : "tidak");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One jemaat per list: the ones other rows already hold can't be picked.
  const dipakai = useMemo(() => {
    const map = new Map<string, string>();
    for (const other of rows) {
      if (other.id !== row.id && other.jemaatId && !other.dikeluarkan) map.set(other.jemaatId, `${other.kelompokWilayah}, baris ${other.baris}`);
    }
    return map;
  }, [rows, row.id]);
  const people: PersonOption[] = useMemo(
    () => jemaat.map((j) => ({ id: j.id, nama: j.nama, labels: [j.wilayah, j.alamat].filter((x): x is string => Boolean(x)).slice(0, 2) })),
    [jemaat],
  );

  const jemaatId = pilihan === LAIN ? lain : pilihan;

  async function simpan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!jemaatId) return void setError("Pilih jemaat yang dimaksud.");
    if (!memilih) return void setError("Tentukan Dapat Memilih.");
    if (!dipilih) return void setError("Tentukan Dapat Dipilih atau Tidak Dapat Dipilih.");

    const body: Record<string, unknown> = {};
    if (jemaatId !== row.jemaatId) body.jemaatId = jemaatId;
    const memilihBool = memilih === "ya";
    if (row.perluKonfirmasiMemilih || memilihBool !== row.dapatMemilih) body.dapatMemilih = memilihBool;
    const dipilihBool = dipilih === "ya";
    if (dipilihBool !== row.dapatDipilih) body.dapatDipilih = dipilihBool;
    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/pemilihan/${pemilihanId}/impor/${row.id}`, { method: "PATCH", body });
      toast.success(`Baris "${row.nama}" disimpan`);
      onOpenChange(false);
      onSaved();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{row.nama}</DialogTitle>
          <DialogDescription>
            {row.kelompokWilayah}, baris {row.baris}
            {row.nomor ? ` (No. ${row.nomor})` : ""} · {LABEL_KATEGORI[row.kategori]}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Domisili</dt>
          <dd>{row.domisili ?? "—"}</dd>
          <dt className="text-muted-foreground">Usia</dt>
          <dd>{row.usia ?? "—"}</dd>
          <dt className="text-muted-foreground">Keterangan</dt>
          <dd>{row.keterangan ?? "—"}</dd>
          {row.catatan.length > 0 && (
            <>
              <dt className="text-muted-foreground">Catatan impor</dt>
              <dd>
                {row.catatan.map((c) => (
                  <span key={c} className="block">
                    {c}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        <form id={id} noValidate onSubmit={simpan} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Jemaat yang dimaksud</legend>
            {calon.length > 0 && (
              <div className="flex flex-col gap-2">
                {calon.map((j) => {
                  const used = dipakai.get(j.id);
                  return (
                    <label key={j.id} className="flex items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary">
                      <input
                        type="radio"
                        name={`${id}-jemaat`}
                        value={j.id}
                        checked={pilihan === j.id}
                        onChange={() => setPilihan(j.id)}
                        disabled={pending || Boolean(used)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium">{j.nama}</span>
                        <span className="text-xs text-muted-foreground">{lokasi(j)}</span>
                        {used && <span className="text-xs text-destructive">Sudah dipakai di {used}</span>}
                      </span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${id}-jemaat`}
                    value={LAIN}
                    checked={pilihan === LAIN}
                    onChange={() => setPilihan(LAIN)}
                    disabled={pending}
                    className="size-4 accent-primary"
                  />
                  Jemaat lain
                </label>
              </div>
            )}
            {pilihan === LAIN && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-lain`} className="sr-only">
                  Cari jemaat
                </Label>
                <PersonPicker
                  id={`${id}-lain`}
                  people={people}
                  value={lain}
                  onValueChange={setLain}
                  disabled={pending}
                  placeholder="Cari nama jemaat..."
                  disabledReason={(person) => (dipakai.has(person.id) ? `Sudah dipakai di ${dipakai.get(person.id)}` : null)}
                />
                {calon.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nama ini tidak ditemukan di Data Jemaat. Pilih jemaatnya, atau keluarkan baris ini dari daftar.</p>
                )}
              </div>
            )}
          </fieldset>

          <Pilihan
            name={`${id}-memilih`}
            legend={row.perluKonfirmasiMemilih ? "Dapat Memilih (kosong di file, konfirmasi)" : "Dapat Memilih"}
            value={memilih}
            onChange={setMemilih}
            disabled={pending}
            options={[
              { value: "ya", label: "Dapat memilih" },
              { value: "tidak", label: "Tidak dapat memilih" },
            ]}
          />
          <Pilihan
            name={`${id}-dipilih`}
            legend="Dapat Dipilih"
            value={dipilih}
            onChange={setDipilih}
            disabled={pending}
            options={[
              { value: "ya", label: "Dapat dipilih" },
              { value: "tidak", label: "Tidak dapat dipilih" },
            ]}
          />

          <FormError id={`${id}-error`} message={error} />
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={id} disabled={pending}>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
