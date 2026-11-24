/**
 * Reading the panitia's peserta list (brief §18.4, stage 14b). Pure
 * functions over the cell values `xlsx.ts` reads, safe to import anywhere
 * (the preview's types are used by the client).
 *
 * The list is the panitia's own format: a title block, then a header that
 * isn't on the first row and spans two rows ("Usia" split into <25 and >65
 * below it), one sheet (or file) per wilayah. Columns are found by their
 * header text, never by position.
 *
 * Matching to Data Jemaat uses `kunciNama` (lib/nama-jemaat.ts), the same
 * honorific rules as the username generator. The database derives the
 * final dapat_memilih / dapat_dipilih from the ticks again
 * (impor_peserta_pemilihan, 0040); `turunkan` mirrors it for the preview.
 */
import { kunciNama } from "@/lib/nama-jemaat";

import type { XlsxRange, XlsxSheet } from "./xlsx";

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

/** How a tick cell reads. "tidak_dikenal" is never guessed: it is an error the panitia resolves. */
export type Tanda = "ya" | "tidak" | "kosong" | "tidak_dikenal";

/** Accepted as "yes" (§18.4): √ ✓ ✔ v Ya Y 1 TRUE, any case. */
const YA = new Set(["√", "✓", "✔", "☑", "v", "ya", "y", "1", "true"]);
/** An explicit "no". */
const TIDAK = new Set(["tidak", "t", "n", "no", "0", "false"]);
/** Read as an empty cell. */
const KOSONG = new Set(["", "-", "–", "—"]);

export function bacaTanda(value: string): Tanda {
  const v = value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase().replace(/\.$/, "");
  if (KOSONG.has(v)) return "kosong";
  if (YA.has(v)) return "ya";
  if (TIDAK.has(v)) return "tidak";
  return "tidak_dikenal";
}

