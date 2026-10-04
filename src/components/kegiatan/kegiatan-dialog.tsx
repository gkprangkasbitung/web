"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { DatePicker } from "@/components/shared/date-picker";
import { initialPhotoValue, photoWillExist, PhotoField, type SavedPhoto } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { addDays, today, type IsoDate } from "@/lib/dates";
import { formatTanggalRange, formatWaktuRange, type KategoriKegiatanRow, type KegiatanRow } from "@/lib/kegiatan";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED, situsPhotoUrl } from "@/lib/situs-photo";

import { KategoriBadge } from "./kategori-badge";

const NO_PENYELENGGARA = "__none__";

export type KegiatanDialogProps = {
  row: KegiatanRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kategoriOptions: KategoriKegiatanRow[];
  komisiOptions: { id: string; nama: string }[];
  readOnly: boolean;
  onSaved: () => void;
};

/**
 * Add dialog (`row` null; new rows start as `draft`) or edit dialog titled
 * with the judul (brief §14.4). Status is changed only through the row's
 * Terbitkan / Tarik ke Draft action, not here.
 */
export function KegiatanDialog({ row, open, onOpenChange, kategoriOptions, komisiOptions, readOnly, onSaved }: KegiatanDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const judulInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [judul, setJudul] = useState(row?.judul ?? "");
  const [tanggalMulai, setTanggalMulai] = useState<IsoDate | null>(row?.tanggal_mulai ?? today());
  const [tanggalSelesai, setTanggalSelesai] = useState<IsoDate | null>(row?.tanggal_selesai ?? row?.tanggal_mulai ?? today());
  const [sepanjangHari, setSepanjangHari] = useState(!row?.waktu_mulai && !row?.waktu_selesai && isEdit);
  const [waktuMulai, setWaktuMulai] = useState(row?.waktu_mulai ?? "");
  const [waktuSelesai, setWaktuSelesai] = useState(row?.waktu_selesai ?? "");
  const [tempat, setTempat] = useState(row?.tempat ?? "");
  const [mapsUrl, setMapsUrl] = useState(row?.maps_url ?? "");
  const [deskripsi, setDeskripsi] = useState(row?.deskripsi ?? "");
  const [infoPendaftaran, setInfoPendaftaran] = useState(row?.info_pendaftaran ?? "");
  const [kategoriId, setKategoriId] = useState(row?.kategori_id ?? kategoriOptions[0]?.id ?? "");
  const [penyelenggaraId, setPenyelenggaraId] = useState(row?.penyelenggara_komisi_id ?? NO_PENYELENGGARA);
  const saved: SavedPhoto = row?.foto_path && row.foto_alt ? { url: situsPhotoUrl(row.foto_path), alt: row.foto_alt } : null;
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(saved));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altInvalid, setAltInvalid] = useState(false);

  const kategoriItems: SelectOption<string>[] = kategoriOptions.map((k) => ({ value: k.id, label: k.nama }));
  const penyelenggaraItems: SelectOption<string>[] = [
    { value: NO_PENYELENGGARA, label: "Tidak ada" },
    ...komisiOptions.map((k) => ({ value: k.id, label: k.nama })),
  ];
  const kategoriTerpilih = useMemo(() => kategoriOptions.find((k) => k.id === kategoriId) ?? null, [kategoriOptions, kategoriId]);

  function handleSepanjangHariChange(checked: boolean) {
    setSepanjangHari(checked);
    if (checked) {
      setWaktuMulai("");
      setWaktuSelesai("");
    }
  }

  function handleTanggalMulaiChange(value: IsoDate | null) {
    setTanggalMulai(value);
    if (value && tanggalSelesai && tanggalSelesai < value) setTanggalSelesai(value);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const trimmedJudul = judul.trim();
    if (!trimmedJudul) return void setError("Judul wajib diisi.");
    if (!tanggalMulai || !tanggalSelesai) return void setError("Tanggal wajib diisi.");
    if (!kategoriId) return void setError("Kategori wajib dipilih.");
    if (photoWillExist(saved, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      setError(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("judul", trimmedJudul);
    form.append("tanggalMulai", tanggalMulai);
    form.append("tanggalSelesai", tanggalSelesai);
    form.append("waktuMulai", sepanjangHari ? "" : waktuMulai);
    form.append("waktuSelesai", sepanjangHari ? "" : waktuSelesai);
    form.append("tempat", tempat);
    form.append("mapsUrl", mapsUrl);
    form.append("deskripsi", deskripsi);
    form.append("infoPendaftaran", infoPendaftaran);
    form.append("kategoriId", kategoriId);
    form.append("penyelenggaraKomisiId", penyelenggaraId === NO_PENYELENGGARA ? "" : penyelenggaraId);
    appendPhotoFields(form, photoValue);

    setPending(true);
    setError(null);
    setAltInvalid(false);
    try {
      const endpoint = isEdit ? `/api/admin/kegiatan/${row.id}` : "/api/admin/kegiatan";
      await apiFetch(endpoint, { method: isEdit ? "PATCH" : "POST", body: form });
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" initialFocus={readOnly ? undefined : judulInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{isEdit ? row.judul : "Tambah Kegiatan"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-judul`}>
              Judul
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              ref={judulInput}
              id={`${formId}-judul`}
              value={judul}
              onChange={(event) => setJudul(event.target.value)}
              maxLength={200}
              required
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-kategori`}>
              Kategori
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Select items={kategoriItems} value={kategoriId} onValueChange={(value) => value && setKategoriId(value)} disabled={readOnly || pending}>
              <SelectTrigger id={`${formId}-kategori`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kategoriItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tanggal-mulai`}>
                Tanggal mulai
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <DatePicker
                id={`${formId}-tanggal-mulai`}
                value={tanggalMulai}
                onValueChange={handleTanggalMulaiChange}
                clearable={false}
                disabled={readOnly || pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tanggal-selesai`}>
                Tanggal selesai
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <DatePicker
                id={`${formId}-tanggal-selesai`}
                value={tanggalSelesai}
                onValueChange={setTanggalSelesai}
                clearable={false}
                minDate={tanggalMulai ?? undefined}
                maxDate={tanggalMulai ? addDays(tanggalMulai, 30) : undefined}
                disabled={readOnly || pending}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-sepanjang-hari`}
              checked={sepanjangHari}
              onCheckedChange={(checked) => handleSepanjangHariChange(checked === true)}
              disabled={readOnly || pending}
            />
            <Label htmlFor={`${formId}-sepanjang-hari`}>Sepanjang hari</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-waktu-mulai`}>Waktu mulai</Label>
              <Input
                id={`${formId}-waktu-mulai`}
                type="time"
                value={waktuMulai}
                onChange={(event) => setWaktuMulai(event.target.value)}
                disabled={readOnly || pending || sepanjangHari}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-waktu-selesai`}>Waktu selesai</Label>
              <Input
                id={`${formId}-waktu-selesai`}
                type="time"
                value={waktuSelesai}
                onChange={(event) => setWaktuSelesai(event.target.value)}
                disabled={readOnly || pending || sepanjangHari}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-tempat`}>Tempat</Label>
            <Input
              id={`${formId}-tempat`}
              value={tempat}
              onChange={(event) => setTempat(event.target.value)}
              maxLength={200}
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-maps`}>Link Google Maps</Label>
            <Input
              id={`${formId}-maps`}
              type="url"
              value={mapsUrl}
              onChange={(event) => setMapsUrl(event.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-penyelenggara`}>Penyelenggara</Label>
            <Select
              items={penyelenggaraItems}
              value={penyelenggaraId}
              onValueChange={(value) => value && setPenyelenggaraId(value)}
              disabled={readOnly || pending}
            >
              <SelectTrigger id={`${formId}-penyelenggara`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {penyelenggaraItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-deskripsi`}>Deskripsi</Label>
            <Textarea
              id={`${formId}-deskripsi`}
              value={deskripsi}
              onChange={(event) => setDeskripsi(event.target.value)}
              rows={3}
              maxLength={2000}
              disabled={readOnly || pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-info-pendaftaran`}>Info pendaftaran</Label>
            <Textarea
              id={`${formId}-info-pendaftaran`}
              value={infoPendaftaran}
              onChange={(event) => setInfoPendaftaran(event.target.value)}
              rows={2}
              maxLength={2000}
              disabled={readOnly || pending}
              placeholder="Batas waktu, biaya bila ada, dan narahubung."
            />
          </div>

          <PhotoField
            label="Foto"
            saved={saved}
            value={photoValue}
            onValueChange={(next) => {
              setPhotoValue(next);
              if (altInvalid && next.alt.trim()) setAltInvalid(false);
            }}
            disabled={readOnly || pending}
            altHint={`Foto kegiatan ${judul || ""}`.trim()}
            invalid={altInvalid}
            errorId={errorId}
          />

          {kategoriTerpilih && tanggalMulai && tanggalSelesai && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Pratinjau di kalender</span>
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <KategoriBadge nama={kategoriTerpilih.nama} warna={kategoriTerpilih.warna} className="self-start" />
                <span className="font-medium">{judul || "(Judul kegiatan)"}</span>
                <span className="text-sm text-muted-foreground">
                  {formatTanggalRange(tanggalMulai, tanggalSelesai)} · {formatWaktuRange(sepanjangHari ? null : waktuMulai || null, sepanjangHari ? null : waktuSelesai || null)}
                </span>
              </div>
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
                {isEdit ? "Simpan" : "Tambah"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
