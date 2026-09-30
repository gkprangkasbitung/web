import { describe, expect, it } from "vitest";

import { buildWaLink } from "./whatsapp";

describe("buildWaLink (brief §14.1, §D)", () => {
  it("strips non-digits and turns a leading 0 into the 62 country code", () => {
    expect(buildWaLink("0812-3456-7890")).toBe("https://wa.me/6281234567890");
  });

  it("keeps a number already in international format", () => {
    expect(buildWaLink("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
  });
});
