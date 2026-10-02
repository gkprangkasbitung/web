"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { initialPhotoValue, photoWillExist, PhotoField, type SavedPhoto } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { currentYearJakarta, PENDETA_TAHUN_MIN, type PendetaRow } from "@/lib/pendeta";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED, situsPhotoUrl } from "@/lib/situs-photo";

export type PendetaDialogProps = {
  row: PendetaRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/** Add dialog (`row` null) or edit dialog titled with the nama (brief §14.7). */
export function PendetaDialog({ row, open, onOpenChange, readOnly, onSaved }: PendetaDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;
  const currentYear = currentYearJakarta();

  const [nama, setNama] = useState(row?.nama ?? "");
  const [peran, setPeran] = useState(row?.peran ?? "");
  const [tahunMulai, setTahunMulai] = useState(row ? String(row.tahun_mulai) : "");
  const [masihMelayani, setMasihMelayani] = useState(row ? row.tahun_selesai === null : true);
  const [tahunSelesai, setTahunSelesai] = useState(row?.tahun_selesai ? String(row.tahun_selesai) : "");
  const [keterangan, setKeterangan] = useState(row?.keterangan ?? "");
  const [tampil, setTampil] = useState(row?.tampil ?? true);
  const saved: SavedPhoto = row?.foto_path && row.foto_alt ? { url: situsPhotoUrl(row.foto_path), alt: row.foto_alt } : null;
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(saved));
  const [altTouched, setAltTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altInvalid, setAltInvalid] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;

    const trimmedNama = nama.trim();
    const trimmedPeran = peran.trim();
    if (!trimmedNama) return void setError("Nama wajib diisi.");
    if (!trimmedPeran) return void setError("Peran wajib diisi.");
    if (!tahunMulai) return void setError("Tahun mulai wajib diisi.");
    if (!masihMelayani && !tahunSelesai) return void setError("Tahun selesai wajib diisi, atau centang “Masih melayani”.");
    if (photoWillExist(saved, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      setError(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("nama", trimmedNama);
    form.append("peran", trimmedPeran);
    form.append("tahunMulai", tahunMulai);
    form.append("tahunSelesai", masihMelayani ? "" : tahunSelesai);
    form.append("keterangan", keterangan);
    form.append("tampil", tampil ? "1" : "0");
    appendPhotoFields(form, photoValue);

    setPending(true);
    setError(null);
    setAltInvalid(false);
    try {
      const endpoint = isEdit ? `/api/admin/pendeta/${row.id}` : "/api/admin/pendeta";
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
      <DialogContent className="sm:max-w-lg" initialFocus={readOnly ? undefined : namaInput}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{isEdit ? row.nama : "Tambah Pendeta"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-nama`}>
              Nama
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              ref={namaInput}
              id={`${formId}-nama`}
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              placeholder="Mis. Pdt. Contoh Nama"
              maxLength={200}
              required
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-peran`}>
              Peran
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id={`${formId}-peran`}
              value={peran}
              onChange={(event) => setPeran(event.target.value)}
              placeholder="Mis. Pendeta Jemaat"
              maxLength={200}
              required
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tahun-mulai`}>
                Tahun mulai
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <Input
                id={`${formId}-tahun-mulai`}
                type="number"
                inputMode="numeric"
                value={tahunMulai}
                onChange={(event) => setTahunMulai(event.target.value)}
                min={PENDETA_TAHUN_MIN}
                max={currentYear}
                maxLength={4}
                required
                disabled={readOnly || pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-tahun-selesai`}>Tahun selesai</Label>
              <Input
                id={`${formId}-tahun-selesai`}
                type="number"
                inputMode="numeric"
                value={tahunSelesai}
                onChange={(event) => setTahunSelesai(event.target.value)}
                min={PENDETA_TAHUN_MIN}
                max={currentYear}
                maxLength={4}
                disabled={readOnly || pending || masihMelayani}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-masih-melayani`}
              checked={masihMelayani}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setMasihMelayani(next);
                if (next) setTahunSelesai("");
              }}
              disabled={readOnly || pending}
            />
            <Label htmlFor={`${formId}-masih-melayani`}>Masih melayani</Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-keterangan`}>Keterangan</Label>
            <Textarea
              id={`${formId}-keterangan`}
              value={keterangan}
              onChange={(event) => setKeterangan(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={readOnly || pending}
            />
          </div>

          <PhotoField
            label="Foto"
            saved={saved}
            value={photoValue}
            onValueChange={(next) => {
              // Default the alt text to the pastor's name (brief §14.7), once,
              // for a freshly chosen file, only while the admin hasn't typed
              // their own alt text yet.
              const pickedNewFile = next.file && next.file !== photoValue.file;
              if (next.alt !== photoValue.alt) setAltTouched(true);
              const withDefault =
                pickedNewFile && !altTouched && !next.alt.trim() && nama.trim() ? { ...next, alt: nama.trim() } : next;
              setPhotoValue(withDefault);
              if (altInvalid && withDefault.alt.trim()) setAltInvalid(false);
            }}
            disabled={readOnly || pending}
            altHint={nama || "Foto pendeta"}
            invalid={altInvalid}
            errorId={errorId}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-tampil`}
              checked={tampil}
              onCheckedChange={(checked) => setTampil(checked === true)}
              disabled={readOnly || pending}
            />
            <Label htmlFor={`${formId}-tampil`}>Tampil di situs</Label>
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
