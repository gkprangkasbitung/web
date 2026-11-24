import { z } from "zod";

import { isoDateSchema, TIME_PATTERN } from "@/lib/dates";

import type { KategoriImpor, Tanda } from "./impor";
import type { HasilKandidat, HasilPartisipasi, PemilihanStatus } from "./types";

/** What the live results page polls (GET /api/admin/pemilihan/[id]/hasil). */
export type HasilLive = {
  status: PemilihanStatus;
  tampilkanHasil: boolean;
  partisipasi: HasilPartisipasi;
  /** Null without pemilihan_hasil:read. */
  suara: HasilKandidat[] | null;
  /** When the server read it (ISO). */
  waktu: string;
};

/**
 * The panitia's pages (brief §18.4, stage 14b): row shapes and input
 * schemas. Client-safe; the loaders are in `admin-data.ts`, the routes in
 * `lib/pemilihan-routes.ts`.
 */

export type PemilihanRow = {
  id: string;
  nama: string;
  periode: string | null;
  status: PemilihanStatus;
  dibukaPada: string | null;
  ditutupPada: string | null;
  tampilkanHasil: boolean;
  waktuDibuka: string | null;
  waktuDitutup: string | null;
  waktuDiumumkan: string | null;
  createdAt: string;
  totalPemilih: number;
  sudahMemilih: number;
  persen: number;
  barisBelumBeres: number;
};

export type Pencatat = {
  dibuatOleh: string | null;
  dibukaOleh: string | null;
  ditutupOleh: string | null;
  diumumkanOleh: string | null;
};

export type BarisImporRow = {
  id: string;
  urutan: number;
  sumber: string;
  kelompokWilayah: string;
  baris: number;
  nomor: string | null;
  nama: string;
  domisili: string | null;
  tandaMemilih: Tanda;
  tandaDipilih: Tanda;
  tandaTidakDipilih: Tanda;
  usia: string | null;
  keterangan: string | null;
  kategori: KategoriImpor;
  calonJemaatIds: string[];
  catatan: string[];
  jemaatId: string | null;
  dapatMemilih: boolean | null;
  dapatDipilih: boolean | null;
  perluKonfirmasiMemilih: boolean;
  dikeluarkan: boolean;
  beres: boolean;
};

export type PesertaRow = {
  jemaatId: string;
  namaTampilan: string;
  dapatMemilih: boolean;
  dapatDipilih: boolean;
  kelompokWilayah: string | null;
  keterangan: string | null;
  alasanTidakDapatDipilih: string | null;
  punyaAkun: boolean;
  /** The account's id, only for a jemaat-only account (the kind the panitia may reset). */
  akunJemaatId: string | null;
  username: string | null;
};

/** The election as the assisted-voting page shows it. */
export type PemilihanBantu = {
  id: string;
  nama: string;
  periode: string | null;
  status: PemilihanStatus;
  dibukaPada: string | null;
  ditutupPada: string | null;
};

/** A voter the panitia may assist: not voted yet, not the panitia's own record. */
export type PemilihBantu = { jemaatId: string; namaTampilan: string; kelompokWilayah: string | null };

/** A jemaat the panitia can match a row to: Domisili's hint shows alamat and wilayah. */
export type JemaatPilihan = { id: string; nama: string; alamat: string | null; wilayah: string | null };

