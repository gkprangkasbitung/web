import { describe, expect, it } from "vitest";

import { isKegiatanWarna, kategoriBadgeStyle, kategoriDotColor, KEGIATAN_WARNA_PALETTE } from "./kegiatan-kategori";

describe("isKegiatanWarna", () => {
  it("accepts exactly the 8 palette keys and nothing else", () => {
    for (const key of KEGIATAN_WARNA_PALETTE) expect(isKegiatanWarna(key)).toBe(true);
    expect(isKegiatanWarna("violet")).toBe(false);
    expect(isKegiatanWarna("")).toBe(false);
  });
});

describe("kategoriBadgeStyle / kategoriDotColor", () => {
  it("resolve to that key's CSS variables", () => {
    expect(kategoriBadgeStyle("hijau")).toEqual({ backgroundColor: "var(--kegiatan-hijau-bg)", color: "var(--kegiatan-hijau-fg)" });
    expect(kategoriDotColor("oranye")).toBe("var(--kegiatan-oranye-dot)");
  });

  it("fall back to abu for an unrecognized value, rather than emitting an invalid CSS variable", () => {
    expect(kategoriBadgeStyle("violet")).toEqual({ backgroundColor: "var(--kegiatan-abu-bg)", color: "var(--kegiatan-abu-fg)" });
    expect(kategoriDotColor("violet")).toBe("var(--kegiatan-abu-dot)");
  });
});
