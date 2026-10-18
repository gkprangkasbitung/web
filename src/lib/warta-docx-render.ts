import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Docxtemplater from "docxtemplater";
import expressionParser from "docxtemplater/expressions.js";
import PizZip from "pizzip";

import type { WartaDocxViewModel } from "@/lib/warta-docx";

/**
 * Renders templates/warta/warta.docx (brief §16). The template is trusted
 * repo content, read from disk; it never comes from an upload. Node runtime
 * only (fs, crypto).
 *
 * docxtemplater settings: `paragraphLoop` (a paragraph holding only a loop
 * tag disappears with it), `linebreaks` ("\n" → a line break), the official
 * expressions parser (dotted paths, scope fallback inside loops), and its
 * default XML escaping. No raw-XML tags (`{@…}`) are used for any data.
 */

export const WARTA_TEMPLATE_PATH = path.join(process.cwd(), "templates", "warta", "warta.docx");

let template: Promise<{ bytes: Buffer; version: string }> | null = null;

/** The template bytes and their SHA-256 (the "template version" in the content hash), read once. */
export function loadWartaTemplate(): Promise<{ bytes: Buffer; version: string }> {
  template ??= readFile(WARTA_TEMPLATE_PATH)
    .then((bytes) => ({ bytes, version: createHash("sha256").update(bytes).digest("hex") }))
    .catch((error: unknown) => {
      template = null;
      throw error;
    });
  return template;
}

/** JSON with every object's keys sorted, so the same data always serializes the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Brief §16.3: SHA-256 of the canonical view model plus the template version. */
export function wartaContentHash(viewModel: WartaDocxViewModel, templateVersion: string): string {
  return createHash("sha256").update(canonicalJson(viewModel)).update("\n").update(templateVersion).digest("hex");
}

type NullGetterPart = { value: string; module?: string };

/**
 * A tag with no value: in production it prints "" and the key goes to the
 * server log; under test it throws, so a tag the view model doesn't map is
 * caught by the test suite instead of silently printing nothing.
 */
function nullGetter(strict: boolean) {
  return (part: NullGetterPart) => {
    const tag = `${part.module === "loop" ? "#" : ""}${part.value}`;
    if (strict) throw new Error(`Tag warta tanpa data: {${tag}}`);
    console.warn(`[warta-docx] tag tanpa data: {${tag}}`);
    return "";
  };
}

const STRICT_BY_DEFAULT = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

/** Renders one view model into a .docx (bytes). */
export async function renderWartaDocx(
  viewModel: WartaDocxViewModel,
  { strict = STRICT_BY_DEFAULT, templateBytes }: { strict?: boolean; templateBytes?: Buffer } = {},
): Promise<Buffer> {
  const bytes = templateBytes ?? (await loadWartaTemplate()).bytes;
  const doc = new Docxtemplater(new PizZip(bytes), {
    paragraphLoop: true,
    linebreaks: true,
    parser: expressionParser,
    nullGetter: nullGetter(strict),
  });
  doc.render(viewModel);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
