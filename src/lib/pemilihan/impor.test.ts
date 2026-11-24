import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { kunciNama } from "@/lib/nama-jemaat";

import {
  bacaLembar,
  bacaTanda,
  beresSaatImpor,
  cariJudul,
  cocokkan,
  namaKelompok,
  PESAN,
  susunPratinjau,
  turunkan,
  type JemaatUntukImpor,
} from "./impor";
import { readXlsx, XlsxError } from "./xlsx";
import { buatXlsx, GABUNGAN_JUDUL, JUDUL_PANITIA, type TestCell } from "./xlsx-testing";

const FIXTURE = fileURLToPath(new URL("../../../tests/fixtures/peserta-pemilihan-contoh.xlsx", import.meta.url));
const fixture = () => new Uint8Array(readFileSync(FIXTURE));

function jemaat(id: string, nama: string, alamat: string | null = null, wilayah: string | null = null): JemaatUntukImpor {
  return { id, nama, alamat, wilayah };
}

describe("bacaTanda", () => {
  it.each(["√", "✓", "✔", "v", "V", "Ya", "YA", "ya", "Y", "y", "1", "TRUE", "true", " √ ", "Ya."])("reads %j as yes", (value) => {
    expect(bacaTanda(value)).toBe("ya");
  });
  it.each(["", "  ", "-", "—"])("reads %j as empty", (value) => {
    expect(bacaTanda(value)).toBe("kosong");
  });
  it.each(["Tidak", "tidak", "T", "N", "0", "FALSE", "false"])("reads %j as an explicit no", (value) => {
    expect(bacaTanda(value)).toBe("tidak");
  });
  it.each(["x", "?", "ok", "2", "√√", "Ya/Tidak"])("never guesses %j", (value) => {
    expect(bacaTanda(value)).toBe("tidak_dikenal");
  });
});

describe("turunkan (mirrors impor_peserta_pemilihan)", () => {
  it("needs exactly one of Dapat Dipilih / Tidak Dapat Dipilih", () => {
    expect(turunkan({ memilih: "ya", dipilih: "ya", tidakDipilih: "kosong" }).dapatDipilih).toBe(true);
    expect(turunkan({ memilih: "ya", dipilih: "tidak", tidakDipilih: "ya" }).dapatDipilih).toBe(false);
    expect(turunkan({ memilih: "ya", dipilih: "ya", tidakDipilih: "ya" }).dapatDipilih).toBeNull();
    expect(turunkan({ memilih: "ya", dipilih: "kosong", tidakDipilih: "kosong" }).dapatDipilih).toBeNull();
    expect(turunkan({ memilih: "ya", dipilih: "tidak_dikenal", tidakDipilih: "ya" }).dapatDipilih).toBeNull();
  });
  it("a blank Dapat Memilih is no, pending confirmation; an unknown value is unknown", () => {
    expect(turunkan({ memilih: "kosong", dipilih: "ya", tidakDipilih: "kosong" })).toMatchObject({ dapatMemilih: false, perluKonfirmasiMemilih: true });
    expect(turunkan({ memilih: "tidak", dipilih: "ya", tidakDipilih: "kosong" })).toMatchObject({ dapatMemilih: false, perluKonfirmasiMemilih: false });
    expect(turunkan({ memilih: "tidak_dikenal", dipilih: "ya", tidakDipilih: "kosong" }).dapatMemilih).toBeNull();
  });
});

describe("kunciNama (the import's normalizer)", () => {
  it("ignores honorifics, degrees, case, accents, double spaces, br./Br., and spaced hyphens", () => {
    expect(kunciNama("Contoh Fajar Butar - butar")).toBe(kunciNama("Bpk. Contoh Fajar Butar-Butar"));
    expect(kunciNama("Contoh Citra Br. Simanjuntak")).toBe(kunciNama("Ibu Contoh Citra br Simanjuntak"));
    expect(kunciNama("Sdri.  José   Ananda, S.Th.")).toBe("jose ananda");
    expect(kunciNama("Pdt. Em. Yohanes")).toBe("yohanes");
    expect(kunciNama("Bpk.")).toBe("");
  });
});

