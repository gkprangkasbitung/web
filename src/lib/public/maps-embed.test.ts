import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { embedQueryFromMapsUrl, mapsEmbedSrc } = await import("./maps-embed");

// The real redirect target of a maps.app.goo.gl share link (trimmed).
const PLACE_URL =
  "https://www.google.com/maps/place/GKP+Rangkasbitung/@-6.3499702,106.2483263,21z/data=!4m6!3m5!1s0x2e42170043483dab:0xaeba03074458cc4f!8m2!3d-6.3499703!4d106.2486079!16s%2Fg%2F11zgv16b82?entry=tts";

describe("embedQueryFromMapsUrl", () => {
  it("a place link → its name, centered on the place's own pin", () => {
    expect(embedQueryFromMapsUrl(PLACE_URL)).toEqual({ q: "GKP Rangkasbitung", ll: "-6.3499703,106.2486079" });
  });

  it("coordinates only → the coordinates; a q parameter → its text", () => {
    expect(embedQueryFromMapsUrl("https://www.google.com/maps/@-6.35,106.24,17z")).toEqual({ q: "-6.35,106.24", ll: null });
    expect(embedQueryFromMapsUrl("https://www.google.com/maps?q=Jl.+Contoh+1")).toEqual({ q: "Jl. Contoh 1", ll: null });
  });

  it("anything that isn't an https google.com/maps URL → null", () => {
    expect(embedQueryFromMapsUrl("https://evil.example/maps/place/X")).toBeNull();
    expect(embedQueryFromMapsUrl("http://www.google.com/maps/place/X")).toBeNull();
    expect(embedQueryFromMapsUrl("https://www.google.com/search?q=x")).toBeNull();
    expect(embedQueryFromMapsUrl("bukan url")).toBeNull();
  });
});

describe("mapsEmbedSrc", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a full URL needs no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const src = await mapsEmbedSrc(PLACE_URL, null);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(src).toBe(
      "https://www.google.com/maps?q=GKP+Rangkasbitung&z=16&output=embed&ll=-6.3499703%2C106.2486079",
    );
  });

  it("a share link is resolved through its redirect, once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: PLACE_URL } }));
    vi.stubGlobal("fetch", fetchMock);
    const link = "https://maps.app.goo.gl/contoh1";
    expect(await mapsEmbedSrc(link, null)).toContain("q=GKP+Rangkasbitung");
    expect(await mapsEmbedSrc(link, null)).toContain("q=GKP+Rangkasbitung");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a share link that fails or leaves Google Maps falls back to the alamat", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await mapsEmbedSrc("https://maps.app.goo.gl/contoh2", "Jl. Contoh\n1")).toBe(
      "https://www.google.com/maps?q=Jl.+Contoh+1&z=16&output=embed",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.example/" } })),
    );
    expect(await mapsEmbedSrc("https://maps.app.goo.gl/contoh3", null)).toBeNull();
  });
});
