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

  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Data yang dikirim tidak valid.";
    return { ok: false, response: fail(message, 400) };
  }
  return { ok: true, data: result.data };
}
