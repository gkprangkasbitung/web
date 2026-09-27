import { describe, expect, it } from "vitest";

import { formatRupiah, formatThousands, getInitials } from "./format";

describe("formatRupiah()", () => {
  it("formats IDR without decimals", () => {
    expect(formatRupiah(1_500_000)).toBe("Rp 1.500.000");
    expect(formatRupiah(0)).toBe("Rp 0");
    expect(formatRupiah(999)).toBe("Rp 999");
    expect(formatRupiah(1000.4)).toBe("Rp 1.000");
    expect(formatRupiah(-2500)).toBe("−Rp 2.500");
  });

  it("groups thousands with dots", () => {
    expect(formatThousands(1_000_000)).toBe("1.000.000");
  });
});

describe("getInitials()", () => {
  it("uses the first and last word", () => {
    expect(getInitials("Maria Magdalena Siahaan")).toBe("MS");
    expect(getInitials("  budi  ")).toBe("B");
    expect(getInitials("")).toBe("?");
  });
});
