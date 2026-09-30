import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { NextResponse } from "next/server";
import type { z } from "zod";

import { logActivity } from "@/lib/activity-log";
import type { ActivityModule } from "@/lib/activity-modules";
import { fail, ok, parseBody, parseMultipart, partial } from "@/lib/api";
import type { Action, Resource } from "@/lib/auth/permissions";
import { requirePermissionApi, requireUserApi, type AuthUser } from "@/lib/auth/session";
import type { ServerSupabase } from "@/lib/supabase/server";

const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";

/** A failure the user should see. Thrown from `run`; becomes `{ error }` with this status. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type DbErrorMessages = {
  /** 23505 unique violation, e.g. "Nama label sudah digunakan." */
  unique?: string;
  /** No such row (P0002, PGRST116, malformed uuid). */
  notFound?: string;
  /** 23503 foreign key violation. */
  inUse?: string;
};

/**
 * Translates a Postgres/PostgREST error into a message fit for the user.
 * The raw database text is never returned; it goes to the server console.
 */
export function dbError(error: Pick<PostgrestError, "code" | "message">, messages: DbErrorMessages = {}): Error {
  switch (error.code) {
    case "23505":
      return new ApiError(400, messages.unique ?? "Data dengan nilai ini sudah ada.");
    case "23503":
      return new ApiError(400, messages.inUse ?? "Data ini masih dipakai oleh data lain.");
    case "42501":
      return new ApiError(403, "Kamu tidak punya akses untuk tindakan ini.");
    case "P0002":
    case "PGRST116":
    case "22P02":
      return new ApiError(404, messages.notFound ?? "Data tidak ditemukan.");
    case "22023":
    case "23502":
    case "23514":
      return new ApiError(400, "Data yang dikirim tidak valid.");
    default:
      // Unknown: the handler logs it and answers 500.
      return new Error(`[db ${error.code}] ${error.message}`);
  }
}

/**
 * 42501 refusals raised by our own access guards (0021, 0022, 0028), with
 * hand-written text worth showing. Other 42501s (RLS, missing privileges)
 * carry raw Postgres text and get the generic message instead.
 */
const ACCESS_GUARD_MESSAGES = new Set([
  "Tidak bisa mencabut akses roles atau users milik akun sendiri.",
  "Tidak bisa mengubah role akun sendiri.",
  "Harus ada minimal satu super_admin.",
  "Role super_admin tidak bisa dihapus.",
  "Nama role super_admin tidak bisa diubah.",
  "Permission roles dan users milik super_admin tidak bisa dicabut.",
]);

/** For plain table writes that can hit an access-guard trigger (roles, role_permissions). */
export function guardError(error: Pick<PostgrestError, "code" | "message">, messages: DbErrorMessages = {}): Error {
  if (error.code === "42501" && ACCESS_GUARD_MESSAGES.has(error.message)) return new ApiError(403, error.message);
  return dbError(error, messages);
}

/**
 * Translates an error from one of our own atomic RPCs (`supabase.rpc(...)`).
 * Unlike `dbError`, the message is forwarded as-is: every RPC in this
 * codebase raises hand-written Indonesian text for these codes (never a raw
 * constraint name), so it's already fit to show. Anything else is an
 * unexpected error and gets the same generic-500 treatment as `dbError`.
 */
export function rpcError(error: Pick<PostgrestError, "code" | "message">): Error {
  switch (error.code) {
    case "42501":
      return ACCESS_GUARD_MESSAGES.has(error.message)
        ? new ApiError(403, error.message)
        : new ApiError(403, "Kamu tidak punya akses untuk tindakan ini.");
    case "P0002":
    case "PGRST116":
    case "22P02":
      return new ApiError(404, error.message);
    case "22023":
    case "23503":
    case "23505":
      return new ApiError(400, error.message);
    default:
      return new Error(`[db ${error.code}] ${error.message}`);
  }
}

/** A path for `revalidatePath`; `layout` also covers every page beneath it. */
export type RevalidateTarget = string | { path: string; type: "layout" | "page" };

export type MutationContext<TInput, TParams> = {
  input: TInput;
  params: TParams;
  user: AuthUser;
  supabase: ServerSupabase;
};

export type MutationSuccess<TData> = {
  data: TData;
  /** One activity_logs row (brief §7). */
  log: { module: ActivityModule; activity: string };
  /** Data that changed, so every open view shows it (brief §11). */
  revalidate?: readonly RevalidateTarget[];
  /**
   * The main write succeeded but a follow-up write failed (brief §10): the
   * response is 207 with `{ data, error: partial }`. The activity is still logged.
   */
  partial?: string;
};

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * A route handler for one mutation, in the fixed order:
 * session + permission (401/403) → route params (404) → Zod body (400; for
 * multipart, the size limit first) →
 * `run` (the write) → activity log (never fails the action) → revalidate → `{ data }`.
 *
 * `run` throws `ApiError` (or `dbError(...)`) for failures the user should
 * see; anything else is logged and answered with a generic 500.
 */
export function mutation<TInput = undefined, TParams = Record<string, never>, TData = unknown>(config: {
  /** `"signed-in"`: any signed-in user (Profil Saya); otherwise `[resource, action]`. */
  permission: readonly [Resource, Action] | "signed-in";
  /** Validates `{ id }` and friends; a mismatch is a 404. */
  params?: z.ZodType<TParams>;
  /** Validates the JSON body (or the multipart fields). Omit for body-less requests (DELETE). */
  schema?: z.ZodType<TInput>;
  /**
   * Read the body as `multipart/form-data` (photo uploads) instead of JSON,
   * refusing more than `maxBytes` with a 400 `tooLarge` before any parsing.
   */
  multipart?: { maxBytes: number; tooLarge: string };
  /** 201 for creates. */
  status?: 200 | 201;
  /** Message for a malformed route param. */
  notFound?: string;
  run: (ctx: MutationContext<TInput, TParams>) => Promise<MutationSuccess<TData>>;
}): (request: Request, context: RouteContext) => Promise<NextResponse> {
  return async (request, context) => {
    const auth =
      config.permission === "signed-in" ? await requireUserApi() : await requirePermissionApi(...config.permission);
    if (!auth.ok) return auth.response;

    let params = {} as TParams;
    if (config.params) {
      const parsed = config.params.safeParse(await context.params);
      if (!parsed.success) return fail(config.notFound ?? "Data tidak ditemukan.", 404);
      params = parsed.data;
    }

    let input = undefined as TInput;
    if (config.schema) {
      const body = config.multipart
        ? await parseMultipart(request, config.schema, config.multipart)
        : await parseBody(request, config.schema);
      if (!body.ok) return body.response;
      input = body.data;
    }

    let result: MutationSuccess<TData>;
    try {
      result = await config.run({ input, params, user: auth.user, supabase: auth.supabase });
    } catch (error) {
      if (error instanceof ApiError) return fail(error.message, error.status);
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}:`, error);
      return fail(GENERIC_ERROR, 500);
    }

    await logActivity({ supabase: auth.supabase, user: auth.user, ...result.log });

    for (const target of result.revalidate ?? []) {
      try {
        if (typeof target === "string") revalidatePath(target);
        else revalidatePath(target.path, target.type);
      } catch (error) {
        console.error("[api] revalidatePath failed:", error);
      }
    }

    if (result.partial) return partial(result.data, result.partial);
    return ok(result.data, config.status ?? 200);
  };
}

/** Escapes `%`, `_`, and `\` so a value matches literally in `ilike`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
