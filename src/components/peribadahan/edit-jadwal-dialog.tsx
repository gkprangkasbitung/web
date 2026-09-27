"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { PersonPicker } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong } from "@/lib/dates";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { ATTENDANCE_LABELS, layoutFor, SMKA_KEY, type AttendanceField, type PeribadahanField } from "@/lib/peribadahan";
import type { PeribadahanItemRow, SmkaKelompokRow } from "@/lib/peribadahan-routes";

import { emptySmkaGrid, smkaGridFromRows, SmkaGrid, type SmkaGroupValue } from "./smka-grid";

type EditValues = {
  jam: string;
  tempatId: string | null;
  wilayahId: string | null;
  pelayanFirmanId: string | null;
  liturgosId: string | null;
  pemusikId: string | null;
  tema: string;
  dpa: string;
  catatan: string;
  kehadiranLakiLaki: number | null;
  kehadiranPerempuan: number | null;
  kehadiranAnak: number | null;
  bahanAlkitab: string;
  smkaKelompok: SmkaGroupValue[];
};

function valuesFromRow(row: PeribadahanItemRow, smkaKelompok: readonly SmkaKelompokRow[]): EditValues {
  return {
    jam: row.jam?.slice(0, 5) ?? "",
    tempatId: row.tempatId,
    wilayahId: row.wilayahId,
    pelayanFirmanId: row.pelayanFirmanId,
    liturgosId: row.liturgosId,
    pemusikId: row.pemusikId,
    tema: row.tema ?? "",
    dpa: row.dpa ?? "",
    catatan: row.catatan ?? "",
    kehadiranLakiLaki: row.kehadiranLakiLaki,
    kehadiranPerempuan: row.kehadiranPerempuan,
    kehadiranAnak: row.kehadiranAnak,
    bahanAlkitab: row.bahanAlkitab ?? "",
    smkaKelompok: row.categoryKey === SMKA_KEY ? smkaGridFromRows(smkaKelompok) : emptySmkaGrid(),
  };
}

function parseCount(raw: string): number | null {
  return raw === "" ? null : Number(raw);
}

export type EditJadwalDialogProps = {
  row: PeribadahanItemRow | null;
  /** This row's SMKA groups; ignored unless the row's category is Kebaktian SMKA. */
  smkaKelompok: readonly SmkaKelompokRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  tempatOptions: readonly { id: string; nama: string }[];
  wilayahOptions: readonly { id: string; nama: string }[];
  peopleOptions: readonly PersonOptionRow[];
  onSaved: () => void;
};

/**
 * Every field of the row's own category layout (brief §9.5), including the
 * SMKA grid. Read-only users get the same dialog with disabled fields.
 */
