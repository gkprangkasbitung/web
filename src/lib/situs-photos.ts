import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ApiError } from "@/lib/api-mutation";
import { InvalidImageError, processImage } from "@/lib/image-processing";
import { MAX_ALT_LENGTH, MAX_PHOTO_BYTES, PHOTO_ALT_REQUIRED, PHOTO_TOO_LARGE, photoFieldNames } from "@/lib/situs-photo";
import type { ServerSupabase } from "@/lib/supabase/server";
import { listSitusObjects, removeSitusObjects, uploadSitusObject } from "@/lib/supabase/storage-admin";

/**
 * One photo slot in a site-content form (brief §14.5), saved together with
 * the form's other fields in one request ("one Simpan per section"):
 *
 * 1. validate and re-encode the new file (lib/image-processing.ts);
 * 2. upload it under a fresh random name;
 * 3. write the row (the caller's `write`);
 * 4. if the write fails, delete the new object again;
 * 5. if it succeeds, delete the old object, unless a row still refers to it;
 * 6. sweep: delete objects no row refers to (older than a grace period),
 *    which catches whatever steps 4-5 couldn't (a failed delete, a crash
 *    between steps, a path cleared through REST).
 *
 * Steps 4-6 never fail the request: the row is already right, and a leftover
 * object is only wasted space until the next sweep. An object is never
 * deleted while a row refers to it, and the database refuses a path whose
 * object doesn't exist (0029), so a reference can't break either way.
 */

/** Top-level folders in the bucket, one per module. */
const SITUS_FOLDERS = ["profil", "majelis", "kegiatan", "pendeta", "komisi"] as const;
export type SitusFolder = (typeof SITUS_FOLDERS)[number];

/** In-flight uploads (step 2 done, step 3 not yet) are younger than this. */
const SWEEP_GRACE_MS = 15 * 60 * 1000;

/** Multipart body limit for a form with one photo: the file plus its text fields. */
export const PHOTO_FORM_MAX_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
export const PHOTO_FORM_MULTIPART = { maxBytes: PHOTO_FORM_MAX_BYTES, tooLarge: PHOTO_TOO_LARGE } as const;

const FIELDS = photoFieldNames("foto");

const photoSlotSchema = z.object({
  // A form's empty file input still sends a nameless, zero-byte File.
  file: z
    .instanceof(File)
    .optional()
    .transform((file) => (file && file.size > 0 ? file : null))
    .refine((file) => !file || file.size <= MAX_PHOTO_BYTES, PHOTO_TOO_LARGE),
  alt: z
    .string({ error: "Data yang dikirim tidak valid." })
    .trim()
    .max(MAX_ALT_LENGTH, `Teks alternatif maksimal ${MAX_ALT_LENGTH} karakter.`)
    .optional()
    .transform((value) => value || null),
  remove: z
    .enum(["1"])
    .optional()
    .transform((value) => value === "1"),
});

export type PhotoSlotInput = z.infer<typeof photoSlotSchema>;

/**
 * A multipart form schema: `shape` for the text fields, plus `foto` built
 * from the `foto_file` / `foto_alt` / `foto_hapus` fields (see PhotoField).
 */
export function withPhotoSlot<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess(
    (raw) => {
      if (typeof raw !== "object" || raw === null) return raw;
      const fields = raw as Record<string, unknown>;
      return { ...fields, foto: { file: fields[FIELDS.file], alt: fields[FIELDS.alt], remove: fields[FIELDS.remove] } };
    },
    z.object({ ...shape, foto: photoSlotSchema }),
  );
}

export type StoredPhoto = { path: string; alt: string };
export type PhotoChange = "none" | "alt" | "added" | "replaced" | "removed";

/** Decides the slot's next value; throws a 400 for a missing alt text. */
function nextPhoto(slot: PhotoSlotInput, current: StoredPhoto | null): "upload" | StoredPhoto | null {
  if (slot.remove) return null;
  if (slot.file) {
    if (!slot.alt) throw new ApiError(400, PHOTO_ALT_REQUIRED);
    return "upload";
  }
  if (!current) return null;
  if (!slot.alt) throw new ApiError(400, PHOTO_ALT_REQUIRED);
  return { path: current.path, alt: slot.alt };
}

