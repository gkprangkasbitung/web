import type { StatusKeanggotaan } from "@/lib/jemaat";

/** Shared, client-safe pieces of the Komisi module (brief §14.8). */

/** A komisi member's jemaat must carry one of these statuses. */
export const KOMISI_ELIGIBLE_STATUSES: readonly StatusKeanggotaan[] = ["sidi", "anggota_penuh"];

export function isKomisiEligible(status: StatusKeanggotaan | null): boolean {
  return status !== null && (KOMISI_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export type JabatanKomisiRow = {
  id: string;
  nama: string;
  tunggal: boolean;
  sort_order: number;
};

export type KomisiListRow = {
  id: string;
  nama: string;
  slug: string;
  deskripsi: string | null;
  periode: string | null;
  foto_path: string | null;
  foto_alt: string | null;
  pembinaJemaatId: string | null;
  pembinaNama: string | null;
  tampil: boolean;
  sortOrder: number;
  jumlahAnggota: number;
};

export type KomisiAnggotaRow = {
  jemaatId: string;
  nama: string;
  jabatanId: string;
  jabatanNama: string;
  statusKeanggotaan: StatusKeanggotaan | null;
  eligible: boolean;
};

export type KomisiDetail = {
  id: string;
  nama: string;
  slug: string;
  deskripsi: string | null;
  periode: string | null;
  foto_path: string | null;
  foto_alt: string | null;
  pembinaJemaatId: string | null;
  pembinaNama: string | null;
  tampil: boolean;
  anggota: KomisiAnggotaRow[];
};

export const KOMISI_DELETE_DESCRIPTION_NO_MEMBERS = "Tindakan ini tidak bisa dibatalkan.";

export function komisiDeleteDescription(jumlahAnggota: number): string {
  if (jumlahAnggota === 0) return KOMISI_DELETE_DESCRIPTION_NO_MEMBERS;
  return `${jumlahAnggota} anggota yang tercatat di komisi ini akan ikut terlepas. Tindakan ini tidak bisa dibatalkan.`;
}

export const JABATAN_DELETE_IN_USE = "Jabatan ini masih dipakai oleh anggota komisi.";
