import { describe, expect, it } from "vitest";

import { formatMoneyInput, onlyDigits, parseMoney } from "./digits";

describe("onlyDigits()", () => {
  it("drops everything except digits", () => {
    expect(onlyDigits("+62 812-3456 ab")).toBe("628123456");
    expect(onlyDigits("0812")).toBe("0812");
    expect(onlyDigits("")).toBe("");
  });
});

describe("parseMoney()", () => {
  it("reads id-ID grouped text as a number", () => {
    expect(parseMoney("1.000.000")).toBe(1_000_000);
    expect(parseMoney("Rp 1.500.000")).toBe(1_500_000);
  });

  it("drops non-digits and leading zeros", () => {
    expect(parseMoney("1a0b0")).toBe(100);
    expect(parseMoney("007")).toBe(7);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("000")).toBe(0);
  });

  it("returns null when no digit is left", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("caps the length at 15 digits", () => {
    expect(parseMoney("1234567890123456789")).toBe(123_456_789_012_345);
  });
});

describe("formatMoneyInput()", () => {
  it("round-trips with parseMoney", () => {
    expect(formatMoneyInput(1_000_000)).toBe("1.000.000");
    expect(parseMoney(formatMoneyInput(1_000_000))).toBe(1_000_000);
    expect(formatMoneyInput(0)).toBe("0");
    expect(formatMoneyInput(null)).toBe("");
  });
});
