import { z } from "zod";

/**
 * Calendar-date helpers (brief §11).
 *
 * Dates are `YYYY-MM-DD` strings. Day arithmetic treats them as UTC calendar
 * dates, never local time, so the result is the same on the server and in
 * any browser. "Today" is always the current date in Asia/Jakarta: a plain
 * UTC date is still yesterday until 07:00 WIB.
 *
 * Day and month names come from fixed tables instead of ICU so server and
 * browser render identical strings (no hydration mismatches).
 */

export type IsoDate = string;

export type DateRange = { start: IsoDate; end: IsoDate };

const TIME_ZONE = "Asia/Jakarta";
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

const jakartaParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function jakartaComponents(instant: Date) {
  const parts: Record<string, string> = {};
  for (const part of jakartaParts.formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function parse(date: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date);
  if (!match || !isValidIsoDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toUtcMs(date: IsoDate): number {
  const { year, month, day } = parse(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const isoDateSchema = z.string().refine(isValidIsoDate, { message: "Tanggal tidak valid." });

/** The current calendar date in Asia/Jakarta. */
export function today(now: Date = new Date()): IsoDate {
  const { year, month, day } = jakartaComponents(now);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** 0 = Minggu (Sunday) … 6 = Sabtu (Saturday). */
export function weekday(date: IsoDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** `from` itself when it is a Sunday, otherwise the coming Sunday. */
export function nextSunday(from: IsoDate = today()): IsoDate {
  const dow = weekday(from);
  return dow === 0 ? from : addDays(from, 7 - dow);
}

/** Service week of a warta: tanggal kebaktian through + 6 days (Minggu–Sabtu). */
export function serviceWeek(tanggalKebaktian: IsoDate): DateRange {
  return { start: tanggalKebaktian, end: addDays(tanggalKebaktian, 6) };
}

/** Finance week of a warta: − 7 through − 1 days (the previous Minggu–Sabtu). */
export function financeWeek(tanggalKebaktian: IsoDate): DateRange {
  return { start: addDays(tanggalKebaktian, -7), end: addDays(tanggalKebaktian, -1) };
}

/** The Minggu–Sabtu week that contains `date` (the dashboard's "jadwal minggu ini", like `public_jadwal_pekan_ini`). */
export function weekContaining(date: IsoDate = today()): DateRange {
  const start = addDays(date, -weekday(date));
  return { start, end: addDays(start, 6) };
}

/** "Minggu, 14 September 2025" */
export function formatDateLong(date: IsoDate): string {
  const { year, month, day } = parse(date);
  return `${DAY_NAMES[weekday(date)]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Min", "Sen", … "Sab" — short day name for tight spaces such as day tabs. */
export function formatDayShort(date: IsoDate): string {
  return DAY_NAMES[weekday(date)]!.slice(0, 3);
}

/** "14 September 2025" */
export function formatDateShort(date: IsoDate): string {
  const { year, month, day } = parse(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** A timestamp shown in WIB: "14 Sep 2025, 09.30 WIB". */
export function formatTimestamp(value: string | Date): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) throw new RangeError(`Invalid timestamp: ${String(value)}`);
  const { year, month, day, hour, minute } = jakartaComponents(instant);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}, ${pad(hour)}.${pad(minute)} WIB`;
}

/** The instant 00:00 WIB starts `date`, as an ISO timestamp: "2025-09-14T00:00:00+07:00". */
export function jakartaDayStart(date: IsoDate): string {
  parse(date);
  return `${date}T00:00:00+07:00`;
}

/**
 * Timestamp bounds for an inclusive date range in WIB: `gte` is 00:00 on
 * `start`, and `lt` is 00:00 the day after `end`, so the whole end day
 * (through 23:59:59) counts. Either side may be open.
 */
export function jakartaTimestampBounds(range: Partial<DateRange>): { gte?: string; lt?: string } {
  return {
    ...(range.start ? { gte: jakartaDayStart(range.start) } : {}),
    ...(range.end ? { lt: jakartaDayStart(addDays(range.end, 1)) } : {}),
  };
}

/**
 * Date-picker glue: calendar widgets work with `Date` objects at local
 * midnight. These convert without touching UTC, so the picked calendar day
 * is the stored one in any browser time zone.
 */
export function isoDateToLocalDate(date: IsoDate): Date {
  const { year, month, day } = parse(date);
  return new Date(year, month - 1, day);
}

export function localDateToIsoDate(value: Date): IsoDate {
  return `${String(value.getFullYear()).padStart(4, "0")}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Compact date for tight spaces such as filter buttons: "14 Sep 2025". */
export function formatDateCompact(date: IsoDate): string {
  const { year, month, day } = parse(date);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}
