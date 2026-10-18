import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity, quote } from "@/lib/activity-log";
import { fail } from "@/lib/api";
import { requirePermissionApi } from "@/lib/auth/session";
import {
  WARTA_DOCX_STALE,
  WARTA_HASH_HEADER,
  wartaDocxFileName,
  type WartaDocxPreview,
} from "@/lib/warta-docx";
import { loadWartaTemplate, renderWartaDocx, wartaContentHash } from "@/lib/warta-docx-render";
import { buildWartaViewModel } from "@/lib/warta-docx-view-model";

const NOT_FOUND = "Warta tidak ditemukan.";
const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const paramsSchema = z.object({ id: z.uuid() });
const querySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("preview") }),
  z.object({ mode: z.literal("download"), hash: z.string().regex(/^[0-9a-f]{64}$/) }),
]);

function noStore<T extends Response>(response: T, hash?: string): T {
  response.headers.set("Cache-Control", "no-store");
  if (hash) response.headers.set(WARTA_HASH_HEADER, hash);
  return response;
}

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * GET /api/admin/warta/[id]/docx?mode=preview|download (brief §16.3),
 * `warta:read`, drafts included.
 *
 * - preview: `{ data: { hash, dibuatPada, kelengkapan, docx } }` (the .docx
 *   base64, rendered in the browser by docx-preview). Not logged.
 * - download (`&hash=` from the preview): the .docx as an attachment, and one
 *   activity row. When the data now hashes differently, 409 and no file, no log.
 */
export async function getWartaDocx(request: Request, context: RouteContext): Promise<Response> {
  const auth = await requirePermissionApi("warta", "read");
  if (!auth.ok) return noStore(auth.response);

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return noStore(fail(NOT_FOUND, 404));

  const search = new URL(request.url).searchParams;
  const query = querySchema.safeParse({ mode: search.get("mode"), hash: search.get("hash") ?? undefined });
  if (!query.success) return noStore(fail("Permintaan tidak valid.", 400));

  try {
    const built = await buildWartaViewModel(auth.supabase, params.data.id);
    if (!built) return noStore(fail(NOT_FOUND, 404));

    const { version } = await loadWartaTemplate();
    const hash = wartaContentHash(built.viewModel, version);
    if (query.data.mode === "download" && query.data.hash !== hash) return noStore(fail(WARTA_DOCX_STALE, 409), hash);

    const docx = await renderWartaDocx(built.viewModel);
    const { warta } = built;

    if (query.data.mode === "preview") {
      const data: WartaDocxPreview = {
        hash,
        dibuatPada: new Date().toISOString(),
        kelengkapan: built.kelengkapan,
        docx: docx.toString("base64"),
      };
      return noStore(NextResponse.json({ data }), hash);
    }

    await logActivity({
      supabase: auth.supabase,
      user: auth.user,
      module: "warta",
      activity: `Mengunduh warta ${quote(warta.judulKebaktian)} (${warta.tanggalKebaktian})`,
    });

    return noStore(
      new Response(new Uint8Array(docx), {
        headers: {
          "Content-Type": DOCX_TYPE,
          "Content-Disposition": `attachment; filename="${wartaDocxFileName(warta.tanggalKebaktian, warta.status)}"`,
          "X-Content-Type-Options": "nosniff",
        },
      }),
      hash,
    );
  } catch (error) {
    console.error(`[api] GET /api/admin/warta/${params.data.id}/docx:`, error);
    return noStore(fail(GENERIC_ERROR, 500));
  }
}
