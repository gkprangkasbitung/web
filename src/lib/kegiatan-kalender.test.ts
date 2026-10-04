import { describe, expect, it } from "vitest";

import { agendaFromCells, buildMonthCells, cellAriaLabel } from "./kegiatan-kalender";
import type { PublicKegiatanBulanRow } from "./public-kegiatan";

function event(overrides: Partial<PublicKegiatanBulanRow>): PublicKegiatanBulanRow {
  return {
    id: "e1",
    judul: "Contoh",
    slug: "contoh",
    tanggalMulai: "2026-10-01",
    tanggalSelesai: "2026-10-01",
    waktuMulai: null,
    waktuSelesai: null,
    tempat: null,
    kategoriId: "k1",
    kategoriNama: "Ibadah khusus",
    kategoriWarna: "hijau",
    ...overrides,
  };
}

describe("buildMonthCells (brief §14.4: the kalender kegiatan's grid)", () => {
  it("starts on Minggu and fills whole weeks (October 2026: 4 leading days, 5 rows)", () => {
    const cells = buildMonthCells("2026-10", [], "2026-10-04");
    expect(cells.length).toBe(35); // 4 leading (Kamis 1 Oct is a Thursday) + 31 days, no trailing needed
    expect(cells[0]!.date).toBe("2026-09-27");
    expect(cells[0]!.inMonth).toBe(false);
    expect(cells[4]!.date).toBe("2026-10-01");
    expect(cells[4]!.inMonth).toBe(true);
    expect(cells.at(-1)!.date).toBe("2026-10-31");
  });

  it("pads to 6 rows when the month needs it (February 2026 starts on Minggu, 28 days -> no trailing; but e.g. May 2026 needs 6 rows)", () => {
    const cells = buildMonthCells("2026-05", [], "2026-05-01");
    // May 2026 starts on a Friday (5 leading) with 31 days: 5 + 31 = 36 -> 6 rows (42 cells).
    expect(cells.length).toBe(42);
  });

  it("marks exactly one cell as today, only when today falls in the shown month", () => {
    const inMonth = buildMonthCells("2026-10", [], "2026-10-04");
    expect(inMonth.filter((cell) => cell.isToday)).toHaveLength(1);
    expect(inMonth.find((cell) => cell.isToday)!.date).toBe("2026-10-04");

    const outsideMonth = buildMonthCells("2026-11", [], "2026-10-04");
    expect(outsideMonth.filter((cell) => cell.isToday)).toHaveLength(0);
  });

  it("places a single-day event on exactly one cell, with dayIndex/totalDays = 1/1", () => {
    const cells = buildMonthCells("2026-10", [event({ tanggalMulai: "2026-10-10", tanggalSelesai: "2026-10-10" })], "2026-10-04");
    const matches = cells.filter((cell) => cell.occurrences.length > 0);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.date).toBe("2026-10-10");
    expect(matches[0]!.occurrences[0]).toMatchObject({ dayIndex: 1, totalDays: 1 });
  });

  it("places a multi-day event on every day it covers, with the brief's (n/total) numbering", () => {
    const cells = buildMonthCells("2026-10", [event({ id: "retret", tanggalMulai: "2026-10-16", tanggalSelesai: "2026-10-18" })], "2026-10-04");
    const days = cells.filter((cell) => cell.occurrences.some((o) => o.id === "retret"));
    expect(days.map((cell) => cell.date)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(days.map((cell) => cell.occurrences[0]!.dayIndex)).toEqual([1, 2, 3]);
    expect(days.every((cell) => cell.occurrences[0]!.totalDays === 3)).toBe(true);
  });

  it("an event crossing the grid's leading/trailing edge still marks the filler cell (even though it has no button)", () => {
    const cells = buildMonthCells("2026-10", [event({ id: "lintas", tanggalMulai: "2026-09-30", tanggalSelesai: "2026-10-02" })], "2026-10-04");
    const sept30 = cells.find((cell) => cell.date === "2026-09-30")!;
    expect(sept30.inMonth).toBe(false);
    expect(sept30.occurrences).toHaveLength(1);
  });
});

describe("agendaFromCells", () => {
  it("keeps only in-month dates that have at least one event, in date order", () => {
    const cells = buildMonthCells(
      "2026-10",
      [
        event({ id: "a", tanggalMulai: "2026-10-20", tanggalSelesai: "2026-10-20" }),
        event({ id: "b", tanggalMulai: "2026-09-30", tanggalSelesai: "2026-09-30" }), // leading filler date, excluded
        event({ id: "c", tanggalMulai: "2026-10-05", tanggalSelesai: "2026-10-05" }),
      ],
      "2026-10-04",
    );
    const agenda = agendaFromCells(cells);
    expect(agenda.map((cell) => cell.date)).toEqual(["2026-10-05", "2026-10-20"]);
  });

  it("is empty when the month has no events", () => {
    expect(agendaFromCells(buildMonthCells("2026-10", [], "2026-10-04"))).toEqual([]);
  });
});

describe("cellAriaLabel (brief §14.4's exact shape)", () => {
  it("includes the event count only when there is at least one", () => {
    const withEvents = buildMonthCells("2026-10", [event({ tanggalMulai: "2026-10-01", tanggalSelesai: "2026-10-01" })], "2026-10-04");
    expect(cellAriaLabel(withEvents.find((cell) => cell.date === "2026-10-01")!)).toBe("Kamis, 1 Oktober 2026, 1 kegiatan");

    const empty = buildMonthCells("2026-10", [], "2026-10-04");
    expect(cellAriaLabel(empty.find((cell) => cell.date === "2026-10-02")!)).toBe("Jumat, 2 Oktober 2026");
  });
});
