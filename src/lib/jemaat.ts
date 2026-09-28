/** Shared constants for Data Jemaat and Keluarga (brief §9.9-9.10). */

export const STATUS_KEANGGOTAAN = ["simpatisan", "baptis_anak", "sidi", "anggota_penuh"] as const;
export type StatusKeanggotaan = (typeof STATUS_KEANGGOTAAN)[number];

export const STATUS_KEANGGOTAAN_LABELS: Record<StatusKeanggotaan, string> = {
  simpatisan: "Simpatisan",
  baptis_anak: "Baptis Anak",
  sidi: "Sidi",
  anggota_penuh: "Anggota Penuh",
};

/** Distinct badge styles per status (brief §9.9's own example). */
export const STATUS_KEANGGOTAAN_BADGE: Record<StatusKeanggotaan, "outline-accent" | "accent" | "neutral"> = {
  simpatisan: "outline-accent",
  baptis_anak: "accent",
  sidi: "neutral",
  anggota_penuh: "neutral",
};

export const JENIS_KELAMIN = ["laki_laki", "perempuan"] as const;
export type JenisKelamin = (typeof JENIS_KELAMIN)[number];

export const JENIS_KELAMIN_LABELS: Record<JenisKelamin, string> = {
  laki_laki: "Laki-laki",
  perempuan: "Perempuan",
};

export const HUBUNGAN_KELUARGA = ["Kepala Keluarga", "Istri", "Anak", "Orang Tua", "Kerabat Lain"] as const;
export type HubunganKeluarga = (typeof HUBUNGAN_KELUARGA)[number];