export function EditJadwalDialog({
  row,
  smkaKelompok,
  open,
  onOpenChange,
  readOnly,
  tempatOptions,
  wilayahOptions,
  peopleOptions,
  onSaved,
}: EditJadwalDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  // Lazy initial state only: the caller keys this component by `row.id`, so
  // switching to a different row remounts it fresh without an effect.
  const [values, setValues] = useState<EditValues>(() => (row ? valuesFromRow(row, smkaKelompok) : emptyValues()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) return null;

  const layout = layoutFor(row.categoryKey);
  const has = (field: PeribadahanField) => layout.fields.includes(field);
  const hasAttendance = (field: AttendanceField) => layout.attendance.includes(field);

  function set<K extends keyof EditValues>(key: K, value: EditValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending || !row) return;

    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/peribadahan/${row.id}`, {
        method: "PATCH",
        body: {
          jam: values.jam || null,
          tempatId: values.tempatId,
          wilayahId: values.wilayahId,
          pelayanFirmanId: values.pelayanFirmanId,
          liturgosId: values.liturgosId,
          pemusikId: values.pemusikId,
          tema: values.tema || null,
          dpa: values.dpa || null,
          catatan: values.catatan || null,
          kehadiranLakiLaki: values.kehadiranLakiLaki,
          kehadiranPerempuan: values.kehadiranPerempuan,
          kehadiranAnak: values.kehadiranAnak,
          bahanAlkitab: values.bahanAlkitab || null,
          smkaKelompok: has("smkaGrid") ? values.smkaKelompok : undefined,
        },
      });
      toast.success("Jadwal diperbarui");
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {row.categoryName} · {formatDateLong(row.tanggal)}
          </DialogTitle>
        </DialogHeader>

        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-waktu`}>Waktu</Label>
            <Input
              id={`${formId}-waktu`}
              type="time"
              value={values.jam}
              onChange={(event) => set("jam", event.target.value)}
              disabled={disabled}
            />
          </div>

          {has("tempat") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tempat`}>Tempat</Label>
              <Select value={values.tempatId} onValueChange={(value) => set("tempatId", value)} disabled={disabled}>
                <SelectTrigger id={`${formId}-tempat`} className="w-full">
                  <SelectValue placeholder="Pilih tempat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Tidak ada tempat</SelectItem>
                  {tempatOptions.map((tempat) => (
                    <SelectItem key={tempat.id} value={tempat.id}>
                      {tempat.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {has("wilayah") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-wilayah`}>Wilayah</Label>
              <Select value={values.wilayahId} onValueChange={(value) => set("wilayahId", value)} disabled={disabled}>
                <SelectTrigger id={`${formId}-wilayah`} className="w-full">
                  <SelectValue placeholder="Pilih wilayah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Tidak ada wilayah</SelectItem>
                  {wilayahOptions.map((wilayah) => (
                    <SelectItem key={wilayah.id} value={wilayah.id}>
                      {wilayah.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {has("dpa") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-dpa`}>Dasar Pemahaman Alkitab (DPA)</Label>
              <Input id={`${formId}-dpa`} value={values.dpa} onChange={(event) => set("dpa", event.target.value)} disabled={disabled} />
            </div>
          )}

          {has("tema") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tema`}>Tema</Label>
              <Input id={`${formId}-tema`} value={values.tema} onChange={(event) => set("tema", event.target.value)} disabled={disabled} />
            </div>
          )}

          {has("pelayanFirman") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-pf`}>Pelayan Firman</Label>
              <PersonPicker
                id={`${formId}-pf`}
                people={peopleOptions}
                value={values.pelayanFirmanId}
                onValueChange={(id) => set("pelayanFirmanId", id)}
                disabled={disabled}
              />
            </div>
          )}

          {has("liturgos") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-liturgos`}>{layout.liturgosLabel}</Label>
              <PersonPicker
                id={`${formId}-liturgos`}
                people={peopleOptions}
                value={values.liturgosId}
                onValueChange={(id) => set("liturgosId", id)}
                disabled={disabled}
              />
            </div>
          )}

          {has("pemusik") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-pemusik`}>Pemusik</Label>
              <PersonPicker
                id={`${formId}-pemusik`}
                people={peopleOptions}
                value={values.pemusikId}
                onValueChange={(id) => set("pemusikId", id)}
                disabled={disabled}
              />
            </div>
          )}

          {has("bahanAlkitab") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-bahan`}>Bahan Alkitab</Label>
              <Input
                id={`${formId}-bahan`}
                value={values.bahanAlkitab}
                onChange={(event) => set("bahanAlkitab", event.target.value)}
                disabled={disabled}
              />
            </div>
          )}

          {(["lakiLaki", "perempuan", "anak"] as const)
            .filter((field) => hasAttendance(field))
            .map((field) => {
              const key = (
                { lakiLaki: "kehadiranLakiLaki", perempuan: "kehadiranPerempuan", anak: "kehadiranAnak" } as const
              )[field];
              return (
                <div key={field} className="flex flex-col gap-2">
                  <Label htmlFor={`${formId}-${field}`}>Jumlah Kehadiran ({ATTENDANCE_LABELS[field]})</Label>
                  <Input
                    id={`${formId}-${field}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={values[key] ?? ""}
                    onChange={(event) => set(key, parseCount(event.target.value))}
                    disabled={disabled}
                  />
                </div>
              );
            })}

          {layout.notesLabel && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-catatan`}>{layout.notesLabel}</Label>
              <Textarea
                id={`${formId}-catatan`}
                value={values.catatan}
                onChange={(event) => set("catatan", event.target.value)}
                disabled={disabled}
              />
            </div>
          )}

          {has("smkaGrid") && (
            <div className="flex flex-col gap-2">
              <Label>Kelompok</Label>
              <SmkaGrid
                value={values.smkaKelompok}
                onValueChange={(next) => set("smkaKelompok", next)}
                peopleOptions={peopleOptions}
                disabled={disabled}
              />
            </div>
          )}

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

function emptyValues(): EditValues {
  return {
    jam: "",
    tempatId: null,
    wilayahId: null,
    pelayanFirmanId: null,
    liturgosId: null,
    pemusikId: null,
    tema: "",
    dpa: "",
    catatan: "",
    kehadiranLakiLaki: null,
    kehadiranPerempuan: null,
    kehadiranAnak: null,
    bahanAlkitab: "",
    smkaKelompok: emptySmkaGrid(),
  };
}
