import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Pemilihan Majelis Jemaat data (brief §18; migration 0038). Client-safe:
 * the rows the pemilihan functions return, the ballot inputs, the stable
 * error codes, and labels. The loaders and mutations live in `data.ts` /
 * `mutations.ts`.
 *
 * The contest limits (Penatua 10–30, PPJ 5–15) are deliberately not here:
 * they live in `pemilihan_kontes` and the database enforces them; the
 * ballot reads them with `loadKontes()`.
 *
 * Each row schema is tied to the generated function types: its keys must be
 * exactly the function's return columns (checked at compile time), while
 * Zod fixes the nullability the generator gets wrong.
 */

type PortalFunctions = Database["portal"]["Functions"];
type PublicFunctions = Database["public"]["Functions"];
type PortalFn = "pemilihan_aktif_saya" | "kandidat" | "berikan_suara" | "hasil_pemilihan";
type PublicFn = "hasil_partisipasi" | "hasil_suara" | "berikan_suara_dibantu";
type ReturnRow<T> = T extends { Returns: readonly (infer R)[] } ? R : never;
type Row<F extends PortalFn | PublicFn> = F extends PortalFn
  ? ReturnRow<PortalFunctions[F]>
  : F extends PublicFn
    ? ReturnRow<PublicFunctions[F]>
    : never;

function fnRow<F extends PortalFn | PublicFn, S extends { [K in keyof Row<F>]-?: z.ZodType }>(
  _fn: F,
  shape: S & Record<Exclude<keyof S, keyof Row<F>>, never>,
) {
  return z.object(shape as S);
}

const text = z.string().nullable();
const count = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const PEMILIHAN_STATUS = ["draft", "dibuka", "ditutup", "diumumkan"] as const;
export type PemilihanStatus = (typeof PEMILIHAN_STATUS)[number];

export const PEMILIHAN_STATUS_LABELS: Record<PemilihanStatus, string> = {
  draft: "Draft",
  dibuka: "Dibuka",
  ditutup: "Ditutup",
  diumumkan: "Diumumkan",
};

/** The two contests; their names and limits come from `pemilihan_kontes`. */
export const KONTES_KODE = ["penatua", "ppj"] as const;
export type KontesKode = (typeof KONTES_KODE)[number];

export const METODE_SUARA = ["mandiri", "dibantu"] as const;
export type MetodeSuara = (typeof METODE_SUARA)[number];

/**
 * The stable SQLSTATEs raised by migration 0038, and what each means for the
 * UI. The database's message for each is hand-written Indonesian and safe to
 * show; it never names a choice.
 */
export const PEMILIHAN_ERROR_CODES = {
  PM001: "di_luar_jadwal",
  PM002: "bukan_pemilih",
  PM003: "sudah_memilih",
  PM004: "jumlah_pilihan",
  PM005: "kandidat_tidak_valid",
  PM006: "pilihan_ganda",
  PM007: "formulir_terpakai",
  PM008: "bantu_diri_sendiri",
  PM009: "formulir_tidak_valid",
  PM010: "terkunci",
  PM011: "status_tidak_valid",
} as const;

export type PemilihanErrorReason =
  | (typeof PEMILIHAN_ERROR_CODES)[keyof typeof PEMILIHAN_ERROR_CODES]
  | "bukan_jemaat"
  | "wajib_ganti_password"
  | "tidak_ditemukan"
  | "akses"
  | "tidak_valid"
  | "gagal";

export function isPemilihanErrorCode(code: string | undefined): code is keyof typeof PEMILIHAN_ERROR_CODES {
  return code !== undefined && Object.hasOwn(PEMILIHAN_ERROR_CODES, code);
}

// ---------------------------------------------------------------------------
// Contest config (table pemilihan_kontes)
// ---------------------------------------------------------------------------

export const kontesRowSchema = z.object({
  kode: z.enum(KONTES_KODE),
  nama: z.string(),
  min_pilih: z.number().int().positive(),
  max_pilih: z.number().int().positive(),
  urutan: z.number().int(),
});

export type Kontes = { kode: KontesKode; nama: string; minPilih: number; maxPilih: number };

export function toKontes(row: z.infer<typeof kontesRowSchema>): Kontes {
  return { kode: row.kode, nama: row.nama, minPilih: row.min_pilih, maxPilih: row.max_pilih };
}

// ---------------------------------------------------------------------------
// portal.pemilihan_aktif_saya
// ---------------------------------------------------------------------------

export const pemilihanAktifSayaRowSchema = fnRow("pemilihan_aktif_saya", {
  id: z.string(),
  nama: z.string(),
  periode: text,
  status: z.enum(PEMILIHAN_STATUS),
  dibuka_pada: z.string(),
  ditutup_pada: z.string(),
  dapat_memilih: z.boolean(),
  sudah_memilih: z.boolean(),
  waktu_memilih: text,
  metode: z.enum(METODE_SUARA).nullable(),
  hasil_tersedia: z.boolean(),
});

export type PemilihanSaya = {
  id: string;
  nama: string;
  periode: string | null;
  status: PemilihanStatus;
  dibukaPada: string;
  ditutupPada: string;
  dapatMemilih: boolean;
  sudahMemilih: boolean;
  /** When the vote was recorded (ISO timestamp); null until then. */
  waktuMemilih: string | null;
  /** "dibantu": "Suara Anda dicatat oleh panitia pada {waktu}" (§18.5). */
  metode: MetodeSuara | null;
  hasilTersedia: boolean;
};

