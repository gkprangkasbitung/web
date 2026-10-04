import { describe, expect, it } from "vitest";

import { buildKegiatanIcs, escapeIcsText, foldIcsLine } from "./ics";

describe("escapeIcsText (RFC 5545 §3.3.11)", () => {
  it("escapes backslash, comma, semicolon, and newlines", () => {
    expect(escapeIcsText("a,b")).toBe("a\\,b");
    expect(escapeIcsText("a;b")).toBe("a\\;b");
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    expect(escapeIcsText("baris satu\nbaris dua")).toBe("baris satu\\nbaris dua");
    expect(escapeIcsText("baris satu\r\nbaris dua")).toBe("baris satu\\nbaris dua");
  });

  it("escapes the backslash first, so it doesn't re-escape the characters it just produced", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });
});

describe("foldIcsLine (RFC 5545 §3.1: 75 octets per physical line)", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("SUMMARY:Rapat")).toBe("SUMMARY:Rapat");
  });

  it("folds a long ASCII line at 75 octets, continuation lines starting with a space", () => {
    const long = "SUMMARY:" + "x".repeat(100);
    const folded = foldIcsLine(long);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(lines[0]!).length).toBe(75);
    for (const line of lines.slice(1)) {
      expect(line.startsWith(" ")).toBe(true);
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.join("").replace(/ /g, "")).toBe(long.replace(/ /g, ""));
  });

  it("never splits inside a multi-byte UTF-8 character", () => {
    // Each "é" is 2 octets; a naive 75-char split could fall mid-character.
    const long = "SUMMARY:" + "é".repeat(60);
    const folded = foldIcsLine(long);
    for (const line of folded.split("\r\n")) {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(line))).not.toThrow();
    }
  });
});

const BASE_EVENT = {
  id: "11111111-1111-4111-8111-111111111111",
  judul: "Rapat",
  tanggalMulai: "2026-10-16",
  tanggalSelesai: "2026-10-16",
  waktuMulai: null as string | null,
  waktuSelesai: null as string | null,
  tempat: null as string | null,
  deskripsi: null as string | null,
  origin: "https://gkprangkasbitung.org",
  slug: "rapat",
};

describe("buildKegiatanIcs", () => {
  const NOW = new Date("2026-10-04T03:00:00Z");

  it("has the required VCALENDAR/VEVENT structure, a stable UID, and the configured origin's URL", () => {
    const ics = buildKegiatanIcs(BASE_EVENT, NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain(`UID:${BASE_EVENT.id}@gkprangkasbitung.org`);
    expect(ics).toContain("URL:https://gkprangkasbitung.org/kegiatan/rapat");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("converts a timed event from WIB to UTC (19.00 WIB -> 12.00 UTC, same date)", () => {
    const ics = buildKegiatanIcs({ ...BASE_EVENT, waktuMulai: "19:00", waktuSelesai: "21:00" }, NOW);
    expect(ics).toContain("DTSTART:20261016T120000Z");
    expect(ics).toContain("DTEND:20261016T140000Z");
  });

  it("converts an overnight event across midnight WIB correctly", () => {
    const ics = buildKegiatanIcs(
      { ...BASE_EVENT, tanggalMulai: "2026-10-16", tanggalSelesai: "2026-10-17", waktuMulai: "23:00", waktuSelesai: "01:00" },
      NOW,
    );
    expect(ics).toContain("DTSTART:20261016T160000Z");
    expect(ics).toContain("DTEND:20261016T180000Z");
  });

  it("an all-day event (no times) uses VALUE=DATE, with DTEND the day after tanggal_selesai", () => {
    const ics = buildKegiatanIcs({ ...BASE_EVENT, tanggalMulai: "2026-10-16", tanggalSelesai: "2026-10-18" }, NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261016");
    expect(ics).toContain("DTEND;VALUE=DATE:20261019");
  });

  it("an all-day event spanning a month/year end still gets the correct next day", () => {
    const ics = buildKegiatanIcs({ ...BASE_EVENT, tanggalMulai: "2026-12-30", tanggalSelesai: "2026-12-31" }, NOW);
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("escapes judul/deskripsi/tempat and includes LOCATION/DESCRIPTION only when set", () => {
    const ics = buildKegiatanIcs(
      { ...BASE_EVENT, judul: "Rapat, penting; catatan", deskripsi: "Baris 1\nBaris 2", tempat: "Aula; Lt. 2" },
      NOW,
    );
    expect(ics).toMatch(/SUMMARY:Rapat\\, penting\\; catatan/);
    expect(ics).toContain("DESCRIPTION:Baris 1\\nBaris 2");
    expect(ics).toContain("LOCATION:Aula\\; Lt. 2");
  });

  it("omits DESCRIPTION/LOCATION when not set", () => {
    const ics = buildKegiatanIcs(BASE_EVENT, NOW);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });

  it("DTSTAMP is the given `now`, in UTC", () => {
    const ics = buildKegiatanIcs(BASE_EVENT, new Date("2026-10-04T03:04:05Z"));
    expect(ics).toContain("DTSTAMP:20261004T030405Z");
  });
});