describe("readXlsx", () => {
  it("reads the fixture's visible sheets with their merged header", () => {
    const sheets = readXlsx(fixture());
    expect(sheets.map((s) => s.name)).toEqual(["Wil. 1", "Maja"]);
    expect(sheets[0]!.rows[5]![2]).toBe("Dapat\nMemilih");
    expect(sheets[0]!.rows[7]![2]).toBe("√");
    expect(sheets[0]!.merges).toContainEqual({ top: 5, left: 5, bottom: 5, right: 6 });
  });

  it("never evaluates a formula: the stored value, or empty without one", () => {
    const data = buatXlsx([
      {
        name: "Data",
        rows: [
          [
            { formula: "1+1" },
            { formula: "1+1", stored: "2", type: "n" },
            { formula: 'IF(TRUE,"√","")', stored: "√" },
            { formula: 'HYPERLINK("https://example.com","Ya")' },
            { formula: "=cmd|' /C calc'!A0", stored: "" },
          ],
        ],
      },
    ]);
    const [sheet] = readXlsx(data);
    // Trailing cells without a value aren't stored at all.
    expect(sheet!.rows[0]).toEqual(["", "2", "√"]);
    expect(JSON.stringify(sheet)).not.toMatch(/HYPERLINK|IF\(|cmd/);
  });

  it("reads shared strings, numbers, and booleans; skips hidden sheets; ignores hyperlinks", () => {
    const data = buatXlsx([
      { name: "Terlihat", rows: [[{ shared: "Ya" }, 1, true, false, "teks"]], hyperlink: "https://example.com/rahasia" },
      { name: "Tersembunyi", state: "hidden", rows: [["x"]] },
      { name: "Sangat Tersembunyi", state: "veryHidden", rows: [["y"]] },
    ]);
    const sheets = readXlsx(data);
    expect(sheets.map((s) => s.name)).toEqual(["Terlihat"]);
    expect(sheets[0]!.rows[0]).toEqual(["Ya", "1", "TRUE", "FALSE", "teks"]);
    expect(JSON.stringify(sheets)).not.toContain("example.com");
  });

  it("refuses files that aren't XLSX", () => {
    expect(() => readXlsx(new TextEncoder().encode("No,Nama\n1,Adi"))).toThrow(XlsxError);
  });
});

describe("header detection", () => {
  it("finds the two-row header below the title block in the fixture", () => {
    const [wil1, maja] = readXlsx(fixture());
    expect(cariJudul(wil1!)).toEqual({
      peta: { no: 0, nama: 1, memilih: 2, dipilih: 3, tidakDipilih: 4, usiaMuda: 5, usiaTua: 6, domisili: 7, keterangan: 8 },
      barisData: 7,
      kurang: [],
    });
    // Domisili is optional: Maja has none, and Keterangan moved to H.
    expect(cariJudul(maja!)?.peta).toEqual({ no: 0, nama: 1, memilih: 2, dipilih: 3, tidakDipilih: 4, usiaMuda: 5, usiaTua: 6, keterangan: 7 });
  });

  it("maps columns by their text, not their position, and without merged cells", () => {
    const rows: TestCell[][] = [
      ["Daftar"],
      [],
      ["KETERANGAN", "Tidak  Dapat Dipilih", "nama", "DAPAT DIPILIH", "No", "Dapat Memilih", null, "Usia"],
      [null, null, null, null, null, null, "> 65", "<25"],
      ["", "", "Contoh Adi", "Ya", "1", "Y", "", ""],
    ];
    const [sheet] = readXlsx(buatXlsx([{ name: "Acak", rows }]));
    const judul = cariJudul(sheet!);
    expect(judul?.peta).toEqual({ keterangan: 0, tidakDipilih: 1, nama: 2, dipilih: 3, no: 4, memilih: 5, usiaTua: 6, usiaMuda: 7 });
    expect(judul?.barisData).toBe(4);
  });

  it("skips a sheet without the header, or with a required column missing", () => {
    const sheets = readXlsx(
      buatXlsx([
        { name: "Rekap", rows: [["Jumlah", 12]] },
        { name: "Kurang", rows: [["No", "Nama", "Dapat Memilih"], [1, "Adi", "√"]] },
      ]),
    );
    expect(bacaLembar(sheets[0]!, "a.xlsx").lembar.dilewati).toBe("Tidak ada baris judul dengan kolom No dan Nama.");
    expect(bacaLembar(sheets[1]!, "a.xlsx").lembar.dilewati).toBe("Kolom Dapat Dipilih, Tidak Dapat Dipilih tidak ditemukan.");
  });
});

describe("rows", () => {
  it("reads the fixture's rows, values, and per-row validation", () => {
    const [wil1, maja] = readXlsx(fixture());
    const a = bacaLembar(wil1!, "peserta.xlsx");
    const b = bacaLembar(maja!, "peserta.xlsx");
    expect(a.lembar).toEqual({ sumber: "peserta.xlsx › Wil. 1", kelompokWilayah: "Wil. 1", jumlahBaris: 9, dilewati: null });
    expect(b.lembar.jumlahBaris).toBe(6);

    const byName = new Map([...a.baris, ...b.baris].map((row) => [`${row.kelompokWilayah}:${row.nama}`, row]));
    expect(byName.get("Wil. 1:Contoh Budi Santoso")).toMatchObject({
      baris: 9,
      nomor: "2",
      tandaMemilih: "ya",
      tandaDipilih: "kosong",
      tandaTidakDipilih: "ya",
      usia: ">65",
      domisili: "Perum Contoh",
      galat: [],
    });
    expect(byName.get("Wil. 1:Contoh Dewi Lestari")?.usia).toBe("<25");
    expect(byName.get("Wil. 1:Contoh Eko")?.keterangan).toBe("blm genap 2 tahun");
    expect(byName.get("Wil. 1:Contoh Gita Ananda")?.galat).toEqual([PESAN.dipilihGanda]);
    expect(byName.get("Wil. 1:Contoh Hana")?.galat).toEqual([PESAN.dipilihKosong]);
    expect(byName.get("Maja:Contoh Maria Ulfa")).toMatchObject({ galat: [], peringatan: [PESAN.memilihKosong], tandaMemilih: "kosong" });
    // A skipped number is information, not an error.
    expect(byName.get("Maja:Contoh Kartika Sari")).toMatchObject({ galat: [], info: ["Nomor melompat dari 2 ke 5."] });
  });

  it("reads every accepted tick format the same way, and ignores rows without a name", () => {
    const ticks: TestCell[] = ["√", "✓", "✔", "v", "Ya", "Y", 1, true, { shared: "TRUE" }, { formula: "1=1", stored: "1", type: "b" }];
    const rows: TestCell[][] = [
      ...JUDUL_PANITIA,
      ...ticks.map((tick, i): TestCell[] => [i + 1, `Contoh Orang ${i + 1}`, tick, tick, null, null, null, null, null]),
      [null, null, null, null, null, null, null, null, null],
      [null, "", "√", "√", null],
    ];
    const [sheet] = readXlsx(buatXlsx([{ name: "Wil. 2", rows, merges: GABUNGAN_JUDUL }]));
    const { baris } = bacaLembar(sheet!, "wil2.xlsx");
    expect(baris).toHaveLength(ticks.length);
    for (const row of baris) {
      expect(row).toMatchObject({ tandaMemilih: "ya", tandaDipilih: "ya", tandaTidakDipilih: "kosong", galat: [] });
    }
  });

  it("explicit no values, and a formula cell, are never read as a tick", () => {
    const rows: TestCell[][] = [
      ...JUDUL_PANITIA,
      [1, "Contoh A", "Tidak", "√", 0, null, null, null, null],
      [2, "Contoh B", { formula: '"√"' }, false, "Ya", null, null, null, null],
      [3, "Contoh C", "x", "√", null, null, null, null, null],
    ];
    const [sheet] = readXlsx(buatXlsx([{ name: "Wil. 2", rows, merges: GABUNGAN_JUDUL }]));
    const [a, b, c] = bacaLembar(sheet!, "wil2.xlsx").baris;
    expect(a).toMatchObject({ tandaMemilih: "tidak", tandaDipilih: "ya", tandaTidakDipilih: "tidak", galat: [], peringatan: [] });
    // The formula '"√"' has no stored value: the cell is empty, never "√".
    expect(b).toMatchObject({ tandaMemilih: "kosong", tandaDipilih: "tidak", tandaTidakDipilih: "ya", peringatan: [PESAN.memilihKosong] });
    expect(c!.galat).toEqual(['Nilai "x" di kolom Dapat Memilih tidak dikenali.']);
  });

  it("names the group after the sheet, or the file for a default sheet name", () => {
    expect(namaKelompok("Peserta Maja.xlsx", "Maja")).toBe("Maja");
    expect(namaKelompok("Teluk Lada.xlsx", "Sheet1")).toBe("Teluk Lada");
    expect(namaKelompok("Luar Rangkasbitung.XLSX", "Lembar1")).toBe("Luar Rangkasbitung");
  });
});

describe("matching (fixture)", () => {
  const people = [
    jemaat("j-adi", "Bpk. Contoh Adi Pratama"),
    jemaat("j-budi", "Contoh Budi Santoso"),
    jemaat("j-citra", "Ibu Contoh Citra br Simanjuntak"),
    jemaat("j-dewi", "Sdri. Contoh Dewi Lestari"),
    jemaat("j-eko-1", "Contoh Eko", "Jl. Raya", "Wilayah Kota"),
    jemaat("j-eko-2", "Contoh Eko", "Jl. Bypass No. 3", null),
    jemaat("j-fajar", "Bpk. Contoh Fajar Butar-Butar"),
    jemaat("j-gita", "Contoh Gita Ananda"),
    jemaat("j-hana", "Contoh Hana"),
    jemaat("j-ester", "Ibu Contoh Ester", "Kaduagung"),
    jemaat("j-indra", "Contoh Indra Wijaya"),
    jemaat("j-maria", "Contoh Maria Ulfa"),
  ];
  const pratinjau = () => susunPratinjau([{ name: "peserta.xlsx", sheets: readXlsx(fixture()) }], people);
  const row = (kelompok: string, nama: string) => pratinjau().baris.find((r) => r.kelompokWilayah === kelompok && r.nama === nama)!;

  it("a unique name is Cocok, with its jemaat", () => {
    expect(row("Wil. 1", "Contoh Adi Pratama")).toMatchObject({ kategori: "cocok", jemaatId: "j-adi", calonJemaatIds: ["j-adi"] });
    expect(row("Wil. 1", "Contoh Fajar Butar - butar")).toMatchObject({ kategori: "cocok", jemaatId: "j-fajar" });
    expect(row("Wil. 1", "Contoh Citra Br. Simanjuntak")).toMatchObject({ kategori: "cocok", jemaatId: "j-citra" });
  });

  it("two jemaat with the name are Ambigu, the Domisili match first", () => {
    expect(row("Wil. 1", "Contoh Eko")).toMatchObject({ kategori: "ambigu", jemaatId: null, calonJemaatIds: ["j-eko-2", "j-eko-1"] });
  });

  it("the same name in two sheets is Ambigu even with one jemaat, on both rows", () => {
    for (const kelompok of ["Wil. 1", "Maja"]) {
      const r = row(kelompok, "Contoh Ester");
      expect(r).toMatchObject({ kategori: "ambigu", jemaatId: null, calonJemaatIds: ["j-ester"] });
      expect(r.catatan).toContain(PESAN.namaGanda);
    }
  });

  it("a name not in Data Jemaat is Tidak ditemukan", () => {
    expect(row("Maja", "Contoh Joko")).toMatchObject({ kategori: "tidak_ditemukan", jemaatId: null, calonJemaatIds: [] });
  });

  it("validation errors are their own group, keeping the match; a blank Dapat Memilih isn't resolved yet", () => {
    expect(row("Wil. 1", "Contoh Gita Ananda")).toMatchObject({ kategori: "error", jemaatId: "j-gita", catatan: [PESAN.dipilihGanda] });
    expect(row("Wil. 1", "Contoh Hana")).toMatchObject({ kategori: "error", catatan: [PESAN.dipilihKosong] });
    const maria = row("Maja", "Contoh Maria Ulfa");
    expect(maria).toMatchObject({ kategori: "cocok", jemaatId: "j-maria" });
    expect(beresSaatImpor(maria)).toBe(false);
    expect(beresSaatImpor(row("Wil. 1", "Contoh Adi Pratama"))).toBe(true);
  });

  it("summarizes every sheet", () => {
    expect(pratinjau().lembar.map((l) => [l.kelompokWilayah, l.jumlahBaris])).toEqual([
      ["Wil. 1", 9],
      ["Maja", 6],
    ]);
    expect(pratinjau().baris).toHaveLength(15);
  });

  it("matching ignores rows' order and is stable", () => {
    const rows = bacaLembar(readXlsx(fixture())[0]!, "x.xlsx").baris;
    expect(cocokkan(rows, people)).toEqual(cocokkan(rows, [...people].reverse()));
  });
});
