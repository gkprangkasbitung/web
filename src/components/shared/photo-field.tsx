"use client";

import { ImageIcon, Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareUpload, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { ACCEPTED_PHOTO_TYPES, MAX_ALT_LENGTH, MAX_PHOTO_MB } from "@/lib/situs-photo";

export type { PhotoFieldValue } from "@/lib/photo-upload-client";

/** The photo saved now, if any: its public URL and alt text. */
export type SavedPhoto = { url: string; alt: string } | null;

export function initialPhotoValue(saved: SavedPhoto): PhotoFieldValue {
  return { file: null, alt: saved?.alt ?? "", remove: false };
}

/** Whether the slot will hold a photo once saved, so its alt text is required. */
export function photoWillExist(saved: SavedPhoto, value: PhotoFieldValue): boolean {
  return !value.remove && (value.file !== null || saved !== null);
}

/**
 * One photo in a site-content form (brief §14.5), saved with the rest of the
 * form: choose, replace, or remove the photo, and give it alt text
 * (required whenever there is a photo). The chosen file is only checked
 * and, if needed, shrunk here; the server validates and re-encodes it.
 */
export function PhotoField({
  label,
  saved,
  value,
  onValueChange,
  disabled = false,
  altHint,
  invalid = false,
  errorId,
}: {
  label: string;
  saved: SavedPhoto;
  value: PhotoFieldValue;
  onValueChange: (value: PhotoFieldValue) => void;
  disabled?: boolean;
  /** An example alt text, e.g. "Gedung gereja tampak depan". */
  altHint?: string;
  /** Marks the alt text input invalid (the form's error names it). */
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // The object URL is created in the change handler; this only releases it.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const shownUrl = value.remove ? null : (preview ?? saved?.url ?? null);
  const hasPhoto = photoWillExist(saved, value);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setFileError(null);
    setPreparing(true);
    try {
      const file = await prepareUpload(chosen);
      setPreview(URL.createObjectURL(file));
      onValueChange({ ...value, file, remove: false });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "File foto tidak bisa dipakai.");
    } finally {
      setPreparing(false);
    }
  }

  function clearChosen() {
    setPreview(null);
    setFileError(null);
    onValueChange({ ...value, file: null });
  }

  function remove() {
    setPreview(null);
    setFileError(null);
    onValueChange({ ...value, file: null, remove: true });
  }

  const describedBy = [`${id}-help`, fileError ? `${id}-file-error` : null, invalid ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{label}</legend>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-56">
          {shownUrl ? (
            // A blob: preview or the bucket's public URL; next/image can't take blob: URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownUrl} alt={value.alt || saved?.alt || ""} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <ImageIcon aria-hidden className="size-5" />
              <span>{value.remove ? "Foto akan dihapus" : "Belum ada foto"}</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            JPEG, PNG, atau WebP, maksimal {MAX_PHOTO_MB} MB. Metadata foto, termasuk lokasi GPS, dihapus otomatis.
          </p>

          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                id={`${id}-file`}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={choose}
              />
              <Button
                type="button"
                variant="outline"
                disabled={preparing}
                focusableWhenDisabled
                aria-describedby={describedBy}
                onClick={() => fileInput.current?.click()}
              >
                {preparing && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                {hasPhoto ? "Ganti Foto" : "Pilih Foto"}
              </Button>
              {value.file && (
                <Button type="button" variant="ghost" onClick={clearChosen}>
                  Batalkan foto baru
                </Button>
              )}
              {!value.file && saved && !value.remove && (
                <Button type="button" variant="outline" onClick={remove}>
                  Hapus Foto
                </Button>
              )}
              {value.remove && (
                <Button type="button" variant="ghost" onClick={() => onValueChange({ ...value, remove: false })}>
                  Batal hapus
                </Button>
              )}
            </div>
          )}

          {value.file && <p className="text-sm text-muted-foreground">Foto baru dipilih. Simpan untuk menerapkannya.</p>}
          {value.remove && <p className="text-sm text-muted-foreground">Foto akan dihapus saat kamu menyimpan.</p>}
          {fileError && (
            <p id={`${id}-file-error`} role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}

          {hasPhoto && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-alt`}>
                Teks alternatif
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <Input
                id={`${id}-alt`}
                value={value.alt}
                onChange={(event) => onValueChange({ ...value, alt: event.target.value })}
                maxLength={MAX_ALT_LENGTH}
                required
                aria-invalid={invalid || undefined}
                aria-describedby={[`${id}-alt-help`, invalid ? errorId : null].filter(Boolean).join(" ")}
                autoComplete="off"
              />
              <p id={`${id}-alt-help`} className="text-sm text-muted-foreground">
                Jelaskan isi foto untuk pengunjung yang memakai pembaca layar{altHint ? `, mis. "${altHint}"` : ""}.
              </p>
            </div>
          )}
        </div>
      </div>
    </fieldset>
  );
}
