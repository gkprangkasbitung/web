import { describe, expect, it } from "vitest";

import { formatJam, hasAttendance, hasField, layoutFor, PERIBADAHAN_LAYOUTS, SMKA_GROUPS, UMUM_LAYOUT } from "./peribadahan";

describe("layoutFor", () => {
  it("falls back to the umum layout for an unknown key (brief §9.5)", () => {
    expect(layoutFor("bukan-kategori")).toBe(UMUM_LAYOUT);
  });

  it("has all 9 seeded categories, each with Waktu", () => {
    for (const key of ["umum", "smka", "krt", "pa", "lansia", "perempuan", "pria", "doa_pagi", "pemuda_remaja"]) {
      expect(PERIBADAHAN_LAYOUTS[key]?.fields).toContain("waktu");
    }
  });

  it("matches the brief's table of fields besides Tanggal per category", () => {
    expect(layoutFor("umum").fields).toEqual(["waktu", "tempat", "pelayanFirman", "liturgos"]);
    expect(layoutFor("smka").fields).toEqual(["waktu", "tema", "liturgos", "pemusik", "bahanAlkitab", "smkaGrid"]);
    expect(layoutFor("krt").fields).toEqual(["waktu", "tempat", "wilayah", "dpa", "tema", "pelayanFirman", "liturgos"]);
    expect(layoutFor("doa_pagi").fields).toEqual(["waktu", "tempat"]);
  });

  it("matches the brief's table of attendance fields per category", () => {
    expect(layoutFor("umum").attendance).toEqual(["lakiLaki", "perempuan", "anak"]);
    expect(layoutFor("smka").attendance).toEqual([]);
    expect(layoutFor("lansia").attendance).toEqual(["lakiLaki", "perempuan"]);
    expect(layoutFor("perempuan").attendance).toEqual(["perempuan"]);
    expect(layoutFor("pria").attendance).toEqual(["lakiLaki"]);
  });

  it("SMKA has no notes field; every other category does", () => {
    expect(layoutFor("smka").notesLabel).toBeNull();
    expect(layoutFor("umum").notesLabel).toBe("Keterangan");
    expect(layoutFor("krt").notesLabel).toBe("Catatan");
  });

  it("SMKA's Liturgos is labelled Pelayan Liturgi, everyone else's is Liturgos", () => {
    expect(layoutFor("smka").liturgosLabel).toBe("Pelayan Liturgi");
    expect(layoutFor("umum").liturgosLabel).toBe("Liturgos");
  });
});

describe("hasField / hasAttendance", () => {
  it("reflect the row's own category, never another one's", () => {
    expect(hasField("pria", "wilayah")).toBe(false);
    expect(hasField("krt", "wilayah")).toBe(true);
    expect(hasAttendance("pria", "perempuan")).toBe(false);
    expect(hasAttendance("pria", "lakiLaki")).toBe(true);
  });

  it("an unknown key behaves exactly like umum", () => {
    expect(hasField("bukan-kategori", "tempat")).toBe(hasField("umum", "tempat"));
    expect(hasAttendance("bukan-kategori", "anak")).toBe(hasAttendance("umum", "anak"));
  });
});

describe("SMKA_GROUPS", () => {
  it("has the 8 fixed groups in display order, PF only for the 6 kelas rows", () => {
    expect(SMKA_GROUPS.map((g) => g.key)).toEqual([
      "batita",
      "balita",
      "kecil",
      "tanggung",
      "besar",
      "tunas_remaja",
      "guru_sekolah_minggu",
      "orang_tua",
    ]);
    expect(SMKA_GROUPS.filter((g) => !g.hasPf).map((g) => g.key)).toEqual(["guru_sekolah_minggu", "orang_tua"]);
  });
});

describe("formatJam", () => {
  it("shows HH.MM, dropping seconds", () => {
    expect(formatJam("09:00:00")).toBe("09.00");
    expect(formatJam("09:00")).toBe("09.00");
  });

  it("is blank for a null time", () => {
    expect(formatJam(null)).toBe("");
  });
});
