import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes every cell and escapes embedded quotes", () => {
    expect(toCsv(["A", "B"], [["1", 'has "quotes"']])).toBe('"A","B"\r\n"1","has ""quotes"""');
  });

  it("prefixes a cell starting with =, +, -, @, tab, or CR with a quote, so Excel never runs it as a formula", () => {
    const cases = ["=SUM(A1:A2)", "+1", "-1", "@cmd", "\ttab", "\rcr"];
    for (const cell of cases) {
      expect(toCsv(["x"], [[cell]])).toBe(`"x"\r\n"'${cell}"`);
    }
  });

  it("leaves ordinary text untouched apart from quoting", () => {
    expect(toCsv(["Nama"], [["Andi Contoh"]])).toBe('"Nama"\r\n"Andi Contoh"');
  });
});
