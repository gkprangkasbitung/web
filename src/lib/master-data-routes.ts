import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { fail, ok } from "@/lib/api";
import { ApiError, dbError, escapeLike, mutation, type RevalidateTarget } from "@/lib/api-mutation";
import { requirePermissionApi } from "@/lib/auth/session";
import { fieldRequiredMessage, type MasterDataConfig, type MasterDataRow } from "@/lib/master-data";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

type MasterDataInput = { nama: string; keterangan?: string | null };

/**
 * The three tables differ only in whether they have `keterangan`, which the
 * config's fields decide. The client is typed against `tempat` (the widest
 * shape) so one implementation serves all three.
 */
function from(supabase: ServerSupabase, config: MasterDataConfig) {
  return supabase.from(config.table as "tempat");
}

function toRow(row: { id: string; nama: string; keterangan?: string | null; sort_order: number }): MasterDataRow {
  return { id: row.id, nama: row.nama, keterangan: row.keterangan ?? null, sort_order: row.sort_order };
}

function inputSchema(config: MasterDataConfig): z.ZodType<MasterDataInput> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of config.fields) {
    shape[field.name] = field.required
      ? requiredText(fieldRequiredMessage(field), field.maxLength)
      : optionalText(field.maxLength);
  }
  return z.object(shape) as unknown as z.ZodType<MasterDataInput>;
}

function revalidateTargets(config: MasterDataConfig): RevalidateTarget[] {
  return [config.pagePath, ...config.revalidateLayouts.map((path) => ({ path, type: "layout" as const }))];
}

/** Default order (brief §9.8): sort_order, then insertion order for rows that share one. */
export async function listMasterData(supabase: ServerSupabase, config: MasterDataConfig) {
  return from(supabase, config)
    .select("*")
    .order("sort_order")
    .order("created_at")
    .order("id")
    .then(({ data, error }) => ({ data: data?.map(toRow) ?? null, error }));
}

/** Refuses a name already used by another row, ignoring case (labels only). */
async function assertNamaAvailable(supabase: ServerSupabase, config: MasterDataConfig, nama: string, exceptId?: string) {
  if (!config.uniqueNamaMessage) return;
  let query = from(supabase, config).select("id").ilike("nama", escapeLike(nama)).limit(1);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query;
  if (error) throw dbError(error);
  if (data.length > 0) throw new ApiError(400, config.uniqueNamaMessage);
}

/**
 * New rows go last. max + 1 rather than the row count, because after a delete
 * the count can be lower than an existing sort_order. Two concurrent adds can
 * still get the same value; the created_at tie-break keeps both last.
 */
async function nextSortOrder(supabase: ServerSupabase, config: MasterDataConfig): Promise<number> {
  const { data, error } = await from(supabase, config)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? data.sort_order + 1 : 0;
}

/** GET + POST for `/api/admin/{module}`. */
export function masterDataCollectionRoutes(config: MasterDataConfig) {
  const schema = inputSchema(config);
  const dbMessages = { unique: config.uniqueNamaMessage, notFound: config.notFound };

  async function GET() {
    const auth = await requirePermissionApi("warta", "read");
    if (!auth.ok) return auth.response;
    const { data, error } = await listMasterData(auth.supabase, config);
    if (error) {
      console.error(`[api] GET ${config.apiPath}:`, error.message);
      return fail("Gagal memuat data. Coba lagi.", 500);
    }
    return ok(data);
  }

  const POST = mutation({
    permission: ["warta", "update"],
    schema,
    status: 201,
    async run({ input, supabase }) {
      await assertNamaAvailable(supabase, config, input.nama);
      const sort_order = await nextSortOrder(supabase, config);
      const { data, error } = await from(supabase, config)
        .insert({ ...input, sort_order })
        .select()
        .single();
      if (error) throw dbError(error, dbMessages);
      const row = toRow(data);
      return {
        data: row,
        log: { module: config.module, activity: `Menambah ${config.logNoun} ${quote(row.nama)}` },
        revalidate: revalidateTargets(config),
      };
    },
  });

  return { GET, POST };
}

/** PATCH + DELETE for `/api/admin/{module}/[id]`. */
export function masterDataItemRoutes(config: MasterDataConfig) {
  const schema = inputSchema(config);
  const dbMessages = { unique: config.uniqueNamaMessage, notFound: config.notFound };

  const PATCH = mutation({
    permission: ["warta", "update"],
    params: idParams,
    schema,
    notFound: config.notFound,
    async run({ input, params, supabase }) {
      const current = await from(supabase, config).select("nama").eq("id", params.id).maybeSingle();
      if (current.error) throw dbError(current.error, dbMessages);
      if (!current.data) throw new ApiError(404, config.notFound);

      await assertNamaAvailable(supabase, config, input.nama, params.id);
      const { data, error } = await from(supabase, config)
        .update(input)
        .eq("id", params.id)
        .select()
        .maybeSingle();
      if (error) throw dbError(error, dbMessages);
      if (!data) throw new ApiError(404, config.notFound);

      const row = toRow(data);
      const activity =
        current.data.nama === row.nama
          ? `Mengubah ${config.logNoun} ${quote(row.nama)}`
          : `Mengubah ${config.logNoun} ${quote(current.data.nama)} menjadi ${quote(row.nama)}`;
      return { data: row, log: { module: config.module, activity }, revalidate: revalidateTargets(config) };
    },
  });

  const DELETE = mutation({
    permission: ["warta", "update"],
    params: idParams,
    notFound: config.notFound,
    async run({ params, supabase }) {
      // References are cleared by the foreign keys: tempat/wilayah set null, label assignments cascade.
      const { data, error } = await from(supabase, config)
        .delete()
        .eq("id", params.id)
        .select("id, nama")
        .maybeSingle();
      if (error) throw dbError(error, dbMessages);
      if (!data) throw new ApiError(404, config.notFound);
      return {
        data: { id: data.id },
        log: { module: config.module, activity: `Menghapus ${config.logNoun} ${quote(data.nama)}` },
        revalidate: revalidateTargets(config),
      };
    },
  });

  return { PATCH, DELETE };
}
