import { describe, expect, it } from "vitest";

import {
  groupByDate,
  parseFullScheduleRows,
  parseUpcomingScheduleRows,
  scheduleFields,
  type PublicScheduleRow,
} from "./public-schedule";

function row(overrides: Partial<PublicScheduleRow>): PublicScheduleRow {
  return {
    id: "r1",
    tanggal: "2025-11-30",
    jam: null,
    categoryKey: "umum",
    categoryName: "Kebaktian Minggu",
    tempatNama: null,
    wilayahNama: null,
    dpa: null,
    tema: null,
    pelayanFirmanNama: null,
    liturgosNama: null,
    pemusikNama: null,
    bahanAlkitab: null,
    kehadiranLakiLaki: null,
    kehadiranPerempuan: null,
    kehadiranAnak: null,
    catatan: null,
    smkaKelompok: [],
    ...overrides,
  };
}

const labels = (r: PublicScheduleRow) => scheduleFields(r).map((field) => field.label);

describe("scheduleFields (brief §8, stage-6 layouts)", () => {
  it("shows only filled fields, in §8's order, with the category's notes label", () => {
    const fields = scheduleFields(
      row({
        jam: "09:00:00",
        tempatNama: "Gedung Contoh",
        pelayanFirmanNama: "Contoh Pendeta",
        liturgosNama: "Contoh Liturgos",
        kehadiranLakiLaki: 10,
        kehadiranPerempuan: 12,
        kehadiranAnak: 5,
        catatan: "Baris satu\nBaris dua",
      }),
    );
    expect(fields.map((field) => [field.label, field.value])).toEqual([
      ["Waktu", "09.00"],
      ["Tempat", "Gedung Contoh"],
      ["Pelayan Firman", "Contoh Pendeta"],
      ["Liturgos", "Contoh Liturgos"],
      ["Kehadiran Laki-laki", "10"],
      ["Kehadiran Perempuan", "12"],
      ["Kehadiran Anak-anak", "5"],
      ["Keterangan", "Baris satu\nBaris dua"],
    ]);
    expect(fields.at(-1)?.multiline).toBe(true);
  });

  it("hides empty and whitespace-only values but keeps an attendance of 0", () => {
    expect(labels(row({ tempatNama: "  ", liturgosNama: "", kehadiranAnak: 0 }))).toEqual(["Kehadiran Anak-anak"]);
  });

  it("labels the liturgos 'Pelayan Liturgi' for SMKA and shows Pemusik and Bahan Alkitab there", () => {
    const smka = row({
      categoryKey: "smka",
      categoryName: "Kebaktian SMKA",
      jam: "08:00:00",
      tema: "Tema SMKA",
      liturgosNama: "Contoh Liturgi",
      pemusikNama: "Contoh Pemusik",
      bahanAlkitab: "Markus 10:13-16",
      catatan: "tidak dipakai SMKA",
      kehadiranLakiLaki: 3,
    });
    expect(labels(smka)).toEqual(["Waktu", "Tema", "Pelayan Liturgi", "Pemusik", "Bahan Alkitab"]);
  });

  it("never shows a field outside the category's layout, even when the row has a value", () => {
    const pria = row({
      categoryKey: "pria",
      categoryName: "Kebaktian Pria",
      wilayahNama: "Wilayah Contoh",
      pemusikNama: "Contoh Pemusik",
      kehadiranLakiLaki: 7,
      kehadiranPerempuan: 4,
      catatan: "Catatan pria",
    });
    expect(labels(pria)).toEqual(["Kehadiran Laki-laki", "Catatan"]);
  });

  it("shows Wilayah and DPA for Kebaktian Rumah Tangga", () => {
    expect(labels(row({ categoryKey: "krt", wilayahNama: "Wilayah Contoh", dpa: "DPA contoh" }))).toEqual([
      "Wilayah",
      "DPA",
    ]);
  });

  it("uses the umum layout for an unknown category key", () => {
    expect(labels(row({ categoryKey: "baru", tempatNama: "Gedung Contoh", dpa: "tidak ada di umum" }))).toEqual([
      "Tempat",
    ]);
  });
});

const RAW_FULL = {
  id: "r1",
  tanggal: "2025-11-30",
  jam: "09:00:00",
  sort_order: 0,
  category_key: "smka",
  category_name: "Kebaktian SMKA",
  tempat_nama: null,
  wilayah_nama: null,
  dpa: null,
  tema: null,
  pelayan_firman_nama: null,
  liturgos_nama: "Contoh",
  pemusik_nama: null,
  bahan_alkitab: null,
  kehadiran_laki_laki: null,
  kehadiran_perempuan: null,
  kehadiran_anak: null,
  catatan: null,
  smka_kelompok: [
    { kelompok: "batita", pf_nama: "Contoh PF", laki_laki: 1, perempuan: 2 },
    { kelompok: "orang_tua", pf_nama: null, laki_laki: 0, perempuan: null },
  ],
};

describe("parsing the public functions' rows", () => {
  it("accepts the nullable columns the generated types call non-null, and labels the SMKA groups", () => {
    const [parsed] = parseFullScheduleRows([RAW_FULL]);
    expect(parsed?.smkaKelompok).toEqual([
      { kelompok: "batita", label: "Kelas Batita", pfNama: "Contoh PF", lakiLaki: 1, perempuan: 2 },
      { kelompok: "orang_tua", label: "Orang Tua", pfNama: null, lakiLaki: 0, perempuan: null },
    ]);
    expect(parsed?.tempatNama).toBeNull();
  });

  it("rejects an unexpected shape instead of rendering garbage", () => {
    expect(() => parseFullScheduleRows([{ ...RAW_FULL, tanggal: "30-11-2025" }])).toThrow();
    expect(() => parseFullScheduleRows([{ ...RAW_FULL, smka_kelompok: null }])).toThrow();
  });

  it("parses public_jadwal_mendatang rows, which carry no attendance, catatan, or grid", () => {
    const { kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan, smka_kelompok, ...upcoming } = RAW_FULL;
    void [kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan, smka_kelompok];
    const [parsed] = parseUpcomingScheduleRows([upcoming]);
    expect(parsed).toMatchObject({ liturgosNama: "Contoh", catatan: null, kehadiranLakiLaki: null, smkaKelompok: [] });
  });
});

describe("groupByDate", () => {
  it("groups consecutive rows by date and keeps their order", () => {
    const groups = groupByDate([
      row({ id: "a", tanggal: "2025-11-30" }),
      row({ id: "b", tanggal: "2025-11-30" }),
      row({ id: "c", tanggal: "2025-12-03" }),
    ]);
    expect(groups.map((group) => [group.tanggal, group.rows.map((r) => r.id)])).toEqual([
      ["2025-11-30", ["a", "b"]],
      ["2025-12-03", ["c"]],
    ]);
  });
});
