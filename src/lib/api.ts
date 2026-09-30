import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

/** Response shape for route handlers (brief §10). */
export function ok<T>(data: T, status: 200 | 201 = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(error: string, status: 400 | 401 | 403 | 404 | 409 | 500) {
  return NextResponse.json({ error }, { status });
}

/** The main write succeeded but a follow-up write failed. */
export function partial<T>(data: T, error: string) {
  return NextResponse.json({ data, error }, { status: 207 });
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Reads the JSON body and validates it; a failure becomes a 400 with the first issue's message. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: fail("Data yang dikirim tidak valid.", 400) };
  }

  return validate(body, schema);
}

function validate<S extends z.ZodType>(body: unknown, schema: S): Parsed<z.infer<S>> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Data yang dikirim tidak valid.";
    return { ok: false, response: fail(message, 400) };
  }
  return { ok: true, data: result.data };
}

/**
 * Reads at most `maxBytes` of the request body. Refuses early on a declared
 * Content-Length over the limit, and counts while streaming as well, because
 * the header can be missing (chunked) or wrong. Returns null when too large.
 */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** A multipart field: text, or an uploaded file. The last value wins for a repeated name. */
export type MultipartFields = Record<string, string | File>;

/**
 * Reads a `multipart/form-data` body of at most `maxBytes` and validates its
 * fields (strings and Files) with Zod. Too large → 400 with `tooLarge`.
 */
export async function parseMultipart<S extends z.ZodType>(
  request: Request,
  schema: S,
  { maxBytes, tooLarge }: { maxBytes: number; tooLarge: string },
): Promise<Parsed<z.infer<S>>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { ok: false, response: fail("Data yang dikirim tidak valid.", 400) };
  }

  const body = await readLimitedBody(request, maxBytes);
  if (!body) return { ok: false, response: fail(tooLarge, 400) };

  let form: FormData;
  try {
    form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  } catch {
    return { ok: false, response: fail("Data yang dikirim tidak valid.", 400) };
  }

  const fields: MultipartFields = {};
  for (const [name, value] of form.entries()) fields[name] = value;
  return validate(fields, schema);
}
