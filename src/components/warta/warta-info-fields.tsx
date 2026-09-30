"use client";

import { DatePicker } from "@/components/shared/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IsoDate } from "@/lib/dates";
import { KITAB_RENUNGAN_PLACEHOLDER, type WartaInfo } from "@/lib/warta";

/** The form's own copy of the Informasi & Renungan fields: plain strings while typing. */
export type WartaInfoValues = {
  tanggalKebaktian: IsoDate | null;
  judulKebaktian: string;
  temaKebaktian: string;
  renunganJudul: string;
  renunganKitab: string;
  renunganIsi: string;
  renunganSumber: string;
};

export type WartaInfoField = keyof WartaInfoValues;

export function wartaInfoValues(info?: WartaInfo, defaultTanggal?: IsoDate): WartaInfoValues {
  return {
    tanggalKebaktian: info?.tanggalKebaktian ?? defaultTanggal ?? null,
    judulKebaktian: info?.judulKebaktian ?? "",
    temaKebaktian: info?.temaKebaktian ?? "",
    renunganJudul: info?.renunganJudul ?? "",
    renunganKitab: info?.renunganKitab ?? "",
    renunganIsi: info?.renunganIsi ?? "",
    renunganSumber: info?.renunganSumber ?? "",
  };
}

/** The first client-side problem, in field order, or null. The server validates again with Zod. */
export function validateWartaInfo(values: WartaInfoValues): { field: WartaInfoField; message: string } | null {
  if (!values.tanggalKebaktian) return { field: "tanggalKebaktian", message: "Tanggal Kebaktian wajib diisi." };
  if (!values.judulKebaktian.trim()) return { field: "judulKebaktian", message: "Judul Kebaktian wajib diisi." };
  return null;
}

function Required() {
  return (
    <span className="text-muted-foreground" aria-hidden>
      *
    </span>
  );
}

/**
 * "Informasi" and "Renungan" (brief §9.4): shared by the create page and the
 * editor's first section, so both always show the same fields.
 */
export function WartaInfoFields({
  idPrefix,
  values,
  onValueChange,
  disabled,
  invalidField,
  errorId,
}: {
  idPrefix: string;
  values: WartaInfoValues;
  onValueChange: <F extends WartaInfoField>(field: F, value: WartaInfoValues[F]) => void;
  disabled?: boolean;
  invalidField?: WartaInfoField | null;
  /** Links the invalid field to the form's error message. */
  errorId?: string;
}) {
  function invalidProps(field: WartaInfoField) {
    return invalidField === field
      ? { "aria-invalid": true as const, "aria-describedby": errorId }
      : {};
  }

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="mb-4 text-base font-semibold">Informasi</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-tanggal`}>
              Tanggal Kebaktian <Required />
            </Label>
            <DatePicker
              id={`${idPrefix}-tanggal`}
              value={values.tanggalKebaktian}
              onValueChange={(value) => onValueChange("tanggalKebaktian", value)}
              clearable={false}
              disabled={disabled}
              aria-invalid={invalidField === "tanggalKebaktian" || undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-judul`}>
              Judul Kebaktian <Required />
            </Label>
            <Input
              id={`${idPrefix}-judul`}
              value={values.judulKebaktian}
              onChange={(event) => onValueChange("judulKebaktian", event.target.value)}
              maxLength={200}
              autoComplete="off"
              required
              {...invalidProps("judulKebaktian")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-tema`}>Tema Kebaktian</Label>
          <Input
            id={`${idPrefix}-tema`}
            value={values.temaKebaktian}
            onChange={(event) => onValueChange("temaKebaktian", event.target.value)}
            maxLength={300}
            autoComplete="off"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="mb-4 text-base font-semibold">Renungan</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-renungan-judul`}>Judul Renungan</Label>
            <Input
              id={`${idPrefix}-renungan-judul`}
              value={values.renunganJudul}
              onChange={(event) => onValueChange("renunganJudul", event.target.value)}
              maxLength={200}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-renungan-kitab`}>Kitab Renungan</Label>
            <Input
              id={`${idPrefix}-renungan-kitab`}
              value={values.renunganKitab}
              onChange={(event) => onValueChange("renunganKitab", event.target.value)}
              placeholder={KITAB_RENUNGAN_PLACEHOLDER}
              maxLength={200}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-renungan-isi`}>Isi Renungan</Label>
          <Textarea
            id={`${idPrefix}-renungan-isi`}
            value={values.renunganIsi}
            onChange={(event) => onValueChange("renunganIsi", event.target.value)}
            rows={8}
            maxLength={20000}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-renungan-sumber`}>Sumber Renungan</Label>
          <Input
            id={`${idPrefix}-renungan-sumber`}
            value={values.renunganSumber}
            onChange={(event) => onValueChange("renunganSumber", event.target.value)}
            maxLength={300}
            autoComplete="off"
          />
        </div>
      </fieldset>
    </div>
  );
}

/** The body both the create and update routes accept (their shared Zod schema). */
export function wartaInfoBody(values: WartaInfoValues) {
  return {
    tanggalKebaktian: values.tanggalKebaktian,
    judulKebaktian: values.judulKebaktian,
    temaKebaktian: values.temaKebaktian,
    renunganJudul: values.renunganJudul,
    renunganKitab: values.renunganKitab,
    renunganIsi: values.renunganIsi,
    renunganSumber: values.renunganSumber,
  };
}
