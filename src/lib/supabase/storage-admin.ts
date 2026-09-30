import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * Writes to the `situs` photo bucket (brief §14.5). The bucket has no
 * storage policy at all, so no signed-in user can upload, overwrite, delete,
 * or list through the API; only this module can, with the service role.
 * Approved addition to the service-role uses in brief §3 (stage 11a).
 *
 * The client is never exported and is limited to the `situs` bucket. Callers
 * (lib/situs-photos.ts) check `situs:update` and re-encode the image first.
 */

const BUCKET = "situs";

function storageClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  const { url } = supabaseEnv();
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(BUCKET);
}

/** Uploads a new object. Never overwrites: every path is a fresh random name. */
export async function uploadSitusObject(path: string, data: Buffer, contentType: string): Promise<void> {
  const { error } = await storageClient().upload(path, data, {
    contentType,
    upsert: false,
    // The name is random and the content never changes under it.
    cacheControl: "31536000",
  });
  if (error) throw new Error(`[storage] upload ${path}: ${error.message}`);
}

/** Removes objects; a path that no longer exists is not an error. */
export async function removeSitusObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storageClient().remove(paths);
  if (error) throw new Error(`[storage] remove ${paths.join(", ")}: ${error.message}`);
}

export type SitusObject = { path: string; createdAt: string | null };

/** Every object directly under `folder` (the bucket has no deeper nesting). */
export async function listSitusObjects(folder: string): Promise<SitusObject[]> {
  const client = storageClient();
  const objects: SitusObject[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.list(folder, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`[storage] list ${folder}: ${error.message}`);
    for (const item of data) {
      // Folders come back with a null id.
      if (item.id) objects.push({ path: `${folder}/${item.name}`, createdAt: item.created_at ?? null });
    }
    if (data.length < pageSize) return objects;
  }
}
