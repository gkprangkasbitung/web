import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  financeWeek,
  formatDateCompact,
  formatDayDateShort,
  formatDateLong,
  formatDateRangeLong,
  formatDateRangeShort,
  formatDateShort,
  formatMonthLong,
  formatTimestamp,
  isoDateSchema,
  isoDateToLocalDate,
  isValidIsoDate,
  isValidIsoMonth,
  jakartaDayStart,
  jakartaTimestampBounds,
  localDateToIsoDate,
  monthOf,
  monthRange,
  nextSunday,
  serviceWeek,
  today,
  weekContaining,
  weekday,
} from "./dates";

// 2025-11-30 is a Sunday (Minggu Adven I, the example in brief §7).
const SUNDAY_05_00_WIB = new Date("2025-11-29T22:00:00Z");

describe("today()", () => {
  it("is the Asia/Jakarta date, not the UTC date", () => {
    // 05:00 WIB Sunday is still 22:00 Saturday in UTC.
    expect(SUNDAY_05_00_WIB.toISOString().startsWith("2025-11-29")).toBe(true);
    expect(today(SUNDAY_05_00_WIB)).toBe("2025-11-30");
  });

  it("rolls over exactly at 00:00 WIB (17:00 UTC)", () => {
    expect(today(new Date("2025-11-29T16:59:59Z"))).toBe("2025-11-29");
    expect(today(new Date("2025-11-29T17:00:00Z"))).toBe("2025-11-30");
  });

  it("handles the year boundary", () => {
    expect(today(new Date("2025-12-31T17:30:00Z"))).toBe("2026-01-01");
  });
});

describe("acceptance check 18: 05:00 WIB on a Sunday", () => {
  const now = SUNDAY_05_00_WIB;

  it('"Tambah Jadwal" defaults to that same Sunday', () => {
    expect(nextSunday(today(now))).toBe("2025-11-30");
  });

  it('"Tambah Transaksi" and a new pastoral note default to that same day', () => {
    expect(today(now)).toBe("2025-11-30");
  });
});

