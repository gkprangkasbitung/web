import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { layoutFor, SMKA_GROUP_KEYS, SMKA_GROUPS, type SmkaGroupKey } from "@/lib/peribadahan";
import type { Database } from "@/types/database";

/**
 * Portal Jemaat data (brief §17.1–17.2; migration 0037). Client-safe: the
 * rows the `portal` functions return, the change-request input rules, and
 * labels. The loaders and mutations live in `data.ts` / `mutations.ts`.
 *
 * Each row schema is tied to the generated `Database["portal"]` types: its
 * keys must be exactly the function's generated return columns (checked at
 * compile time), while Zod fixes the nullability the generator gets wrong
 * (it marks every returned column non-null; stage 2 note).
 */

type PortalFunctions = Database["portal"]["Functions"];
export type PortalFunctionName = Exclude<keyof PortalFunctions, "_jemaat_id_saya">;
type PortalRow<F extends PortalFunctionName> = PortalFunctions[F]["Returns"] extends readonly (infer R)[] ? R : never;

function portalRow<F extends PortalFunctionName, S extends { [K in keyof PortalRow<F>]-?: z.ZodType }>(
  _fn: F,
  shape: S & Record<Exclude<keyof S, keyof PortalRow<F>>, never>,
) {
  return z.object(shape as S);
}

const isoDate = z.string().refine(isValidIsoDate);
const text = z.string().nullable();

// ---------------------------------------------------------------------------
// profil_saya
// ---------------------------------------------------------------------------

export const profilSayaRowSchema = portalRow("profil_saya", {
  nama: z.string(),
  nomor_anggota: text,
  jenis_kelamin: text,
  status_keanggotaan: text,
  wilayah_nama: text,
  keluarga_nama: text,
  hubungan_keluarga: text,
  tanggal_lahir: isoDate.nullable(),
  tanggal_masuk: isoDate.nullable(),
  pekerjaan: text,
  alamat: text,
  no_hp: text,
});

export type ProfilSaya = {
  nama: string;
  nomorAnggota: string | null;
  jenisKelamin: string | null;
  statusKeanggotaan: string | null;
  wilayahNama: string | null;
  keluargaNama: string | null;
  hubunganKeluarga: string | null;
  tanggalLahir: string | null;
  tanggalMasuk: string | null;
  pekerjaan: string | null;
  alamat: string | null;
  noHp: string | null;
};

export function toProfilSaya(row: z.infer<typeof profilSayaRowSchema>): ProfilSaya {
  return {
    nama: row.nama,
    nomorAnggota: row.nomor_anggota,
    jenisKelamin: row.jenis_kelamin,
    statusKeanggotaan: row.status_keanggotaan,
    wilayahNama: row.wilayah_nama,
    keluargaNama: row.keluarga_nama,
    hubunganKeluarga: row.hubungan_keluarga,
    tanggalLahir: row.tanggal_lahir,
    tanggalMasuk: row.tanggal_masuk,
    pekerjaan: row.pekerjaan,
    alamat: row.alamat,
    noHp: row.no_hp,
  };
}

// ---------------------------------------------------------------------------
// keluarga_saya
// ---------------------------------------------------------------------------

export const keluargaSayaRowSchema = portalRow("keluarga_saya", {
  nama: z.string(),
  hubungan_keluarga: text,
  status_keanggotaan: text,
});

export type AnggotaKeluarga = { nama: string; hubunganKeluarga: string | null; statusKeanggotaan: string | null };

export function toAnggotaKeluarga(row: z.infer<typeof keluargaSayaRowSchema>): AnggotaKeluarga {
  return { nama: row.nama, hubunganKeluarga: row.hubungan_keluarga, statusKeanggotaan: row.status_keanggotaan };
}

// ---------------------------------------------------------------------------
// pelayanan_saya
// ---------------------------------------------------------------------------

export const PELAYANAN_PERAN = ["pelayan_firman", "liturgos", "pemusik", "pnj", "smka_pf"] as const;
export type PelayananPeran = (typeof PELAYANAN_PERAN)[number];

/** The most days `pelayanan_saya` accepts, both ends included (enforced in SQL). */
export const PELAYANAN_MAX_DAYS = 400;

export const pelayananSayaRowSchema = portalRow("pelayanan_saya", {
  tanggal: isoDate,
  jam: text,
  kategori_key: z.string(),
  kategori_nama: z.string(),
  tempat_nama: text,
  peran: z.enum(PELAYANAN_PERAN),
  smka_kelompok: z.enum(SMKA_GROUP_KEYS).nullable(),
});

export type PelayananSaya = {
  tanggal: string;
  jam: string | null;
  kategoriKey: string;
  kategoriNama: string;
  tempatNama: string | null;
  peran: PelayananPeran;
  smkaKelompok: SmkaGroupKey | null;
  /** From the category config, e.g. "Pelayan Liturgi" for SMKA, "Pelayan Firman Kelas Batita". */
  peranLabel: string;
};

/** The role's label, from the same category config the admin and the public site use. */
export function peranLabel(peran: PelayananPeran, kategoriKey: string, kelompok: SmkaGroupKey | null): string {
  switch (peran) {
    case "pelayan_firman":
      return "Pelayan Firman";
    case "liturgos":
      return layoutFor(kategoriKey).liturgosLabel;
    case "pemusik":
      return "Pemusik";
    case "pnj":
      return "Pemandu Nyanyian Jemaat";
    case "smka_pf": {
      const group = SMKA_GROUPS.find((g) => g.key === kelompok);
      return group ? `Pelayan Firman ${group.label}` : "Pelayan Firman";
    }
  }
}

