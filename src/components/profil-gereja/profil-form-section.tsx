"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { PhoneInput } from "@/components/shared/phone-input";
import { PhotoField, initialPhotoValue, photoWillExist, type SavedPhoto } from "@/components/shared/photo-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED } from "@/lib/situs-photo";

import { ProfilSection } from "./profil-section";

export type FieldConfig = {
  /** The request body key, e.g. "heroJudul". */
  key: string;
  label: string;
  kind: "text" | "textarea" | "phone" | "email" | "url";
  maxLength: number;
  rows?: number;
  placeholder?: string;
  help?: string;
};

export type FormValues = Record<string, string>;

export type PhotoConfig = {
  label: string;
  saved: SavedPhoto;
  altHint?: string;
  /** The photo is shown but can't be changed (e.g. QRIS without situs:update). */
  locked?: boolean;
};

/**
 * One Profil Gereja section (brief §14.1): its fields, an optional photo,
 * and one "Simpan". With a photo the request is multipart (text fields and
 * the file together, one request); otherwise JSON. After a save, the form
 * takes its values back from the server's response (e.g. a normalized URL).
 */
export function ProfilFormSection<TRow>({
  title,
  description,
  endpoint,
  fields,
  initialValues,
  photo,
  canWrite,
  readOnlyNote,
  successMessage,
  validate,
  fromResponse,
}: {
  title: string;
  description?: React.ReactNode;
  endpoint: string;
  fields: FieldConfig[];
  initialValues: FormValues;
  photo?: PhotoConfig;
  canWrite: boolean;
  /** Shown instead of the Simpan button when the user can only look. */
  readOnlyNote?: string;
  successMessage: string;
  /** A client-side problem, or null. The server validates again. */
  validate?: (values: FormValues) => string | null;
  fromResponse: (row: TRow) => { values: FormValues; photo?: SavedPhoto };
}) {
  const router = useRouter();
  const id = useId();
  const errorId = `${id}-error`;
  const [values, setValues] = useState<FormValues>(initialValues);
  const [savedPhoto, setSavedPhoto] = useState<SavedPhoto>(photo?.saved ?? null);
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(photo?.saved ?? null));
  // Remounts PhotoField after each save, dropping its local preview.
  const [photoKey, setPhotoKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altInvalid, setAltInvalid] = useState(false);

  const disabled = !canWrite || pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;

    const problem = validate?.(values) ?? null;
    const altMissing = photo !== undefined && photoWillExist(savedPhoto, photoValue) && !photoValue.alt.trim();
    if (problem || altMissing) {
      setError(problem ?? PHOTO_ALT_REQUIRED);
      setAltInvalid(!problem && altMissing);
      return;
    }

    let body: FormData | FormValues = values;
    if (photo) {
      const form = new FormData();
      for (const [key, value] of Object.entries(values)) form.append(key, value);
      appendPhotoFields(form, photoValue);
      body = form;
    }

    setPending(true);
    setError(null);
    setAltInvalid(false);
    try {
      const row = await apiFetch<TRow>(endpoint, { method: "PATCH", body });
      const next = fromResponse(row);
      setValues(next.values);
      if (photo) {
        const nextPhoto = next.photo ?? null;
        setSavedPhoto(nextPhoto);
        setPhotoValue(initialPhotoValue(nextPhoto));
        setPhotoKey((key) => key + 1);
      }
      toast.success(successMessage);
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <ProfilSection title={title} description={description}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5" aria-describedby={error ? errorId : undefined}>
        {fields.map((field) => {
          const inputId = `${id}-${field.key}`;
          const helpId = field.help ? `${inputId}-help` : undefined;
          const common = {
            id: inputId,
            disabled,
            maxLength: field.maxLength,
            placeholder: field.placeholder,
            "aria-describedby": helpId,
          };
          const set = (value: string) => setValues((current) => ({ ...current, [field.key]: value }));
          return (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={inputId}>{field.label}</Label>
              {field.kind === "textarea" ? (
                <Textarea {...common} rows={field.rows ?? 4} value={values[field.key] ?? ""} onChange={(e) => set(e.target.value)} />
              ) : field.kind === "phone" ? (
                <PhoneInput {...common} value={values[field.key] ?? ""} onValueChange={set} />
              ) : (
                <Input
                  {...common}
                  type={field.kind === "text" ? "text" : field.kind}
                  inputMode={field.kind === "url" ? "url" : field.kind === "email" ? "email" : undefined}
                  autoComplete="off"
                  value={values[field.key] ?? ""}
                  onChange={(e) => set(e.target.value)}
                />
              )}
              {field.help && (
                <p id={helpId} className="text-sm text-muted-foreground">
                  {field.help}
                </p>
              )}
            </div>
          );
        })}

        {photo && (
          <PhotoField
            key={photoKey}
            label={photo.label}
            saved={savedPhoto}
            value={photoValue}
            onValueChange={(next) => {
              setPhotoValue(next);
              if (altInvalid && next.alt.trim()) setAltInvalid(false);
            }}
            disabled={disabled || photo.locked}
            altHint={photo.altHint}
            invalid={altInvalid}
            errorId={errorId}
          />
        )}

        <FormError id={errorId} message={error} />

        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
          </div>
        ) : (
          readOnlyNote && <p className="text-sm text-muted-foreground">{readOnlyNote}</p>
        )}
      </form>
    </ProfilSection>
  );
}
