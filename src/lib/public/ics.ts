/**
 * A single-event .ics file per RFC 5545 (brief §14.4, D), built from
 * `KegiatanDetailContent`-shaped data. Pure and testable: no Supabase, no
 * "server-only" (the route handler supplies the origin, never the request's
 * Host header).
 */

const CRLF = "\r\n";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Backslash, then comma/semicolon, then newlines — order matters so `\n` isn't re-escaped. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line at 75 octets (RFC 5545 §3.1): the first physical line
 * holds up to 75 octets, every continuation line adds a leading space and up
 * to 74 more octets, and a split never falls inside a multi-byte UTF-8
 * character.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let rest = line;
  let limit = 75;
  while (encoder.encode(rest).length > limit) {
    let end = rest.length;
    while (encoder.encode(rest.slice(0, end)).length > limit) end--;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
    limit = 74;
  }
  parts.push(rest);
  return parts.join(CRLF + " ");
}

function parseDateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
}

function parseTimeParts(time: string): [number, number, number] {
  const [hour, minute, second] = time.split(":").map(Number);
  return [hour ?? 0, minute ?? 0, second ?? 0];
}

function wibDateTimeToUtcStamp(date: string, time: string): string {
  const [year, month, day] = parseDateParts(date);
  const [hour, minute, second] = parseTimeParts(time);
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - 7 * 3_600_000);
  return `${instant.getUTCFullYear()}${pad(instant.getUTCMonth() + 1)}${pad(instant.getUTCDate())}T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}${pad(instant.getUTCSeconds())}Z`;
}

function utcStampNow(now: Date): string {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function toBasicDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function dayAfter(isoDate: string): string {
  const [year, month, day] = parseDateParts(isoDate);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

export type IcsEvent = {
  id: string;
  judul: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  deskripsi: string | null;
  /** The configured public origin (`SITE_URL`), e.g. "https://gkprangkasbitung.org". */
  origin: string;
  slug: string;
};

/** Builds the full .ics file text (CRLF line endings, folded, escaped). */
export function buildKegiatanIcs(event: IcsEvent, now: Date = new Date()): string {
  const hostname = new URL(event.origin).hostname;
  const allDay = !event.waktuMulai && !event.waktuSelesai;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GKP Rangkasbitung//Kalender Kegiatan//ID",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@${hostname}`,
    `DTSTAMP:${utcStampNow(now)}`,
  ];

  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toBasicDate(event.tanggalMulai)}`);
    lines.push(`DTEND;VALUE=DATE:${dayAfter(event.tanggalSelesai)}`);
  } else {
    const startTime = event.waktuMulai ?? event.waktuSelesai!;
    const endTime = event.waktuSelesai ?? event.waktuMulai!;
    lines.push(`DTSTART:${wibDateTimeToUtcStamp(event.tanggalMulai, startTime)}`);
    lines.push(`DTEND:${wibDateTimeToUtcStamp(event.tanggalSelesai, endTime)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.judul)}`);
  if (event.deskripsi) lines.push(`DESCRIPTION:${escapeIcsText(event.deskripsi)}`);
  if (event.tempat) lines.push(`LOCATION:${escapeIcsText(event.tempat)}`);
  lines.push(`URL:${event.origin}/kegiatan/${event.slug}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
