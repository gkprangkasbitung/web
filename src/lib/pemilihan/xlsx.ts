import "server-only";

import { XMLParser } from "fast-xml-parser";
import PizZip from "pizzip";

/**
 * A small XLSX reader for the peserta import (brief §18.4, stage 14b). It
 * returns cell values only:
 * - a formula is never evaluated: the cell's stored value is used, and a
 *   formula without one reads as empty;
 * - hyperlinks, comments, styles, and drawings are never read;
 * - hidden and very hidden sheets are skipped.
 * Merged ranges are reported so the caller can read a merged header.
 *
 * Guards against hostile files: the number of zip entries, each entry's and
 * the total uncompressed size (zip bombs), DOCTYPE declarations (entity
 * expansion), and the number of rows and columns read.
 */

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

export type XlsxRange = { top: number; left: number; bottom: number; right: number };

export type XlsxSheet = {
  name: string;
  /** rows[r][c], zero-based; missing cells are "". Trailing empty rows are dropped. */
  rows: string[][];
  merges: XlsxRange[];
};

export const XLSX_LIMITS = {
  entries: 500,
  /** Per zip entry, uncompressed. */
  entryBytes: 15 * 1024 * 1024,
  /** All entries together, uncompressed. */
  totalBytes: 25 * 1024 * 1024,
  rows: 10_000,
  /** Columns A–AX; anything further right is ignored. */
  columns: 50,
  sheets: 50,
} as const;

const NOT_XLSX = "File ini bukan file Excel (.xlsx) yang valid.";
const TOO_BIG = "Isi file terlalu besar untuk dibaca.";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // Character references (&#8730; is "√") and the five XML entities. A part
  // with a DOCTYPE (custom entities) is refused before parsing.
  processEntities: true,
  // Needed for numeric character references (&#8730;), which Excel and
  // other writers use for non-ASCII text.
  htmlEntities: true,
  isArray: (name) => ["sheet", "Relationship", "si", "r", "row", "c", "mergeCell"].includes(name),
});

type Node = Record<string, unknown>;

function asNode(value: unknown): Node {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function attr(node: Node, name: string): string | undefined {
  const value = node[`@${name}`];
  return typeof value === "string" ? value : undefined;
}

/** The text of a node that may be a plain string or `{ "#text": … }` (when it has attributes). */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  const node = asNode(value);
  const text = node["#text"];
  return typeof text === "string" || typeof text === "number" ? String(text) : "";
}

/** Rich or plain string item (<si> or <is>): every run's <t>, but never phonetic runs (<rPh>). */
function richText(value: unknown): string {
  const node = asNode(value);
  if (node.t !== undefined) return textOf(node.t);
  return asArray(node.r)
    .map((run) => textOf(asNode(run).t))
    .join("");
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** "B7" → { row: 6, col: 1 }; null when malformed. */
function parseRef(ref: string | undefined): { row: number; col: number } | null {
  const match = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(ref ?? "");
  if (!match) return null;
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]!) };
}

class Package {
  private readonly zip: PizZip;
  private total = 0;

  constructor(data: Uint8Array) {
    try {
      this.zip = new PizZip(data);
    } catch {
      throw new XlsxError(NOT_XLSX);
    }
    const files = Object.values(this.zip.files);
    if (files.length > XLSX_LIMITS.entries) throw new XlsxError(TOO_BIG);
    for (const file of files) {
      const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      if (size > XLSX_LIMITS.entryBytes) throw new XlsxError(TOO_BIG);
    }
  }

  /** The part's XML, or null when it doesn't exist. */
  xml(path: string): Node | null {
    const file = this.zip.file(path);
    if (!file) return null;
    let text: string;
    try {
      text = file.asText();
    } catch {
      throw new XlsxError(NOT_XLSX);
    }
    this.total += text.length;
    if (this.total > XLSX_LIMITS.totalBytes) throw new XlsxError(TOO_BIG);
    if (/<!DOCTYPE/i.test(text)) throw new XlsxError(NOT_XLSX);
    try {
      return asNode(parser.parse(text));
    } catch {
      throw new XlsxError(NOT_XLSX);
    }
  }
}