export function toPelayananSaya(row: z.infer<typeof pelayananSayaRowSchema>): PelayananSaya {
  return {
    tanggal: row.tanggal,
    jam: row.jam,
    kategoriKey: row.kategori_key,
    kategoriNama: row.kategori_nama,
    tempatNama: row.tempat_nama,
    peran: row.peran,
    smkaKelompok: row.smka_kelompok,
    peranLabel: peranLabel(row.peran, row.kategori_key, row.smka_kelompok),
  };
}

// ---------------------------------------------------------------------------
// komisi_saya
// ---------------------------------------------------------------------------

export const komisiSayaRowSchema = portalRow("komisi_saya", {
  komisi_nama: z.string(),
  komisi_slug: z.string(),
  periode: text,
  jabatan_nama: z.string(),
});

export type KomisiSaya = { komisiNama: string; komisiSlug: string; periode: string | null; jabatanNama: string };

export function toKomisiSaya(row: z.infer<typeof komisiSayaRowSchema>): KomisiSaya {
  return {
    komisiNama: row.komisi_nama,
    komisiSlug: row.komisi_slug,
    periode: row.periode,
    jabatanNama: row.jabatan_nama,
  };
}

// ---------------------------------------------------------------------------
// persembahan_saya, pengaturan_portal
// ---------------------------------------------------------------------------

export const persembahanSayaRowSchema = portalRow("persembahan_saya", {
  tanggal: isoDate,
  jumlah: z.coerce.number().nonnegative(),
});

export type PersembahanSaya = { tanggal: string; jumlah: number };

export const pengaturanPortalRowSchema = portalRow("pengaturan_portal", {
  tampilkan_persembahan: z.boolean(),
});

export type PengaturanPortal = { tampilkanPersembahan: boolean };

// ---------------------------------------------------------------------------
// Change requests (pengajuan_saya, ajukan_perubahan)
// ---------------------------------------------------------------------------

/** The only fields a jemaat may request a change to (brief §17.2), in display order. */
export const PENGAJUAN_FIELDS = ["no_hp", "alamat", "pekerjaan"] as const;
export type PengajuanField = (typeof PENGAJUAN_FIELDS)[number];

export const PENGAJUAN_FIELD_LABELS: Record<PengajuanField, string> = {
  no_hp: "No. HP",
  alamat: "Alamat",
  pekerjaan: "Pekerjaan",
};

export const PENGAJUAN_STATUS = ["menunggu", "disetujui", "ditolak", "dibatalkan"] as const;
export type PengajuanStatus = (typeof PENGAJUAN_STATUS)[number];

export const PENGAJUAN_STATUS_LABELS: Record<PengajuanStatus, string> = {
  menunggu: "Menunggu",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

/** A request's fields: a value, or null to clear the field. Absent = not requested. */
export type PengajuanData = Partial<Record<PengajuanField, string | null>>;

const pengajuanDataSchema = z.partialRecord(z.enum(PENGAJUAN_FIELDS), z.string().nullable());

export const pengajuanSayaRowSchema = portalRow("pengajuan_saya", {
  id: z.string(),
  data: pengajuanDataSchema,
  status: z.enum(PENGAJUAN_STATUS),
  catatan_admin: text,
  created_at: z.string(),
  ditinjau_pada: text,
});

export type PengajuanSaya = {
  id: string;
  data: PengajuanData;
  status: PengajuanStatus;
  catatanAdmin: string | null;
  createdAt: string;
  ditinjauPada: string | null;
};

export function toPengajuanSaya(row: z.infer<typeof pengajuanSayaRowSchema>): PengajuanSaya {
  return {
    id: row.id,
    data: row.data,
    status: row.status,
    catatanAdmin: row.catatan_admin,
    createdAt: row.created_at,
    ditinjauPada: row.ditinjau_pada,
  };
}

/** The fields a request touches, in display order. */
export function pengajuanFields(data: PengajuanData): PengajuanField[] {
  return PENGAJUAN_FIELDS.filter((field) => field in data);
}

const INVALID = "Data yang dikirim tidak valid.";

/** Present: a value or "" / null to clear it; absent: not part of the request. */
function clearable(schema: z.ZodType<string, string>) {
  return schema
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));
}

/**
 * The change-request input, for the /jemaat/profil form and the server
 * alike. Mirrors private.pengajuan_data_error (0037), which stays the
 * authority: no_hp digits only (8–15), alamat ≤ 500, pekerjaan ≤ 200
 * characters, no other keys.
 */
export const pengajuanInputSchema = z
  .strictObject(
    {
      no_hp: clearable(
        z
          .string({ error: INVALID })
          .trim()
          .refine((value) => value === "" || /^[0-9]{8,15}$/.test(value), {
            message: "No. HP hanya boleh berisi angka, 8 sampai 15 digit.",
          }),
      ),
      alamat: clearable(z.string({ error: INVALID }).trim().max(500, "Alamat maksimal 500 karakter.")),
      pekerjaan: clearable(z.string({ error: INVALID }).trim().max(200, "Pekerjaan maksimal 200 karakter.")),
    },
    {
      error: (issue) =>
        issue.code === "unrecognized_keys"
          ? `Data "${String(issue.keys[0]).slice(0, 50)}" tidak bisa diajukan lewat Portal Jemaat. Yang bisa diajukan hanya No. HP, Alamat, dan Pekerjaan.`
          : undefined,
    },
  )
  .refine((data) => PENGAJUAN_FIELDS.some((field) => data[field] !== undefined), {
    message: "Pilih minimal satu data yang ingin diubah.",
  });

export type PengajuanInput = z.infer<typeof pengajuanInputSchema>;