/** The values the database derives from the ticks (0040), for the preview. */
export function turunkan(tanda: { memilih: Tanda; dipilih: Tanda; tidakDipilih: Tanda }): {
  dapatMemilih: boolean | null;
  perluKonfirmasiMemilih: boolean;
  dapatDipilih: boolean | null;
} {
  const kosongAtauTidak = (t: Tanda) => t === "kosong" || t === "tidak";
  return {
    dapatMemilih: tanda.memilih === "ya" ? true : tanda.memilih === "tidak_dikenal" ? null : false,
    perluKonfirmasiMemilih: tanda.memilih === "kosong",
    dapatDipilih:
      tanda.dipilih === "ya" && kosongAtauTidak(tanda.tidakDipilih)
        ? true
        : tanda.tidakDipilih === "ya" && kosongAtauTidak(tanda.dipilih)
          ? false
          : null,
  };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export type KolomKey =
  | "no"
  | "nama"
  | "memilih"
  | "dipilih"
  | "tidakDipilih"
  | "usia"
  | "usiaMuda"
  | "usiaTua"
  | "domisili"
  | "keterangan";

export const LABEL_KOLOM: Record<KolomKey, string> = {
  no: "No",
  nama: "Nama",
  memilih: "Dapat Memilih",
  dipilih: "Dapat Dipilih",
  tidakDipilih: "Tidak Dapat Dipilih",
  usia: "Usia",
  usiaMuda: "Usia <25",
  usiaTua: "Usia >65",
  domisili: "Domisili",
  keterangan: "Keterangan",
};

const WAJIB: readonly KolomKey[] = ["no", "nama", "memilih", "dipilih", "tidakDipilih"];

/** Header text, ignoring line breaks, repeated spaces, and case. */
export function normalisasiJudul(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function kolomUntuk(atas: string, bawah: string): KolomKey | null {
  const a = normalisasiJudul(atas);
  const b = normalisasiJudul(bawah).replace(/\s+/g, "");
  if (a === "usia" || a.startsWith("usia ") || a === "") {
    const sub = a.startsWith("usia ") ? a.slice(5).replace(/\s+/g, "") : b;
    if (sub === "<25") return "usiaMuda";
    if (sub === ">65") return "usiaTua";
    if (a === "usia") return "usia";
    if (a === "") return null;
  }
  if (/^(no|no\.|nomor|no urut)$/.test(a)) return "no";
  if (a.startsWith("nama")) return "nama";
  if (a === "dapat memilih") return "memilih";
  if (a === "dapat dipilih") return "dipilih";
  if (a === "tidak dapat dipilih") return "tidakDipilih";
  if (a.startsWith("domisili")) return "domisili";
  if (a.startsWith("keterangan") || a === "ket" || a === "ket.") return "keterangan";
  return null;
}

/** Copies a merged range's top-left value across the range, within one row. */
function isiGabungan(row: readonly string[], rowIndex: number, merges: readonly XlsxRange[]): string[] {
  const filled = [...row];
  for (const m of merges) {
    if (rowIndex !== m.top) continue;
    const value = row[m.left] ?? "";
    for (let c = m.left; c <= m.right; c += 1) {
      while (filled.length <= c) filled.push("");
      if (!filled[c]) filled[c] = value;
    }
  }
  return filled;
}

type PetaKolom = Partial<Record<KolomKey, number>>;

/** How far down to look for the header. */
const BARIS_JUDUL_MAKS = 40;

/**
 * Finds the header: the first row with a "No" cell and a "Nama…" cell. When
 * the row below it holds sub-headers (<25, >65) and no number under "No",
 * the header spans both rows. Returns the column map and the first data row.
 */
export function cariJudul(
  sheet: Pick<XlsxSheet, "rows" | "merges">,
): { peta: PetaKolom; barisData: number; kurang: KolomKey[] } | null {
  const limit = Math.min(sheet.rows.length, BARIS_JUDUL_MAKS);
  for (let r = 0; r < limit; r += 1) {
    const atas = isiGabungan(sheet.rows[r] ?? [], r, sheet.merges);
    const keys = atas.map((cell) => kolomUntuk(cell, ""));
    const noCol = keys.indexOf("no");
    if (noCol === -1 || !keys.includes("nama")) continue;

    const next = sheet.rows[r + 1] ?? [];
    const subHeader =
      !/^\d+$/.test((next[noCol] ?? "").trim()) &&
      next.some((cell) => /^[<>]\s*\d+$/.test(normalisasiJudul(cell)));
    const bawah = subHeader ? next : [];

    const peta: PetaKolom = {};
    const width = Math.max(atas.length, bawah.length);
    for (let c = 0; c < width; c += 1) {
      const key = kolomUntuk(atas[c] ?? "", bawah[c] ?? "");
      if (key && peta[key] === undefined) peta[key] = c;
    }
    const kurang = WAJIB.filter((key) => peta[key] === undefined);
    return { peta, barisData: r + (subHeader ? 2 : 1), kurang };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type BarisMentah = {
  sumber: string;
  kelompokWilayah: string;
  /** Row number in the sheet, 1-based, as Excel shows it. */
  baris: number;
  nomor: string | null;
  nama: string;
  domisili: string | null;
  tandaMemilih: Tanda;
  tandaDipilih: Tanda;
  tandaTidakDipilih: Tanda;
  usia: string | null;
  keterangan: string | null;
  /** Errors: the row can't be used as it is. */
  galat: string[];
  /** Warnings the panitia confirms (blank Dapat Memilih). */
  peringatan: string[];
  /** Information only (a skipped number). */
  info: string[];
};

export type LembarRingkas = {
  sumber: string;
  kelompokWilayah: string;
  jumlahBaris: number;
  /** Why the sheet was not read; its rows are not imported. */
  dilewati: string | null;
};

const MAKS_TEKS = { nama: 200, domisili: 300, keterangan: 500, nomor: 20, sumber: 300, kelompok: 100 } as const;

function rapikan(value: string | undefined, max: number): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** "Wil. 1" for a named sheet; the file name for a default one ("Sheet1", "Lembar1"). */
export function namaKelompok(fileName: string, sheetName: string): string {
  const generic = /^(sheet|lembar|tabelle|feuil|hoja)\s*\d*$/i.test(sheetName.trim());
  const stem = fileName.replace(/\.xlsx$/i, "").trim();
  return ((generic ? stem : sheetName.trim()) || stem || "Tanpa nama").slice(0, MAKS_TEKS.kelompok);
}

function pesanTanda(kolom: string, raw: string): string {
  return `Nilai "${raw.trim().slice(0, 20)}" di kolom ${kolom} tidak dikenali.`;
}

export const PESAN = {
  dipilihGanda: "Dapat Dipilih dan Tidak Dapat Dipilih keduanya terisi. Harus tepat salah satu.",
  dipilihKosong: "Dapat Dipilih dan Tidak Dapat Dipilih keduanya kosong. Harus tepat salah satu.",
  memilihKosong: "Dapat Memilih kosong. Konfirmasi apakah jemaat ini memang tidak dapat memilih.",
  namaGanda: "Nama yang sama ada di baris lain. Pastikan jemaat yang dimaksud.",
} as const;

/** Reads one sheet's data rows. Rows without a name are ignored (the empty rows under the table). */
export function bacaLembar(sheet: XlsxSheet, fileName: string): { lembar: LembarRingkas; baris: BarisMentah[] } {
  const kelompokWilayah = namaKelompok(fileName, sheet.name);
  const sumber = `${fileName} › ${sheet.name}`.slice(0, MAKS_TEKS.sumber);
  const lewati = (alasan: string) => ({ lembar: { sumber, kelompokWilayah, jumlahBaris: 0, dilewati: alasan }, baris: [] });

  const judul = cariJudul(sheet);
  if (!judul) return lewati("Tidak ada baris judul dengan kolom No dan Nama.");
  if (judul.kurang.length > 0) {
    return lewati(`Kolom ${judul.kurang.map((key) => LABEL_KOLOM[key]).join(", ")} tidak ditemukan.`);
  }
  const { peta } = judul;
  const cell = (row: readonly string[], key: KolomKey) => (peta[key] === undefined ? "" : (row[peta[key]!] ?? ""));

  const baris: BarisMentah[] = [];
  let nomorSebelumnya: number | null = null;
  for (let r = judul.barisData; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r] ?? [];
    const nama = rapikan(cell(row, "nama"), MAKS_TEKS.nama);
    if (!nama) continue;

    const galat: string[] = [];
    const peringatan: string[] = [];
    const info: string[] = [];

    const nomor = rapikan(cell(row, "no"), MAKS_TEKS.nomor);
    const angka = nomor && /^\d+$/.test(nomor) ? Number(nomor) : null;
    if (angka !== null && nomorSebelumnya !== null && angka !== nomorSebelumnya + 1) {
      info.push(`Nomor melompat dari ${nomorSebelumnya} ke ${angka}.`);
    }
    if (angka !== null) nomorSebelumnya = angka;

    const raw = { memilih: cell(row, "memilih"), dipilih: cell(row, "dipilih"), tidakDipilih: cell(row, "tidakDipilih") };
    const tandaMemilih = bacaTanda(raw.memilih);
    const tandaDipilih = bacaTanda(raw.dipilih);
    const tandaTidakDipilih = bacaTanda(raw.tidakDipilih);

    if (tandaMemilih === "tidak_dikenal") galat.push(pesanTanda("Dapat Memilih", raw.memilih));
    if (tandaDipilih === "tidak_dikenal") galat.push(pesanTanda("Dapat Dipilih", raw.dipilih));
    if (tandaTidakDipilih === "tidak_dikenal") galat.push(pesanTanda("Tidak Dapat Dipilih", raw.tidakDipilih));
    if (tandaDipilih !== "tidak_dikenal" && tandaTidakDipilih !== "tidak_dikenal") {
      if (tandaDipilih === "ya" && tandaTidakDipilih === "ya") galat.push(PESAN.dipilihGanda);
      else if (tandaDipilih !== "ya" && tandaTidakDipilih !== "ya") galat.push(PESAN.dipilihKosong);
    }
    if (tandaMemilih === "kosong") peringatan.push(PESAN.memilihKosong);

    const usiaBagian: string[] = [];
    if (peta.usia !== undefined && rapikan(cell(row, "usia"), 20)) usiaBagian.push(rapikan(cell(row, "usia"), 20)!);
    if (bacaTanda(cell(row, "usiaMuda")) !== "kosong" && bacaTanda(cell(row, "usiaMuda")) !== "tidak") usiaBagian.push("<25");
    if (bacaTanda(cell(row, "usiaTua")) !== "kosong" && bacaTanda(cell(row, "usiaTua")) !== "tidak") usiaBagian.push(">65");

    baris.push({
      sumber,
      kelompokWilayah,
      baris: r + 1,
      nomor,
      nama,
      domisili: rapikan(cell(row, "domisili"), MAKS_TEKS.domisili),
      tandaMemilih,
      tandaDipilih,
      tandaTidakDipilih,
      usia: usiaBagian.length > 0 ? usiaBagian.join(", ").slice(0, 20) : null,
      keterangan: rapikan(cell(row, "keterangan"), MAKS_TEKS.keterangan),
      galat,
      peringatan,
      info,
    });
  }

  return { lembar: { sumber, kelompokWilayah, jumlahBaris: baris.length, dilewati: null }, baris };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type JemaatUntukImpor = { id: string; nama: string; alamat: string | null; wilayah: string | null };

export type KategoriImpor = "cocok" | "ambigu" | "tidak_ditemukan" | "error";

export const LABEL_KATEGORI: Record<KategoriImpor, string> = {
  cocok: "Cocok",
  ambigu: "Ambigu",
  tidak_ditemukan: "Tidak ditemukan",
  error: "Error validasi",
};

export type BarisImpor = Omit<BarisMentah, "galat" | "peringatan" | "info"> & {
  kategori: KategoriImpor;
  /** Possible jemaat, best Domisili match first. */
  calonJemaatIds: string[];
  /** Set by a unique match. */
  jemaatId: string | null;
  /** Errors, warnings, and information, in that order (stored with the row). */
  catatan: string[];
};

/** Words of an address, for comparing Domisili with alamat / wilayah. */
function kataAlamat(value: string | null): Set<string> {
  return new Set(
    (value ?? "")
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3),
  );
}

/** How many Domisili words appear in the jemaat's alamat or wilayah. */
export function skorDomisili(domisili: string | null, jemaat: JemaatUntukImpor): number {
  const words = kataAlamat(domisili);
  if (words.size === 0) return 0;
  const target = kataAlamat(`${jemaat.alamat ?? ""} ${jemaat.wilayah ?? ""}`);
  let score = 0;
  for (const word of words) if (target.has(word)) score += 1;
  return score;
}

const MAKS_CALON = 50;

/**
 * Matches every row to Data Jemaat by normalized name:
 * - error rows go to "error" (their match is still kept, so fixing the
 *   value is enough);
 * - a name that appears on more than one row of the import (in any sheet)
 *   is "ambigu" even when only one jemaat has it: two rows may be two
 *   people, so the panitia decides;
 * - one jemaat → "cocok"; several → "ambigu"; none → "tidak_ditemukan".
 */
export function cocokkan(rows: readonly BarisMentah[], jemaat: readonly JemaatUntukImpor[]): BarisImpor[] {
  const index = new Map<string, JemaatUntukImpor[]>();
  for (const person of jemaat) {
    const key = kunciNama(person.nama);
    if (!key) continue;
    const list = index.get(key) ?? [];
    list.push(person);
    index.set(key, list);
  }
  const kemunculan = new Map<string, number>();
  for (const row of rows) {
    const key = kunciNama(row.nama);
    kemunculan.set(key, (kemunculan.get(key) ?? 0) + 1);
  }

  return rows.map(({ galat, peringatan, info, ...row }) => {
    const key = kunciNama(row.nama);
    const ganda = key !== "" && (kemunculan.get(key) ?? 0) > 1;
    const matches = key ? [...(index.get(key) ?? [])] : [];
    matches.sort(
      (a, b) => skorDomisili(row.domisili, b) - skorDomisili(row.domisili, a) || a.nama.localeCompare(b.nama, "id") || a.id.localeCompare(b.id),
    );
    const calonJemaatIds = matches.slice(0, MAKS_CALON).map((m) => m.id);
    const unik = matches.length === 1 && !ganda;

    let kategori: KategoriImpor;
    if (galat.length > 0) kategori = "error";
    else if (unik) kategori = "cocok";
    else if (matches.length > 0) kategori = "ambigu";
    else kategori = "tidak_ditemukan";

    const catatan = [...galat, ...peringatan, ...(ganda ? [PESAN.namaGanda] : []), ...info].slice(0, 10);
    return { ...row, kategori, calonJemaatIds, jemaatId: unik ? calonJemaatIds[0]! : null, catatan };
  });
}

/** Whether a row as imported is already resolved (same rule as the generated column `beres`, 0040). */
export function beresSaatImpor(row: Pick<BarisImpor, "jemaatId" | "tandaMemilih" | "tandaDipilih" | "tandaTidakDipilih">): boolean {
  const t = turunkan({ memilih: row.tandaMemilih, dipilih: row.tandaDipilih, tidakDipilih: row.tandaTidakDipilih });
  return row.jemaatId !== null && t.dapatMemilih !== null && t.dapatDipilih !== null && !t.perluKonfirmasiMemilih;
}

export type PratinjauImpor = {
  lembar: LembarRingkas[];
  baris: BarisImpor[];
};

/** Reads every visible sheet of every file and matches the rows. */
export function susunPratinjau(
  files: readonly { name: string; sheets: readonly XlsxSheet[] }[],
  jemaat: readonly JemaatUntukImpor[],
): PratinjauImpor {
  const lembar: LembarRingkas[] = [];
  const mentah: BarisMentah[] = [];
  for (const file of files) {
    if (file.sheets.length === 0) {
      lembar.push({ sumber: file.name, kelompokWilayah: namaKelompok(file.name, ""), jumlahBaris: 0, dilewati: "Tidak ada sheet yang terlihat." });
    }
    for (const sheet of file.sheets) {
      const result = bacaLembar(sheet, file.name);
      lembar.push(result.lembar);
      mentah.push(...result.baris);
    }
  }
  return { lembar, baris: cocokkan(mentah, jemaat) };
}
