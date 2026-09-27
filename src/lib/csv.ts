/**
 * Client-side CSV export (brief §9.9, §12.2): built from the table's own
 * filtered rows, never a server round trip, so it always matches the active
 * search and filters.
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/** Escapes a cell so Excel/Sheets never executes it as a formula (CSV injection). */
function escapeCsvCell(value: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Builds a CSV string (CRLF rows) from a header row and plain string cells. */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** Triggers a browser download of `content` as UTF-8 with a BOM, so Excel shows accented characters correctly. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