/**
 * Saves a row with one photo slot, following steps 1-6 above. `write`
 * receives the slot's next value and performs the database write; it
 * throws to fail the request (e.g. `dbError(...)`).
 */
export async function savePhotoSlot<T>({
  supabase,
  folder,
  slot,
  current,
  write,
}: {
  supabase: ServerSupabase;
  folder: SitusFolder;
  slot: PhotoSlotInput;
  current: StoredPhoto | null;
  write: (photo: StoredPhoto | null) => Promise<T>;
}): Promise<{ result: T; change: PhotoChange }> {
  const decided = nextPhoto(slot, current);

  let uploadedPath: string | null = null;
  let next: StoredPhoto | null;
  if (decided === "upload") {
    let image;
    try {
      image = await processImage(new Uint8Array(await slot.file!.arrayBuffer()));
    } catch (error) {
      if (error instanceof InvalidImageError) throw new ApiError(400, error.message);
      throw error;
    }
    uploadedPath = `${folder}/${randomUUID()}.${image.extension}`;
    await uploadSitusObject(uploadedPath, image.data, image.contentType);
    next = { path: uploadedPath, alt: slot.alt! };
  } else {
    next = decided;
  }

  let result: T;
  try {
    result = await write(next);
  } catch (error) {
    if (uploadedPath) await removeQuietly([uploadedPath], "rollback");
    throw error;
  }

  if (current && current.path !== next?.path) {
    await removeUnreferenced(supabase, [current.path]);
  }
  await sweepSitusOrphans(supabase);

  let change: PhotoChange = "none";
  if (uploadedPath) change = current ? "replaced" : "added";
  else if (current && !next) change = "removed";
  else if (current && next && current.alt !== next.alt) change = "alt";
  return { result, change };
}

/**
 * Deletes one row's photo object right away, for a delete route (Majelis,
 * Kegiatan, §14.2-14.4): unlike `savePhotoSlot`'s old-object cleanup, there
 * is no new row left that could still reference this exact random path, so
 * no `situs_referenced_photo_paths` check is needed first. Never throws.
 */
export async function deletePhotoObject(path: string | null): Promise<void> {
  if (path) await removeQuietly([path], "row delete");
}

async function removeQuietly(paths: string[], reason: string): Promise<void> {
  try {
    await removeSitusObjects(paths);
  } catch (error) {
    // Left for the next sweep.
    console.error(`[situs-photos] ${reason} failed:`, error);
  }
}

async function referencedPaths(supabase: ServerSupabase): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc("situs_referenced_photo_paths");
  if (error) {
    console.error("[situs-photos] situs_referenced_photo_paths failed:", error.message);
    return null;
  }
  return new Set(data);
}

/** Deletes the given objects, except any a row still refers to. */
async function removeUnreferenced(supabase: ServerSupabase, paths: string[]): Promise<void> {
  const referenced = await referencedPaths(supabase);
  // Unknown: keep everything rather than risk a broken reference.
  if (!referenced) return;
  const unused = paths.filter((path) => !referenced.has(path));
  if (unused.length > 0) await removeQuietly(unused, "removing the old photo");
}

/** Deletes every object no row refers to, once it is older than the grace period. */
export async function sweepSitusOrphans(supabase: ServerSupabase, now = Date.now()): Promise<void> {
  try {
    const referenced = await referencedPaths(supabase);
    if (!referenced) return;
    const orphans: string[] = [];
    for (const folder of SITUS_FOLDERS) {
      for (const object of await listSitusObjects(folder)) {
        const created = object.createdAt ? Date.parse(object.createdAt) : Number.NaN;
        if (!referenced.has(object.path) && Number.isFinite(created) && now - created > SWEEP_GRACE_MS) {
          orphans.push(object.path);
        }
      }
    }
    if (orphans.length > 0) await removeQuietly(orphans, "sweep");
  } catch (error) {
    console.error("[situs-photos] sweep failed:", error);
  }
}
