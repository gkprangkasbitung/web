import { describe, expect, it } from "vitest";

import { formatTanggalRange, formatTanggalRangeLong, formatWaktuRange, isSepanjangHari } from "./kegiatan";

describe("isSepanjangHari", () => {
  it("is true only when both times are empty", () => {
    expect(isSepanjangHari(null, null)).toBe(true);
    expect(isSepanjangHari("09:00", null)).toBe(false);
    expect(isSepanjangHari(null, "09:00")).toBe(false);
    expect(isSepanjangHari("09:00", "11:00")).toBe(false);
  });
});

describe("formatWaktuRange", () => {
  it("shows a range when both times are set", () => {
    expect(formatWaktuRange("09:00", "11:00")).toBe("09.00 – 11.00 WIB");
  });

  it("shows one time when only one end is set", () => {
    expect(formatWaktuRange("09:00", null)).toBe("09.00 WIB");
    expect(formatWaktuRange(null, "11:00")).toBe("11.00 WIB");
  });

  it("says Sepanjang hari when neither is set", () => {
    expect(formatWaktuRange(null, null)).toBe("Sepanjang hari");
  });
});

describe("formatTanggalRange / formatTanggalRangeLong (thin wrappers over lib/dates.ts)", () => {
  it("delegate to the date-range formatters", () => {
    expect(formatTanggalRange("2026-10-16", "2026-10-18")).toBe("16 – 18 Oktober 2026");
    expect(formatTanggalRangeLong("2026-10-16", "2026-10-18")).toBe("Jumat, 16 – Minggu, 18 Oktober 2026");
  });
});
