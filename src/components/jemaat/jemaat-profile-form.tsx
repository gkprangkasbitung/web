"use client";

import { useId } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { KeluargaCombobox } from "@/components/shared/keluarga-combobox";
import { LabelMultiSelect } from "@/components/shared/label-multi-select";
import { PhoneInput } from "@/components/shared/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { IsoDate } from "@/lib/dates";
import {
  HUBUNGAN_KELUARGA,
  JENIS_KELAMIN,
  JENIS_KELAMIN_LABELS,
  STATUS_KEANGGOTAAN,
  STATUS_KEANGGOTAAN_LABELS,
  type HubunganKeluarga,
  type JenisKelamin,
  type StatusKeanggotaan,
} from "@/lib/jemaat";

export type JemaatProfileValues = {
  nama: string;
  nomorAnggota: string;
  jenisKelamin: JenisKelamin | null;
  statusKeanggotaan: StatusKeanggotaan | null;
  wilayahId: string | null;
  pekerjaan: string;
  alamat: string;
  noHp: string;
  tanggalLahir: IsoDate | null;
  tanggalMasuk: IsoDate | null;
  keluargaNama: string;
  hubunganKeluarga: HubunganKeluarga | null;
  labelIds: string[];
};

export function emptyJemaatProfile(): JemaatProfileValues {
  return {
    nama: "",
    nomorAnggota: "",
    jenisKelamin: null,
    statusKeanggotaan: null,
    wilayahId: null,
    pekerjaan: "",
    alamat: "",
    noHp: "",
    tanggalLahir: null,
    tanggalMasuk: null,
    keluargaNama: "",
    hubunganKeluarga: null,
    labelIds: [],
  };
}

export type JemaatProfileFormProps = {
  formId: string;
  values: JemaatProfileValues;
  onValuesChange: (values: JemaatProfileValues) => void;
  wilayahOptions: readonly { id: string; nama: string }[];
  keluargaSuggestions: readonly string[];
  labelOptions: readonly { id: string; nama: string }[];
  disabled?: boolean;
  onSubmit: () => void;
  invalidField?: string | null;
  errorId?: string;
};

/** The jemaat profile fields (brief §9.9), shared by the add dialog and the detail page. */
export function JemaatProfileForm({
  formId,
  values,
  onValuesChange,
  wilayahOptions,
  keluargaSuggestions,
  labelOptions,
  disabled = false,
  onSubmit,
  invalidField,
  errorId,
}: JemaatProfileFormProps) {
  const id = useId();

  function set<K extends keyof JemaatProfileValues>(key: K, value: JemaatProfileValues[K]) {
    onValuesChange({ ...values, [key]: value });
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
      aria-describedby={errorId}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-nama`}>
          Nama{" "}
          {!disabled && (
            <span className="text-muted-foreground" aria-hidden>
              *
            </span>
          )}
        </Label>
        <Input
          id={`${id}-nama`}
          autoFocus={!disabled}
          value={values.nama}
          onChange={(event) => set("nama", event.target.value)}
          required
          disabled={disabled}
          aria-invalid={invalidField === "nama" || undefined}
          aria-describedby={invalidField === "nama" ? errorId : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-nomor`}>No. Anggota</Label>
          <Input
            id={`${id}-nomor`}
            value={values.nomorAnggota}
            onChange={(event) => set("nomorAnggota", event.target.value)}
            placeholder="mis. RB-0142"
            disabled={disabled}
            aria-invalid={invalidField === "nomorAnggota" || undefined}
            aria-describedby={invalidField === "nomorAnggota" ? errorId : undefined}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-jk`}>Jenis Kelamin</Label>
          <Select value={values.jenisKelamin} onValueChange={(next) => set("jenisKelamin", next)} disabled={disabled}>
            <SelectTrigger id={`${id}-jk`} className="w-full">
              <SelectValue placeholder="Pilih jenis kelamin" />
            </SelectTrigger>
            <SelectContent>
              {JENIS_KELAMIN.map((value) => (
                <SelectItem key={value} value={value}>
                  {JENIS_KELAMIN_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-status`}>Status Keanggotaan</Label>
          <Select
            value={values.statusKeanggotaan}
            onValueChange={(next) => set("statusKeanggotaan", next)}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-status`} className="w-full">
              <SelectValue placeholder="Pilih status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_KEANGGOTAAN.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_KEANGGOTAAN_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-wilayah`}>Wilayah</Label>
          <Select value={values.wilayahId} onValueChange={(next) => set("wilayahId", next)} disabled={disabled}>
            <SelectTrigger id={`${id}-wilayah`} className="w-full">
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
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-pekerjaan`}>Pekerjaan</Label>
        <Input
          id={`${id}-pekerjaan`}
          value={values.pekerjaan}
          onChange={(event) => set("pekerjaan", event.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-alamat`}>Alamat</Label>
        <Textarea
          id={`${id}-alamat`}
          value={values.alamat}
          onChange={(event) => set("alamat", event.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-hp`}>Nomor HP/WA</Label>
          <PhoneInput id={`${id}-hp`} value={values.noHp} onValueChange={(value) => set("noHp", value)} disabled={disabled} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-lahir`}>Tanggal Lahir</Label>
          <DatePicker
            id={`${id}-lahir`}
            value={values.tanggalLahir}
            onValueChange={(value) => set("tanggalLahir", value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-masuk`}>Tanggal Masuk</Label>
          <DatePicker
            id={`${id}-masuk`}
            value={values.tanggalMasuk}
            onValueChange={(value) => set("tanggalMasuk", value)}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-hubungan`}>Hubungan dalam Keluarga</Label>
          <Select
            value={values.hubunganKeluarga}
            onValueChange={(next) => set("hubunganKeluarga", next)}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-hubungan`} className="w-full">
              <SelectValue placeholder="Pilih hubungan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Tidak ada</SelectItem>
              {HUBUNGAN_KELUARGA.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-keluarga`}>Nama Keluarga</Label>
        <KeluargaCombobox
          id={`${id}-keluarga`}
          suggestions={keluargaSuggestions}
          value={values.keluargaNama}
          onValueChange={(value) => set("keluargaNama", value)}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-label`}>Label</Label>
        <LabelMultiSelect
          id={`${id}-label`}
          labels={labelOptions}
          value={values.labelIds}
          onValueChange={(ids) => set("labelIds", ids)}
          disabled={disabled}
        />
      </div>
    </form>
  );
}
