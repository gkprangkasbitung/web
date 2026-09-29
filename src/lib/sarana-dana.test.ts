import { describe, expect, it } from "vitest";

import { formatSignedJumlah, ledgerRangeParam, parseLedgerRangeParam } from "./sarana-dana";

describe("formatSignedJumlah", () => {
  it("prefixes income with + and expense with − (brief §9.7)", () => {
    expect(formatSignedJumlah(500_000, "masuk")).toBe("+Rp 500.000");
    expect(formatSignedJumlah(500_000, "keluar")).toBe("−Rp 500.000");
  });

  it("a zero amount still gets the + prefix", () => {
    expect(formatSignedJumlah(0, "masuk")).toBe("+Rp 0");
  });
});

describe("parseLedgerRangeParam / ledgerRangeParam", () => {
  it("round-trips a full range", () => {
    const param = ledgerRangeParam({ start: "2025-01-01", end: "2025-01-31" });
    expect(param).toBe("2025-01-01~2025-01-31");
    expect(parseLedgerRangeParam(param ?? undefined)).toEqual({ start: "2025-01-01", end: "2025-01-31" });
  });

  it("accepts an open-ended range on either side", () => {
    expect(parseLedgerRangeParam("2025-01-01~")).toEqual({ start: "2025-01-01" });
    expect(parseLedgerRangeParam("~2025-01-31")).toEqual({ end: "2025-01-31" });
    expect(ledgerRangeParam({ start: "2025-01-01" })).toBe("2025-01-01~");
  });

  it("ignores an invalid or missing value", () => {
    expect(parseLedgerRangeParam(undefined)).toEqual({});
    expect(parseLedgerRangeParam("bukan-tanggal")).toEqual({});
    expect(ledgerRangeParam({})).toBeNull();
  });
});