export function toPemilihanSaya(row: z.infer<typeof pemilihanAktifSayaRowSchema>): PemilihanSaya {
  return {
    id: row.id,
    nama: row.nama,
    periode: row.periode,
    status: row.status,
    dibukaPada: row.dibuka_pada,
    ditutupPada: row.ditutup_pada,
    dapatMemilih: row.dapat_memilih,
    sudahMemilih: row.sudah_memilih,
    waktuMemilih: row.waktu_memilih,
    metode: row.metode,
    hasilTersedia: row.hasil_tersedia,
  };
}

// ---------------------------------------------------------------------------
// portal.kandidat
// ---------------------------------------------------------------------------

export const kandidatRowSchema = fnRow("kandidat", {
  jemaat_id: z.string(),
  nama_tampilan: z.string(),
});

export type Kandidat = { jemaatId: string; namaTampilan: string };

export function toKandidat(row: z.infer<typeof kandidatRowSchema>): Kandidat {
  return { jemaatId: row.jemaat_id, namaTampilan: row.nama_tampilan };
}

// ---------------------------------------------------------------------------
// Results: portal.hasil_pemilihan, hasil_suara, hasil_partisipasi
// ---------------------------------------------------------------------------

export const hasilPemilihanRowSchema = fnRow("hasil_pemilihan", {
  kontes: z.enum(KONTES_KODE),
  kontes_nama: z.string(),
  nama_tampilan: z.string(),
  jumlah_suara: count,
  peringkat: z.number().int().positive(),
});

export const hasilSuaraRowSchema = fnRow("hasil_suara", {
  kontes: z.enum(KONTES_KODE),
  kontes_nama: z.string(),
  jemaat_id: z.string(),
  nama_tampilan: z.string(),
  jumlah_suara: count,
  peringkat: z.number().int().positive(),
});

/** One candidate's tally in one contest. Candidates sharing `peringkat` are tied ("Seri"). */
export type HasilKandidat = {
  kontes: KontesKode;
  kontesNama: string;
  /** Only in the panitia's view (hasil_suara). */
  jemaatId?: string;
  namaTampilan: string;
  jumlahSuara: number;
  peringkat: number;
};

export function toHasilKandidat(
  row: z.infer<typeof hasilPemilihanRowSchema> | z.infer<typeof hasilSuaraRowSchema>,
): HasilKandidat {
  return {
    kontes: row.kontes,
    kontesNama: row.kontes_nama,
    ...("jemaat_id" in row ? { jemaatId: row.jemaat_id } : {}),
    namaTampilan: row.nama_tampilan,
    jumlahSuara: row.jumlah_suara,
    peringkat: row.peringkat,
  };
}

/** Whether a candidate shares its rank with another one in the same contest. */
export function isSeri(hasil: readonly HasilKandidat[], item: HasilKandidat): boolean {
  return hasil.some((other) => other !== item && other.kontes === item.kontes && other.peringkat === item.peringkat);
}

export const hasilPartisipasiRowSchema = fnRow("hasil_partisipasi", {
  total_pemilih: count,
  sudah_memilih: count,
  persen: z.coerce.number().min(0).max(100),
  mandiri: count,
  dibantu: count,
  dibantu_per_panitia: z.array(
    z.object({ user_id: z.string(), nama: z.string().nullable(), jumlah: z.number().int().positive() }),
  ),
});

export type HasilPartisipasi = {
  totalPemilih: number;
  sudahMemilih: number;
  persen: number;
  mandiri: number;
  dibantu: number;
  /** nama is null once that panitia's account is gone. */
  dibantuPerPanitia: { userId: string; nama: string | null; jumlah: number }[];
};

export function toHasilPartisipasi(row: z.infer<typeof hasilPartisipasiRowSchema>): HasilPartisipasi {
  return {
    totalPemilih: row.total_pemilih,
    sudahMemilih: row.sudah_memilih,
    persen: row.persen,
    mandiri: row.mandiri,
    dibantu: row.dibantu,
    dibantuPerPanitia: row.dibantu_per_panitia.map((p) => ({ userId: p.user_id, nama: p.nama, jumlah: p.jumlah })),
  };
}

// ---------------------------------------------------------------------------
// Casting a vote: portal.berikan_suara, berikan_suara_dibantu
// ---------------------------------------------------------------------------

export const berikanSuaraRowSchema = fnRow("berikan_suara", {
  waktu: z.string(),
  pemilihan_nama: z.string(),
});

export const berikanSuaraDibantuRowSchema = fnRow("berikan_suara_dibantu", {
  waktu: z.string(),
  nama_pemilih: z.string(),
});

const INVALID = "Data yang dikirim tidak valid.";

/**
 * Generous ceiling against oversized payloads only; the real limits are
 * the database's (pemilihan_kontes).
 */
const MAX_CHOICES = 100;

const choices = z.array(z.uuid({ error: INVALID }), { error: INVALID }).max(MAX_CHOICES, INVALID);

/** A ballot from the portal (§18.3). Duplicates, candidacy, and counts are checked by the database. */
export const suaraInputSchema = z.strictObject(
  {
    pemilihanId: z.uuid({ error: "Pemilihan tidak ditemukan." }),
    penatua: choices,
    ppj: choices,
  },
  { error: INVALID },
);

export type SuaraInput = z.infer<typeof suaraInputSchema>;

/** A paper ballot the panitia records for a voter (§18.5). Mirrors the database's form-number rule. */
export const suaraDibantuInputSchema = z.strictObject(
  {
    pemilihanId: z.uuid({ error: "Pemilihan tidak ditemukan." }),
    jemaatId: z.uuid({ error: INVALID }),
    nomorFormulir: z
      .string({ error: "Nomor formulir wajib diisi." })
      .trim()
      .min(1, "Nomor formulir wajib diisi.")
      .max(50, "Nomor formulir maksimal 50 karakter."),
    penatua: choices,
    ppj: choices,
  },
  { error: INVALID },
);

export type SuaraDibantuInput = z.infer<typeof suaraDibantuInputSchema>;
