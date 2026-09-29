/**
 * Peribadahan category config (brief §9.5): one source of truth for the
 * per-category field layout, reused by the add/edit forms, the table
 * columns, server-side validation, and (stage 9) the Warta editor and the
 * public site.
 */

export const PERIBADAHAN_FIELDS = [
  "waktu",
  "tempat",
  "wilayah",
  "dpa",
  "tema",
  "pelayanFirman",
  "liturgos",
  "pemusik",
  "bahanAlkitab",
  "smkaGrid",
] as const;
export type PeribadahanField = (typeof PERIBADAHAN_FIELDS)[number];

export const ATTENDANCE_FIELDS = ["lakiLaki", "perempuan", "anak"] as const;
export type AttendanceField = (typeof ATTENDANCE_FIELDS)[number];

export const ATTENDANCE_LABELS: Record<AttendanceField, string> = {
  lakiLaki: "Laki-laki",
  perempuan: "Perempuan",
  anak: "Anak-anak",
};

export type PeribadahanLayout = {
  /** Fields shown besides Tanggal, in display order (brief §9.5's table). */
  fields: readonly PeribadahanField[];
  /** Which attendance counts apply. */
  attendance: readonly AttendanceField[];
  /** Label of the free-text `catatan` field; null when the category has none (SMKA). */
  notesLabel: "Keterangan" | "Catatan" | null;
  /** "Liturgos", or "Pelayan Liturgi" for SMKA (still stored in `liturgos_id`). */
  liturgosLabel: string;
};

const ALL_ATTENDANCE: readonly AttendanceField[] = ["lakiLaki", "perempuan", "anak"];

/** Unknown category keys use this layout (brief §9.5). */
export const UMUM_LAYOUT: PeribadahanLayout = {
  fields: ["waktu", "tempat", "pelayanFirman", "liturgos"],
  attendance: ALL_ATTENDANCE,
  notesLabel: "Keterangan",
  liturgosLabel: "Liturgos",
};

const KEBAKTIAN_RUMAH_TANGGA_STYLE = (attendance: readonly AttendanceField[]): PeribadahanLayout => ({
  fields: ["waktu", "tempat", "dpa", "tema", "pelayanFirman", "liturgos"],
  attendance,
  notesLabel: "Catatan",
  liturgosLabel: "Liturgos",
});

export const PERIBADAHAN_LAYOUTS: Record<string, PeribadahanLayout> = {
  umum: UMUM_LAYOUT,
  smka: {
    fields: ["waktu", "tema", "liturgos", "pemusik", "bahanAlkitab", "smkaGrid"],
    attendance: [],
    notesLabel: null,
    liturgosLabel: "Pelayan Liturgi",
  },
  krt: {
    fields: ["waktu", "tempat", "wilayah", "dpa", "tema", "pelayanFirman", "liturgos"],
    attendance: ALL_ATTENDANCE,
    notesLabel: "Catatan",
    liturgosLabel: "Liturgos",
  },
  pa: KEBAKTIAN_RUMAH_TANGGA_STYLE(ALL_ATTENDANCE),
  lansia: KEBAKTIAN_RUMAH_TANGGA_STYLE(["lakiLaki", "perempuan"]),
  perempuan: KEBAKTIAN_RUMAH_TANGGA_STYLE(["perempuan"]),
  pria: KEBAKTIAN_RUMAH_TANGGA_STYLE(["lakiLaki"]),
  doa_pagi: {
    fields: ["waktu", "tempat"],
    attendance: ALL_ATTENDANCE,
    notesLabel: "Catatan",
    liturgosLabel: "Liturgos",
  },
  pemuda_remaja: KEBAKTIAN_RUMAH_TANGGA_STYLE(["lakiLaki", "perempuan"]),
};

/** An unknown key (brief §9.5's own wording) falls back to `umum`. */
export function layoutFor(key: string): PeribadahanLayout {
  return PERIBADAHAN_LAYOUTS[key] ?? UMUM_LAYOUT;
}

export function hasField(key: string, field: PeribadahanField): boolean {
  return layoutFor(key).fields.includes(field);
}

export function hasAttendance(key: string, field: AttendanceField): boolean {
  return layoutFor(key).attendance.includes(field);
}

export const SMKA_KEY = "smka";

export const SMKA_GROUP_KEYS = [
  "batita",
  "balita",
  "kecil",
  "tanggung",
  "besar",
  "tunas_remaja",
  "guru_sekolah_minggu",
  "orang_tua",
] as const;
export type SmkaGroupKey = (typeof SMKA_GROUP_KEYS)[number];

export type SmkaGroupConfig = { key: SmkaGroupKey; label: string; hasPf: boolean };

/** The 8 fixed rows of the SMKA grid, in display order (brief §9.5). */
export const SMKA_GROUPS: readonly SmkaGroupConfig[] = [
  { key: "batita", label: "Kelas Batita", hasPf: true },
  { key: "balita", label: "Kelas Balita", hasPf: true },
  { key: "kecil", label: "Kelas Kecil", hasPf: true },
  { key: "tanggung", label: "Kelas Tanggung", hasPf: true },
  { key: "besar", label: "Kelas Besar", hasPf: true },
  { key: "tunas_remaja", label: "Kelas Tunas Remaja", hasPf: true },
  { key: "guru_sekolah_minggu", label: "Guru Sekolah Minggu", hasPf: false },
  { key: "orang_tua", label: "Orang Tua", hasPf: false },
];

/** `HH:MM:SS` (or `HH:MM`) from the database to "09.00" for display. */
export function formatJam(jam: string | null): string {
  if (!jam) return "";
  const [hour = "00", minute = "00"] = jam.split(":");
  return `${hour}.${minute}`;
}
