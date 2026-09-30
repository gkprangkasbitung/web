"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { DatePicker } from "@/components/shared/date-picker";
import { initialPhotoValue, photoWillExist, PhotoField, type SavedPhoto } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { today, type IsoDate } from "@/lib/dates";
import type { KegiatanRow } from "@/lib/kegiatan";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED, situsPhotoUrl } from "@/lib/situs-photo";

export type KegiatanDialogProps = {
  row: KegiatanRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/**
 * Add dialog (`row` null; new rows start as `draft`) or edit dialog titled
 * with the judul (brief §14.4). Status is changed only through the row's
 * Terbitkan / Tarik ke Draft action, not here.
 */
export function KegiatanDialog({ row, open, onOpenChange, readOnly, onSaved }: KegiatanDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const judulInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [judul, setJudul] = useState(row?.judul ?? "");
  const [tanggal, setTanggal] = useState<IsoDate | null>((row?.tanggal as IsoDate) ?? today());
  const [waktu, setWaktu] = useState(row?.waktu ?? "");
  const [tempat, setTempat] = useState(row?.tempat ?? "");
  const [deskripsi, setDeskripsi] = useState(row?.deskripsi ?? "");
  const saved: SavedPhoto = row?.foto_path && row.foto_alt ? { url: situsPhotoUrl(row.foto_path), alt: row.foto_alt } : null;
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(saved));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altInvalid, setAltInvalid] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const trimmedJudul = judul.trim();
    if (!trimmedJudul) return void setError("Judul wajib diisi.");
    if (!tanggal) return void setError("Tanggal wajib diisi.");
    if (photoWillExist(saved, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      setError(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("judul", trimmedJudul);
    form.append("tanggal", tanggal);
    form.append("waktu", waktu);
    form.append("tempat", tempat);
    form.append("deskripsi", deskripsi);
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
      <DialogContent className="sm:max-w-lg" initialFocus={readOnly ? undefined : judulInput}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tanggal`}>
                Tanggal
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <DatePicker
                id={`${formId}-tanggal`}
                value={tanggal}
                onValueChange={setTanggal}
                clearable={false}
                disabled={readOnly || pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-waktu`}>Waktu</Label>
              <Input
                id={`${formId}-waktu`}
                type="time"
                value={waktu}
                onChange={(event) => setWaktu(event.target.value)}
                disabled={readOnly || pending}
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