describe("addDays()", () => {
  it("adds and subtracts calendar days across month and year boundaries", () => {
    expect(addDays("2025-11-30", 6)).toBe("2025-12-06");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2025-03-10", 0)).toBe("2025-03-10");
  });

  it("rejects invalid dates", () => {
    expect(() => addDays("2025-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("30-11-2025", 1)).toThrow(RangeError);
  });
});

describe("weekday() and nextSunday()", () => {
  it("numbers days from Sunday = 0", () => {
    expect(weekday("2025-11-30")).toBe(0);
    expect(weekday("2025-11-29")).toBe(6);
    expect(weekday("2025-12-01")).toBe(1);
  });

  it("returns today on a Sunday, otherwise the coming Sunday", () => {
    expect(nextSunday("2025-11-30")).toBe("2025-11-30");
    expect(nextSunday("2025-11-29")).toBe("2025-11-30");
    expect(nextSunday("2025-12-01")).toBe("2025-12-07");
    expect(nextSunday("2025-12-27")).toBe("2025-12-28");
    expect(nextSunday("2025-12-29")).toBe("2026-01-04");
  });
});

describe("serviceWeek() and financeWeek()", () => {
  it("service week is tanggal kebaktian through + 6 days", () => {
    expect(serviceWeek("2025-11-30")).toEqual({ start: "2025-11-30", end: "2025-12-06" });
  });

  it("finance week is − 7 through − 1 days", () => {
    expect(financeWeek("2025-11-30")).toEqual({ start: "2025-11-23", end: "2025-11-29" });
    expect(financeWeek("2026-01-04")).toEqual({ start: "2025-12-28", end: "2026-01-03" });
  });

  it("weekContaining() is the Minggu–Sabtu week around a date", () => {
    expect(weekContaining("2025-11-30")).toEqual({ start: "2025-11-30", end: "2025-12-06" });
    expect(weekContaining("2025-12-03")).toEqual({ start: "2025-11-30", end: "2025-12-06" });
    expect(weekContaining("2025-12-06")).toEqual({ start: "2025-11-30", end: "2025-12-06" });
    expect(weekContaining("2026-01-01")).toEqual({ start: "2025-12-28", end: "2026-01-03" });
  });

  it("weekContaining() at 05:00 WIB on a Sunday starts that Sunday, not the UTC Saturday", () => {
    expect(weekContaining(today(SUNDAY_05_00_WIB))).toEqual({ start: "2025-11-30", end: "2025-12-06" });
  });
});

describe("validation", () => {
  it("accepts only real YYYY-MM-DD calendar dates", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("2025-13-01")).toBe(false);
    expect(isValidIsoDate("2025-1-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isoDateSchema.safeParse("2025-11-30").success).toBe(true);
    expect(isoDateSchema.safeParse("2025-11-31").success).toBe(false);
  });
});

describe("formatting", () => {
  it("formats long and short dates in Indonesian", () => {
    expect(formatDateLong("2025-09-14")).toBe("Minggu, 14 September 2025");
    expect(formatDateLong("2025-12-01")).toBe("Senin, 1 Desember 2025");
    expect(formatDateShort("2025-09-14")).toBe("14 September 2025");
    expect(formatDateCompact("2025-08-03")).toBe("3 Agu 2025");
    expect(formatDayDateShort("2026-10-04")).toBe("Min, 4 Okt");
  });

  it("formats timestamps in WIB", () => {
    expect(formatTimestamp("2025-09-14T02:30:00Z")).toBe("14 Sep 2025, 09.30 WIB");
    expect(formatTimestamp("2025-08-16T18:05:00+00:00")).toBe("17 Agu 2025, 01.05 WIB");
    expect(formatTimestamp(new Date("2025-12-31T17:00:00Z"))).toBe("1 Jan 2026, 00.00 WIB");
  });
});

describe("date range bounds", () => {
  it("starts a day at 00:00 WIB", () => {
    expect(jakartaDayStart("2025-09-14")).toBe("2025-09-14T00:00:00+07:00");
    expect(new Date(jakartaDayStart("2025-09-14")).toISOString()).toBe("2025-09-13T17:00:00.000Z");
  });

  it("includes the whole end day, across month ends", () => {
    expect(jakartaTimestampBounds({ start: "2025-09-01", end: "2025-09-30" })).toEqual({
      gte: "2025-09-01T00:00:00+07:00",
      lt: "2025-10-01T00:00:00+07:00",
    });
    expect(jakartaTimestampBounds({ end: "2025-12-31" })).toEqual({ lt: "2026-01-01T00:00:00+07:00" });
    expect(jakartaTimestampBounds({})).toEqual({});
  });

  it("converts picker dates without shifting the calendar day", () => {
    const local = isoDateToLocalDate("2025-11-30");
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2025, 10, 30]);
    expect(localDateToIsoDate(local)).toBe("2025-11-30");
    expect(localDateToIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("month helpers (brief §14.4, the kalender kegiatan)", () => {
  it("validates the YYYY-MM format", () => {
    expect(isValidIsoMonth("2026-10")).toBe(true);
    expect(isValidIsoMonth("2026-13")).toBe(false);
    expect(isValidIsoMonth("2026-00")).toBe(false);
    expect(isValidIsoMonth("2026-1")).toBe(false);
    expect(isValidIsoMonth("not-a-month")).toBe(false);
  });

  it("monthOf: the YYYY-MM containing a date", () => {
    expect(monthOf("2026-10-15")).toBe("2026-10");
  });

  it("addMonths: forward, backward, and across a year boundary", () => {
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-10", -1)).toBe("2026-09");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -24)).toBe("2024-10");
  });

  it("monthRange: first and last calendar date, including a 31/30/28-day month", () => {
    expect(monthRange("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRange("2026-04")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" }); // leap year
  });

  it("formatMonthLong", () => {
    expect(formatMonthLong("2026-10")).toBe("Oktober 2026");
  });

  it("formatDateRangeShort: same day, same month, cross-month, cross-year", () => {
    expect(formatDateRangeShort("2026-10-16", "2026-10-16")).toBe("16 Oktober 2026");
    expect(formatDateRangeShort("2026-10-16", "2026-10-18")).toBe("16 – 18 Oktober 2026");
    expect(formatDateRangeShort("2026-10-30", "2026-11-02")).toBe("30 Oktober – 2 November 2026");
    expect(formatDateRangeShort("2026-12-30", "2027-01-02")).toBe("30 Desember 2026 – 2 Januari 2027");
  });

  it("formatDateRangeLong: adds weekday names, same-month only", () => {
    expect(formatDateRangeLong("2026-10-16", "2026-10-16")).toBe("Jumat, 16 Oktober 2026");
    expect(formatDateRangeLong("2026-10-16", "2026-10-18")).toBe("Jumat, 16 – Minggu, 18 Oktober 2026");
    expect(formatDateRangeLong("2026-10-30", "2026-11-02")).toBe("Jumat, 30 Oktober 2026 – Senin, 2 November 2026");
  });
});
