import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { ATTENDANCE_LABELS, formatJam, layoutFor, SMKA_GROUPS, type AttendanceField } from "@/lib/peribadahan";

/**
 * Rows from the public schedule functions (0020 `public_warta_schedule` /
 * `public_jadwal_pekan_ini`, 0027 `public_jadwal_mendatang`), parsed with Zod:
 * the generated types mark every returned column non-null, but most are
 * nullable (stage 2 note). Client-safe; the loaders live in `public-site.ts`.
 */

const isoDate = z.string().refine(isValidIsoDate);
const text = z.string().nullable();
const count = z.number().int().nullable();

const baseRowSchema = z.object({
  id: z.string(),
  tanggal: isoDate,
  jam: text,
  category_key: z.string(),
  category_name: z.string(),
  tempat_nama: text,
  wilayah_nama: text,
  dpa: text,
  tema: text,
  pelayan_firman_nama: text,
  liturgos_nama: text,
  pemusik_nama: text,
  bahan_alkitab: text,
});

const smkaGroupSchema = z.object({
  kelompok: z.string(),
  pf_nama: text,
  laki_laki: count,
  perempuan: count,
});

const fullRowSchema = baseRowSchema.extend({
  kehadiran_laki_laki: count,
  kehadiran_perempuan: count,
  kehadiran_anak: count,
  catatan: text,
  smka_kelompok: z.array(smkaGroupSchema),
});

export type PublicSmkaGroup = { kelompok: string; label: string; pfNama: string | null; lakiLaki: number | null; perempuan: number | null };

export type PublicScheduleRow = {
  id: string;
  tanggal: string;
  jam: string | null;
  categoryKey: string;
  categoryName: string;
  tempatNama: string | null;
  wilayahNama: string | null;
  dpa: string | null;
  tema: string | null;
  pelayanFirmanNama: string | null;
  liturgosNama: string | null;
  pemusikNama: string | null;
  bahanAlkitab: string | null;
  /** Absent from `public_jadwal_mendatang`, which returns no attendance or catatan. */
  kehadiranLakiLaki: number | null;
  kehadiranPerempuan: number | null;
  kehadiranAnak: number | null;
  catatan: string | null;
  smkaKelompok: PublicSmkaGroup[];
};

function toBaseRow(row: z.infer<typeof baseRowSchema>) {
  return {
    id: row.id,
    tanggal: row.tanggal,
    jam: row.jam,
    categoryKey: row.category_key,
    categoryName: row.category_name,
    tempatNama: row.tempat_nama,
    wilayahNama: row.wilayah_nama,
    dpa: row.dpa,
    tema: row.tema,
    pelayanFirmanNama: row.pelayan_firman_nama,
    liturgosNama: row.liturgos_nama,
    pemusikNama: row.pemusik_nama,
    bahanAlkitab: row.bahan_alkitab,
  };
}

const groupLabel = new Map(SMKA_GROUPS.map((group) => [group.key as string, group.label]));

/** `public_warta_schedule` / `public_jadwal_pekan_ini`. Throws on an unexpected shape. */
export function parseFullScheduleRows(rows: unknown): PublicScheduleRow[] {
  return z
    .array(fullRowSchema)
    .parse(rows)
    .map((row) => ({
      ...toBaseRow(row),
      kehadiranLakiLaki: row.kehadiran_laki_laki,
      kehadiranPerempuan: row.kehadiran_perempuan,
      kehadiranAnak: row.kehadiran_anak,
      catatan: row.catatan,
      // The function already lists only groups with data, in the fixed order.
      smkaKelompok: row.smka_kelompok.map((group) => ({
        kelompok: group.kelompok,
        label: groupLabel.get(group.kelompok) ?? group.kelompok,
        pfNama: group.pf_nama,
        lakiLaki: group.laki_laki,
        perempuan: group.perempuan,
      })),
    }));
}

/** `public_jadwal_mendatang`: schedule columns only. Throws on an unexpected shape. */
export function parseUpcomingScheduleRows(rows: unknown): PublicScheduleRow[] {
  return z
    .array(baseRowSchema)
    .parse(rows)
    .map((row) => ({
      ...toBaseRow(row),
      kehadiranLakiLaki: null,
      kehadiranPerempuan: null,
      kehadiranAnak: null,
      catatan: null,
      smkaKelompok: [],
    }));
}

export type ScheduleField = {
  label: string;
  value: string;
  /** Free text that may hold line breaks (catatan), shown with `white-space: pre-line`. */
  multiline?: boolean;
  numeric?: boolean;
};

function filled(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

const ATTENDANCE_VALUE: Record<AttendanceField, (row: PublicScheduleRow) => number | null> = {
  lakiLaki: (row) => row.kehadiranLakiLaki,
  perempuan: (row) => row.kehadiranPerempuan,
  anak: (row) => row.kehadiranAnak,
};

/**
 * The fields one schedule row shows on the public site (brief §8), in §8's
 * order: Waktu, Tempat, Wilayah, DPA, Tema, Pelayan Firman, Liturgos
 * ("Pelayan Liturgi" for SMKA), Pemusik and Bahan Alkitab, the attendance
 * counts, then catatan. Only fields that the row's category has (the stage-6
 * layout, `layoutFor`) **and** that are filled; an attendance of 0 counts as
 * filled. The SMKA group table is separate (`row.smkaKelompok`).
 */
export function scheduleFields(row: PublicScheduleRow): ScheduleField[] {
  const layout = layoutFor(row.categoryKey);
  const has = (field: (typeof layout.fields)[number]) => layout.fields.includes(field);
  const fields: ScheduleField[] = [];
  const add = (show: boolean, label: string, value: string | null, extra?: Partial<ScheduleField>) => {
    if (show && filled(value)) fields.push({ label, value, ...extra });
  };

  add(has("waktu"), "Waktu", row.jam ? formatJam(row.jam) : null, { numeric: true });
  add(has("tempat"), "Tempat", row.tempatNama);
  add(has("wilayah"), "Wilayah", row.wilayahNama);
  add(has("dpa"), "DPA", row.dpa);
  add(has("tema"), "Tema", row.tema);
  add(has("pelayanFirman"), "Pelayan Firman", row.pelayanFirmanNama);
  add(has("liturgos"), layout.liturgosLabel, row.liturgosNama);
  add(has("pemusik"), "Pemusik", row.pemusikNama);
  add(has("bahanAlkitab"), "Bahan Alkitab", row.bahanAlkitab);
  for (const field of layout.attendance) {
    const value = ATTENDANCE_VALUE[field](row);
    add(true, `Kehadiran ${ATTENDANCE_LABELS[field]}`, value === null ? null : String(value), { numeric: true });
  }
  if (layout.notesLabel) add(true, layout.notesLabel, row.catatan, { multiline: true });

  return fields;
}

/** Rows grouped by date, keeping the functions' order (date, then sort_order). */
export function groupByDate(rows: PublicScheduleRow[]): { tanggal: string; rows: PublicScheduleRow[] }[] {
  const groups: { tanggal: string; rows: PublicScheduleRow[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.tanggal === row.tanggal) last.rows.push(row);
    else groups.push({ tanggal: row.tanggal, rows: [row] });
  }
  return groups;
}
