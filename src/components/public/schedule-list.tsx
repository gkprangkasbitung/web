import { cn } from "cn";

import { formatDateLong } from "@/lib/dates";
import { formatJam } from "@/lib/peribadahan";
import { groupByDate, scheduleFields, type PublicScheduleRow } from "@/lib/public-schedule";

function SmkaGroupTable({ row }: { row: PublicScheduleRow }) {
  if (row.smkaKelompok.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-70 text-sm">
        <caption className="sr-only">Kelompok {row.categoryName}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Kelompok
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              PF
            </th>
            <th scope="col" className="w-12 py-2 pr-3 text-right font-medium">
              <abbr title="Laki-laki" className="no-underline">
                L
              </abbr>
            </th>
            <th scope="col" className="w-12 py-2 text-right font-medium">
              <abbr title="Perempuan" className="no-underline">
                P
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {row.smkaKelompok.map((group) => (
            <tr key={group.kelompok} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {group.label}
              </th>
              <td className="py-2 pr-3">{group.pfNama ?? "–"}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{group.lakiLaki ?? "–"}</td>
              <td className="py-2 text-right font-mono tabular-nums">{group.perempuan ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Jadwal Ibadah's card (docs/design/jadwal-ibadah.html): a time column (Jam,
 * WIB) beside the service type (`categoryName`) with its filled fields —
 * Tempat, Pelayan Firman, Liturgos, DPA, etc. inline, and the longer Tema /
 * Keterangan-Catatan as their own lines. Attendance counts are omitted here
 * on request — Jadwal Ibadah is a schedule, not a report of past attendance.
 */
export function JadwalEntry({ row }: { row: PublicScheduleRow }) {
  const fields = scheduleFields(row).filter((field) => !field.label.startsWith("Kehadiran "));
  const inline = fields.filter((field) => field.label !== "Waktu" && field.label !== "Tema" && !field.multiline);
  const blocks = fields.filter((field) => field.label === "Tema" || field.multiline);

  return (
    <article className="grid grid-cols-[5rem_minmax(0,1fr)] gap-5 rounded-2xl border border-border bg-card p-6 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-7 sm:p-7">
      <div className="flex flex-col gap-1">
        {row.jam && (
          <>
            <span className="font-serif text-2xl text-brand sm:text-[1.75rem]">{formatJam(row.jam)}</span>
            <span className="text-xs text-muted-foreground">WIB</span>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="font-serif text-xl sm:text-2xl">{row.categoryName}</span>
        {inline.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {inline.map((field) => (
              <div key={field.label} className="flex gap-1.5">
                <dt className="text-muted-foreground">{field.label}:</dt>
                <dd className={cn("wrap-break-word", field.numeric && "font-mono tabular-nums")}>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {blocks.map((field) => (
          <p
            key={field.label}
            className={cn("wrap-break-word text-sm text-muted-foreground", field.multiline && "whitespace-pre-line")}
          >
            {field.label}: {field.value}
          </p>
        ))}
        <SmkaGroupTable row={row} />
      </div>
    </article>
  );
}

/** One service with every filled field of its category (brief §8). Reused by `ScheduleList` (Warta). */
export function ScheduleEntry({ row }: { row: PublicScheduleRow }) {
  const fields = scheduleFields(row);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h4 className="font-semibold">{row.categoryName}</h4>
      {fields.length > 0 && (
        <dl className="flex flex-col gap-2 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd
                className={cn(
                  "wrap-break-word",
                  field.multiline && "whitespace-pre-line",
                  field.numeric && "font-mono tabular-nums",
                )}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <SmkaGroupTable row={row} />
    </article>
  );
}

/** A warta's service week or the Jadwal Ibadah week: grouped by day, every filled field. */
export function ScheduleList({ rows, emptyText }: { rows: PublicScheduleRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-6">
      {groupByDate(rows).map((day) => (
        <div key={day.tanggal} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{formatDateLong(day.tanggal)}</h3>
          {day.rows.map((row) => (
            <ScheduleEntry key={row.id} row={row} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Beranda's hero: one line per service (category, time, place). */
export function CompactScheduleList({ rows, emptyText }: { rows: PublicScheduleRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const place = [row.tempatNama, row.wilayahNama].filter(Boolean).join(" · ");
        return (
          <li key={row.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
            <span className="font-medium">{row.categoryName}</span>
            <span className="text-sm text-muted-foreground">
              {formatDateLong(row.tanggal)}
              {row.jam && <span className="font-mono tabular-nums">, {formatJam(row.jam)}</span>}
              {place && ` · ${place}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
