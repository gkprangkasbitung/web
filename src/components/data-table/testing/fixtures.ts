import type { IsoDate } from "@/lib/dates";

/**
 * Fictional rows for the table tests and the dev-only demo page. Every name
 * says "Contoh"; none of it is church data.
 */

export type ContohStatus = "simpatisan" | "baptis_anak" | "sidi" | "anggota_penuh";

export const CONTOH_STATUS_LABEL: Record<ContohStatus, string> = {
  simpatisan: "Simpatisan",
  baptis_anak: "Baptis Anak",
  sidi: "Sidi",
  anggota_penuh: "Anggota Penuh",
};

export const CONTOH_STATUS_OPTIONS = (Object.keys(CONTOH_STATUS_LABEL) as ContohStatus[]).map((value) => ({
  value,
  label: CONTOH_STATUS_LABEL[value],
}));

export type ContohJemaat = {
  id: string;
  nomorAnggota: string;
  nama: string;
  keluarga: string | null;
  wilayah: string | null;
  status: ContohStatus;
  kontak: string | null;
  tanggalMasuk: IsoDate | null;
  persembahan: number | null;
};

const WILAYAH = ["Contoh Wilayah Utara", "Contoh Wilayah Selatan", "Contoh Wilayah Timur", null] as const;
const STATUS: ContohStatus[] = ["anggota_penuh", "sidi", "baptis_anak", "simpatisan"];
const KELUARGA = ["Kel. Contoh Satu", "Kel. Contoh Dua", "Kel. Contoh Tiga", "Kel. Contoh Empat", null];

export const CONTOH_JEMAAT_COUNT = 57;

/**
 * 57 rows. The number in each name is a permutation of 1–57, so the unsorted
 * order differs from the sorted one, and names without zero padding check
 * numeric collation ("Jemaat Contoh 2" before "Jemaat Contoh 10").
 */
export const CONTOH_JEMAAT: ContohJemaat[] = Array.from({ length: CONTOH_JEMAAT_COUNT }, (_, i) => {
  const n = ((i * 23) % CONTOH_JEMAAT_COUNT) + 1;
  const month = (i % 12) + 1;
  const day = (i % 28) + 1;
  return {
    id: `contoh-${i + 1}`,
    nomorAnggota: `CT-${String(n).padStart(4, "0")}`,
    nama: `Jemaat Contoh ${n}`,
    keluarga: KELUARGA[i % KELUARGA.length] ?? null,
    wilayah: WILAYAH[i % WILAYAH.length] ?? null,
    status: STATUS[Math.floor(i / 3) % STATUS.length]!,
    kontak: i % 6 === 5 ? null : `0800000${String(n).padStart(4, "0")}`,
    tanggalMasuk: i % 9 === 8 ? null : `20${String(10 + (i % 15)).padStart(2, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    persembahan: i % 7 === 6 ? null : ((i * 37) % 20) * 50_000 + 25_000,
  };
});
