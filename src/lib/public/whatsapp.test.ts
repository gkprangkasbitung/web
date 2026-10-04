import { describe, expect, it } from "vitest";

import { buildShareWaLink, buildWaLink } from "./whatsapp";

describe("buildWaLink (brief §14.1, §D)", () => {
  it("strips non-digits and turns a leading 0 into the 62 country code", () => {
    expect(buildWaLink("0812-3456-7890")).toBe("https://wa.me/6281234567890");
  });

  it("keeps a number already in international format", () => {
    expect(buildWaLink("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
  });
});

describe("buildShareWaLink (brief §14.4, §D)", () => {
  it("percent-encodes the shared text with no fixed recipient", () => {
    expect(buildShareWaLink("Rapat Majelis\nhttps://example.org/kegiatan/rapat")).toBe(
      "https://wa.me/?text=Rapat%20Majelis%0Ahttps%3A%2F%2Fexample.org%2Fkegiatan%2Frapat",
    );
  });
});
