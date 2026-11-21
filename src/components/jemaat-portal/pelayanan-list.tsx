import { Badge } from "@/components/ui/badge";
import { formatDateLong, formatDayDateShort, type IsoDate } from "@/lib/dates";
import { formatJam } from "@/lib/peribadahan";
import type { PelayananSaya } from "@/lib/portal/types";

/** `pelayanan_saya()` rows, one date group per entry, in the rows' own order. */
export function groupPelayananByTanggal(rows: PelayananSaya[]): { tanggal: IsoDate; rows: PelayananSaya[] }[] {
  const groups: { tanggal: IsoDate; rows: PelayananSaya[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.tanggal === row.tanggal) last.rows.push(row);
    else groups.push({ tanggal: row.tanggal, rows: [row] });
  }
  return groups;
}

/**
 * `pelayanan_saya()` rows grouped by date, each role as a badge (brief
 * §17.3). `dateFormat="short"` fits a narrow card (Beranda); "long" is the
 * dedicated Pelayanan page. Rows are already ordered by the function
 * (tanggal, jam, sort_order).
 */
export function PelayananList({
  rows,
  emptyText,
  dateFormat = "long",
  order = "asc",
}: {
  rows: PelayananSaya[];
  emptyText: string;
  dateFormat?: "long" | "short";
  /** "desc" reverses the date groups (Riwayat, newest first); each day's own rows keep their order. */
  order?: "asc" | "desc";
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  const groups = groupPelayananByTanggal(rows);
  if (order === "desc") groups.reverse();

  return (
    <ul className="flex flex-col gap-4">
      {groups.map((group) => (
        <li key={group.tanggal} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            {dateFormat === "long" ? formatDateLong(group.tanggal) : formatDayDateShort(group.tanggal)}
          </p>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-3.5 py-3 text-sm"
              >
                <Badge variant="accent">{row.peranLabel}</Badge>
                <span className="font-medium">{row.kategoriNama}</span>
                {row.jam && <span className="text-muted-foreground">· {formatJam(row.jam)} WIB</span>}
                {row.tempatNama && <span className="text-muted-foreground">· {row.tempatNama}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
