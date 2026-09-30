import { describe, expect, it } from "vitest";

import { randomSlugSuffix, slugify, wartaSlug } from "./warta";

// Mirrors the DB's warta_slug_format_check (0026).
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify() (brief §9.4)", () => {
  it("builds the slug from tanggal and judul", () => {
    expect(wartaSlug("2025-11-30", "Minggu Adven I")).toBe("2025-11-30-minggu-adven-i");
  });

  it("strips diacritics", () => {
    expect(slugify("Paskah Kebangkitan — Crème Brûlée Façade")).toBe("paskah-kebangkitan-creme-brulee-facade");
  });

  it("turns every run of other characters into one dash and trims dashes", () => {
    expect(slugify("  --Minggu,  Pentakosta!! (II)--  ")).toBe("minggu-pentakosta-ii");
    expect(slugify("A/B\\C_D.E")).toBe("a-b-c-d-e");
  });

  it("keeps only the date when the judul has no latin letters or digits", () => {
    expect(wartaSlug("2025-11-30", "✝ ✝ ✝")).toBe("2025-11-30");
  });

  it("always matches the database's slug format", () => {
    for (const judul of ["Minggu Adven I", "Natal 2025!", "Kebaktian — Syukur", "Ñandú & Café"]) {
      expect(wartaSlug("2025-12-25", judul)).toMatch(SLUG_FORMAT);
    }
  });
});

describe("randomSlugSuffix()", () => {
  it("is 4 lowercase base-36 characters, so base + suffix is still a valid slug", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = randomSlugSuffix();
      expect(suffix).toMatch(/^[0-9a-z]{4}$/);
      expect(`2025-11-30-minggu-adven-i-${suffix}`).toMatch(SLUG_FORMAT);
    }
  });
});