/** What still keeps a row from being resolved, in the panitia's words. Empty when resolved or left out. */
export function masalahBaris(row: BarisImporRow): string[] {
  if (row.dikeluarkan) return [];
  const masalah: string[] = [];
  if (!row.jemaatId) masalah.push("Pilih jemaat yang dimaksud.");
  if (row.dapatDipilih === null) masalah.push("Tentukan Dapat Dipilih atau Tidak Dapat Dipilih.");
  if (row.dapatMemilih === null) masalah.push("Tentukan Dapat Memilih.");
  else if (row.perluKonfirmasiMemilih) masalah.push("Dapat Memilih kosong: konfirmasi.");
  return masalah;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const INVALID = "Data yang dikirim tidak valid.";

const jadwalSchema = z
  .object({ tanggal: isoDateSchema, jam: z.string().regex(TIME_PATTERN, "Jam tidak valid.") })
  .nullable();

/** Create / edit an election (draft only). The schedule is in WIB; both ends or neither. */
export const pemilihanInputSchema = z
  .strictObject(
    {
      nama: z.string({ error: "Nama wajib diisi." }).trim().min(1, "Nama wajib diisi.").max(200, "Nama maksimal 200 karakter."),
      periode: z
        .string()
        .trim()
        .max(50, "Periode maksimal 50 karakter.")
        .nullish()
        .transform((value) => value || null),
      dibuka: jadwalSchema,
      ditutup: jadwalSchema,
    },
    { error: INVALID },
  )
  .superRefine((value, ctx) => {
    if ((value.dibuka === null) !== (value.ditutup === null)) {
      ctx.addIssue({ code: "custom", message: "Isi jadwal dibuka dan ditutup, atau kosongkan keduanya." });
      return;
    }
    if (value.dibuka && value.ditutup) {
      const a = `${value.dibuka.tanggal}T${value.dibuka.jam}`;
      const b = `${value.ditutup.tanggal}T${value.ditutup.jam}`;
      if (a >= b) ctx.addIssue({ code: "custom", message: "Jadwal ditutup harus setelah jadwal dibuka." });
    }
  });

export type PemilihanInput = z.input<typeof pemilihanInputSchema>;

export const STATUS_AKSI = ["buka", "tutup", "umumkan"] as const;
export type StatusAksi = (typeof STATUS_AKSI)[number];

/** Which status an action moves from and to. */
export const STATUS_TRANSISI: Record<StatusAksi, { dari: PemilihanStatus; ke: PemilihanStatus }> = {
  buka: { dari: "draft", ke: "dibuka" },
  tutup: { dari: "dibuka", ke: "ditutup" },
  umumkan: { dari: "ditutup", ke: "diumumkan" },
};

export const statusInputSchema = z.strictObject({ aksi: z.enum(STATUS_AKSI, { error: INVALID }) }, { error: INVALID });

export const tampilkanHasilInputSchema = z.strictObject({ aktif: z.boolean({ error: INVALID }) }, { error: INVALID });

const tanda = z.enum(["ya", "tidak", "kosong", "tidak_dikenal"]);
const teks = (max: number) => z.string().max(max, INVALID);

/** One row as the preview built it, sent back to be saved (impor_peserta_pemilihan re-derives the values). */
export const barisImporInputSchema = z.strictObject({
  sumber: teks(300).min(1, INVALID),
  kelompokWilayah: teks(100).min(1, INVALID),
  baris: z.number().int().min(1).max(1_000_000),
  nomor: teks(20).nullable(),
  nama: teks(200).min(1, INVALID),
  domisili: teks(300).nullable(),
  tandaMemilih: tanda,
  tandaDipilih: tanda,
  tandaTidakDipilih: tanda,
  usia: teks(20).nullable(),
  keterangan: teks(500).nullable(),
  kategori: z.enum(["cocok", "ambigu", "tidak_ditemukan", "error"]),
  calonJemaatIds: z.array(z.uuid()).max(50),
  jemaatId: z.uuid().nullable(),
  catatan: z.array(teks(300)).max(10),
});

export const MAKS_BARIS_IMPOR = 5000;

export const simpanImporInputSchema = z.strictObject(
  {
    baris: z
      .array(barisImporInputSchema, { error: INVALID })
      .min(1, "Tidak ada baris peserta untuk diimpor.")
      .max(MAKS_BARIS_IMPOR, `Maksimal ${MAKS_BARIS_IMPOR} baris peserta sekali impor.`),
    /** For the activity log: how many sheets were read. */
    jumlahLembar: z.number().int().min(1).max(500),
  },
  { error: INVALID },
);

export type SimpanImporInput = z.infer<typeof simpanImporInputSchema>;

/** Resolving one imported row; an omitted field stays as it is. */
export const perbaruiBarisInputSchema = z
  .strictObject(
    {
      jemaatId: z.uuid({ error: INVALID }).optional(),
      dapatMemilih: z.boolean({ error: INVALID }).optional(),
      dapatDipilih: z.boolean({ error: INVALID }).optional(),
      dikeluarkan: z.boolean({ error: INVALID }).optional(),
    },
    { error: INVALID },
  )
  .refine((value) => Object.values(value).some((v) => v !== undefined), INVALID);

export type PerbaruiBarisInput = z.infer<typeof perbaruiBarisInputSchema>;

/** File limits for the import (each file, and how many at once). Panitia lists are a few dozen KB. */
export const IMPOR_FILE = { maxBytes: 1024 * 1024, maxFiles: 10, totalBytes: 4 * 1024 * 1024 } as const;
