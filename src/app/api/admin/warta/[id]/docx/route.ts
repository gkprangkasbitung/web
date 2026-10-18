import { getWartaDocx } from "@/lib/warta-docx-routes";

// docxtemplater reads the template from disk and hashes it: Node runtime, never edge.
export const runtime = "nodejs";

export const GET = getWartaDocx;