/** "worksheets/sheet1.xml" relative to xl/, or an absolute "/xl/…" target. */
function resolveTarget(target: string): string {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

function readSharedStrings(pkg: Package): string[] {
  const sst = asNode(pkg.xml("xl/sharedStrings.xml")?.sst);
  return asArray(sst.si).map(richText);
}

function cellValue(cell: Node, shared: readonly string[]): string {
  const type = attr(cell, "t") ?? "n";
  // <f> (the formula) is deliberately never read.
  const stored = cell.v === undefined ? null : textOf(cell.v);
  switch (type) {
    case "s": {
      const index = stored === null ? NaN : Number(stored);
      return Number.isInteger(index) ? (shared[index] ?? "") : "";
    }
    case "inlineStr":
      return richText(cell.is);
    case "b":
      return stored === "1" ? "TRUE" : stored === "0" ? "FALSE" : "";
    case "e":
      // #REF!, #N/A, …: not a value.
      return "";
    default:
      // "n", "str" (a formula's stored text), "d".
      return stored ?? "";
  }
}

function readSheet(pkg: Package, path: string, name: string, shared: readonly string[]): XlsxSheet {
  const worksheet = asNode(pkg.xml(path)?.worksheet);
  const rows: string[][] = [];

  let nextRow = 0;
  for (const rowValue of asArray(asNode(worksheet.sheetData).row)) {
    const rowNode = asNode(rowValue);
    const declared = Number(attr(rowNode, "r"));
    const r = Number.isInteger(declared) && declared >= 1 ? declared - 1 : nextRow;
    nextRow = r + 1;
    if (r >= XLSX_LIMITS.rows) throw new XlsxError(`Sheet "${name}" lebih dari ${XLSX_LIMITS.rows} baris.`);

    let nextCol = 0;
    for (const cellValueNode of asArray(rowNode.c)) {
      const cell = asNode(cellValueNode);
      const ref = parseRef(attr(cell, "r"));
      const c = ref ? ref.col : nextCol;
      nextCol = c + 1;
      if (c >= XLSX_LIMITS.columns) continue;
      const value = cellValue(cell, shared);
      if (value === "") continue;
      while (rows.length <= r) rows.push([]);
      const row = rows[r]!;
      while (row.length <= c) row.push("");
      row[c] = value;
    }
  }
  const width = Math.max(0, ...rows.map((row) => row.length));
  for (const row of rows) while (row.length < width) row.push("");

  const merges: XlsxRange[] = [];
  for (const mergeValue of asArray(asNode(worksheet.mergeCells).mergeCell)) {
    const [from, to] = (attr(asNode(mergeValue), "ref") ?? "").split(":");
    const a = parseRef(from);
    const b = parseRef(to ?? from);
    if (!a || !b) continue;
    merges.push({ top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) });
  }

  return { name, rows, merges };
}

/** The visible sheets of an XLSX file, in workbook order. Throws XlsxError with a message fit to show. */
export function readXlsx(data: Uint8Array): XlsxSheet[] {
  const pkg = new Package(data);
  const workbook = asNode(pkg.xml("xl/workbook.xml")?.workbook);
  if (Object.keys(workbook).length === 0) throw new XlsxError(NOT_XLSX);

  const rels = asArray(asNode(pkg.xml("xl/_rels/workbook.xml.rels")?.Relationships).Relationship).map(asNode);
  const targets = new Map(rels.map((rel) => [attr(rel, "Id"), attr(rel, "Target")]));
  const shared = readSharedStrings(pkg);

  const sheets = asArray(asNode(workbook.sheets).sheet).map(asNode);
  if (sheets.length > XLSX_LIMITS.sheets) throw new XlsxError(TOO_BIG);

  const result: XlsxSheet[] = [];
  for (const sheet of sheets) {
    const state = attr(sheet, "state");
    if (state === "hidden" || state === "veryHidden") continue;
    const name = (attr(sheet, "name") ?? "").trim() || `Sheet ${result.length + 1}`;
    const target = targets.get(attr(sheet, "id"));
    if (!target) continue;
    result.push(readSheet(pkg, resolveTarget(target), name, shared));
  }
  return result;
}
