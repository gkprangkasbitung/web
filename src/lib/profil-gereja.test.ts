import { describe, expect, it } from "vitest";

import { mapsUrlField, misiField, nomorRekeningField, socialUrlField, teleponField } from "./profil-gereja";

function accepts(field: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) {
  return field.safeParse(value).success;
}

describe("mapsUrlField (brief §14.1: google.com/maps or maps.app.goo.gl only)", () => {
  it("accepts Google Maps links and normalizes them", () => {
    expect(mapsUrlField.parse("https://maps.app.goo.gl/AbC123")).toBe("https://maps.app.goo.gl/AbC123");
    expect(mapsUrlField.parse("https://www.google.com/maps/place/Rangkasbitung")).toBe(
      "https://www.google.com/maps/place/Rangkasbitung",
    );
    expect(mapsUrlField.parse("HTTPS://Google.com/maps?q=gereja")).toBe("https://google.com/maps?q=gereja");
    expect(mapsUrlField.parse("  ")).toBeNull();
  });

  it("refuses other hosts, lookalikes, http, and other google.com paths", () => {
    for (const url of [
      "https://evil.example/maps",
      "https://google.com.evil.example/maps",
      "https://www.google.com@evil.example/maps",
      "https://maps.app.goo.gl.evil.example/x",
      "http://www.google.com/maps/place/x",
      "https://www.google.com/search?q=maps",
      "https://www.google.com/mapsevil",
      "javascript:alert(1)",
      "bukan url",
    ]) {
      expect(accepts(mapsUrlField, url), url).toBe(false);
    }
  });
});

describe("socialUrlField (https, host per platform)", () => {
  it("accepts each platform's own https profile URL", () => {
    expect(socialUrlField("instagram").parse("https://www.instagram.com/akun")).toBe("https://www.instagram.com/akun");
    expect(socialUrlField("youtube").parse("https://youtube.com/@kanal")).toBe("https://youtube.com/@kanal");
    expect(socialUrlField("facebook").parse("https://m.facebook.com/halaman")).toBe("https://m.facebook.com/halaman");
  });

  it("refuses another platform's host, lookalikes, userinfo, ports, http, and a bare domain", () => {
    for (const [platform, url] of [
      ["instagram", "https://www.youtube.com/@kanal"],
      ["instagram", "https://instagram.com.evil.example/akun"],
      ["instagram", "https://instagram.com@evil.example/akun"],
      ["instagram", "https://instagram.com:8443/akun"],
      ["instagram", "http://www.instagram.com/akun"],
      ["instagram", "https://www.instagram.com/"],
      ["youtube", "https://youtu.be.evil.example/x"],
      ["facebook", "https://facebook.co/halaman"],
    ] as const) {
      expect(accepts(socialUrlField(platform), url), `${platform} ${url}`).toBe(false);
    }
  });
});

describe("teleponField", () => {
  it("accepts 8-15 digits only; empty is null", () => {
    expect(teleponField.parse("081234567890")).toBe("081234567890");
    expect(teleponField.parse("")).toBeNull();
    expect(accepts(teleponField, "0812-3456-789")).toBe(false);
    expect(accepts(teleponField, "+6281234567")).toBe(false);
    expect(accepts(teleponField, "1234567")).toBe(false);
  });
});

describe("misiField", () => {
  it("splits one misi per line, trimming and dropping blank lines", () => {
    expect(misiField.parse("  Misi satu \r\n\n Misi dua\n")).toEqual(["Misi satu", "Misi dua"]);
    expect(misiField.parse("")).toEqual([]);
  });

  it("refuses more than 20 lines or a line over 500 characters", () => {
    expect(accepts(misiField, Array.from({ length: 21 }, (_, i) => `Misi ${i}`).join("\n"))).toBe(false);
    expect(accepts(misiField, "x".repeat(501))).toBe(false);
  });
});

describe("nomorRekeningField", () => {
  it("accepts digits grouped by spaces or dashes", () => {
    expect(nomorRekeningField.parse("123 456-7890")).toBe("123 456-7890");
    expect(accepts(nomorRekeningField, "12a34")).toBe(false);
    expect(accepts(nomorRekeningField, "-123")).toBe(false);
  });
});
