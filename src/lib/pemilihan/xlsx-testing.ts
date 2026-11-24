/**
 * Test helper: builds small XLSX files in memory, with the cell kinds the
 * peserta import must handle (inline and shared strings, numbers,
 * booleans, formulas with and without a stored value, hidden sheets,
 * merged ranges). Used by unit and integration tests only.
 */
import PizZip from "pizzip";

export type TestCell =
  | string
  | number
  | boolean
  | null
  | { shared: string }
  | { formula: string; stored?: string; type?: "str" | "n" | "b" };

export type TestSheet = {
  name: string;
  state?: "visible" | "hidden" | "veryHidden";
  rows: TestCell[][];
  merges?: string[];
  /** Adds a hyperlink relationship on A1, which the reader must ignore. */
  hyperlink?: string;
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function buatXlsx(sheets: readonly TestSheet[]): Uint8Array {
  const zip = new PizZip();
  const shared: string[] = [];

  sheets.forEach((sheet, i) => {
    const rows = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            const ref = `${colName(c)}${r + 1}`;
            if (cell === null || cell === "") return "";
            if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            if (typeof cell === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
            if ("shared" in cell) {
              shared.push(cell.shared);
              return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
            }
            const type = cell.type ?? "str";
            const stored = cell.stored === undefined ? "" : `<v>${esc(cell.stored)}</v>`;
            return `<c r="${ref}" t="${type}"><f>${esc(cell.formula)}</f>${stored}</c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    const merges = sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "";
    const link = sheet.hyperlink ? `<hyperlinks><hyperlink ref="A1" r:id="rIdLink"/></hyperlinks>` : "";
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${merges}${link}</worksheet>`,
    );
    if (sheet.hyperlink) {
      zip.file(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(sheet.hyperlink)}" TargetMode="External"/></Relationships>`,
      );
    }
  });

  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" state="${s.state ?? "visible"}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );
  if (shared.length > 0) {
    zip.file(
      "xl/sharedStrings.xml",
      `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
        .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
        .join("")}</sst>`,
    );
  }
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

/** The panitia's two-row header (row 6–7 under a title block), as in the fixture. */
export const JUDUL_PANITIA: TestCell[][] = [
  ["PANITIA PEMILIHAN MAJELIS JEMAAT"],
  ["DAFTAR UJI"],
  [],
  [],
  [],
  ["No", "Nama (Bpk./Ibu/Sdr./Sdri)", "Dapat\nMemilih", "Dapat\nDipilih", "Tidak Dapat\nDipilih", "Usia", null, "Domisili", "Keterangan"],
  [null, null, null, null, null, "<25", ">65", null, null],
];

export const GABUNGAN_JUDUL = ["A6:A7", "B6:B7", "C6:C7", "D6:D7", "E6:E7", "F6:G6", "H6:H7", "I6:I7"];
