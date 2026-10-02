"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { initialPhotoValue, photoWillExist, PhotoField, type SavedPhoto } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { KomisiListRow } from "@/lib/komisi";
import type { KomisiPersonOption } from "@/lib/komisi-routes";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED, situsPhotoUrl } from "@/lib/situs-photo";

export type KomisiDialogProps = {
  row: KomisiListRow | null;
  pembinaOptions: readonly KomisiPersonOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSaved: () => void;
};

/** Add dialog (`row` null) or edit dialog titled with the nama (brief §14.8). Slug is never shown; it's fixed server-side. */
export function KomisiDialog({ row, pembinaOptions, open, onOpenChange, readOnly, onSaved }: KomisiDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const namaInput = useRef<HTMLInputElement>(null);
  const isEdit = row !== null;

  const [nama, setNama] = useState(row?.nama ?? "");
  const [deskripsi, setDeskripsi] = useState(row?.deskripsi ?? "");
  const [periode, setPeriode] = useState(row?.periode ?? "");
  const [pembinaId, setPembinaId] = useState<string | null>(row?.pembinaJemaatId ?? null);
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
    if (!trimmedNama) return void setError("Nama wajib diisi.");
    if (photoWillExist(saved, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      setError(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("nama", trimmedNama);
    form.append("deskripsi", deskripsi);
    form.append("periode", periode);
    form.append("pembinaJemaatId", pembinaId ?? "");
    form.append("tampil", tampil ? "1" : "0");
    appendPhotoFields(form, photoValue);

    setPending(true);
    setError(null);
    setAltInvalid(false);
    try {
      const endpoint = isEdit ? `/api/admin/komisi/${row.id}` : "/api/admin/komisi";
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
          <DialogTitle className="text-lg font-semibold">{isEdit ? row.nama : "Tambah Komisi"}</DialogTitle>
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
              placeholder="Mis. Komisi Anak"
              maxLength={150}
              required
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

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-periode`}>Periode</Label>
            <Input
              id={`${formId}-periode`}
              value={periode}
              onChange={(event) => setPeriode(event.target.value)}
              placeholder="Mis. 2024–2027"
              maxLength={50}
              disabled={readOnly || pending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-pembina`}>Pembina</Label>
            <PersonPicker
              id={`${formId}-pembina`}
              people={pembinaOptions as readonly PersonOption[]}
              value={pembinaId}
              onValueChange={setPembinaId}
              placeholder="Cari jemaat berlabel Penatua..."
              disabled={readOnly || pending}
            />
            {pembinaOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada jemaat berlabel Penatua. Tambahkan label itu di halaman Label Jemaat dan Data Jemaat.
              </p>
            )}
          </div>

          <PhotoField
            label="Foto"
            saved={saved}
            value={photoValue}
            onValueChange={(next) => {
              const pickedNewFile = next.file && next.file !== photoValue.file;
              if (next.alt !== photoValue.alt) setAltTouched(true);
              const withDefault =
                pickedNewFile && !altTouched && !next.alt.trim() && nama.trim() ? { ...next, alt: nama.trim() } : next;
              setPhotoValue(withDefault);
              if (altInvalid && withDefault.alt.trim()) setAltInvalid(false);
            }}
            disabled={readOnly || pending}
            altHint={nama || "Foto komisi"}
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
