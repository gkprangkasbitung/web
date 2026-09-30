/**
 * Browser-side preparation of a photo before upload (brief §14.5). Only UX:
 * the server checks the magic bytes, the size, and re-encodes everything.
 */

import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_EDGE,
  PHOTO_BAD_TYPE,
  PHOTO_TOO_LARGE,
  UPLOAD_SAFE_BYTES,
  photoFieldNames,
} from "@/lib/situs-photo";

/** A photo slot's state in a form: a new file, the alt text, and whether to remove the photo. */
export type PhotoFieldValue = { file: File | null; alt: string; remove: boolean };

export function isAcceptedPhotoType(type: string): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type);
}

/** Adds the slot's `foto_*` fields (see `withPhotoSlot` on the server). */
export function appendPhotoFields(form: FormData, value: PhotoFieldValue): void {
  const names = photoFieldNames("foto");
  if (value.file) form.append(names.file, value.file, value.file.name);
  form.append(names.alt, value.alt);
  if (value.remove) form.append(names.remove, "1");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

async function shrink(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("File foto rusak atau tidak bisa dibaca.");
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // WebP and JPEG keep their type; a PNG that is still too big becomes a JPEG.
  for (const type of file.type === "image/png" ? ["image/png", "image/jpeg"] : [file.type]) {
    const blob = await canvasToBlob(canvas, type);
    if (blob && blob.size <= UPLOAD_SAFE_BYTES) {
      const extension = type === "image/jpeg" ? "jpg" : type.slice("image/".length);
      return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "foto"}.${extension}`, { type });
    }
  }
  throw new Error("Foto terlalu besar untuk diunggah. Perkecil ukuran foto lalu coba lagi.");
}

/**
 * Checks a chosen file and, when it is larger than the hosting platform's
 * request limit allows, shrinks it to at most MAX_PHOTO_EDGE in the browser.
 * Throws an Error with a message for the user.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (!isAcceptedPhotoType(file.type)) throw new Error(PHOTO_BAD_TYPE);
  if (file.size > MAX_PHOTO_BYTES) throw new Error(PHOTO_TOO_LARGE);
  if (file.size <= UPLOAD_SAFE_BYTES) return file;
  return shrink(file);
}
