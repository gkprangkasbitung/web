import "server-only";

import { weekContaining, type DateRange } from "@/lib/dates";
import { loadJadwalPekanIni, loadLatestPublicWarta, type PublicWartaListItem, type Result } from "@/lib/public-site";
import type { PublicScheduleRow } from "@/lib/public-schedule";

import * as placeholder from "./placeholder-content";
import { buildWaLink } from "./whatsapp";

/**
 * The public site's one data-loading entry point (brief §9c instruction B):
 * one function per page, each returning everything that page's components
 * need as typed props. Components never fetch on their own.
 *
 * Two kinds of fields:
 * - real, database-backed data (`Result<T>`, from `lib/public-site.ts`
 *   /`lib/public-schedule.ts`, stage 9b) — can fail, the page shows an
 *   inline error for just that piece;
 * - placeholder data (`./placeholder-content.ts`) for modules that don't
 *   exist yet (Profil Gereja, Pelayanan, Majelis, Kegiatan, Kontak,
 *   Rekening) — always present, never fails, clearly marked TODO. Stage
 *   11a/11b/14 replace only the functions in that file; this module and
 *   every component stay as they are.
 */

export type PublicPhoto = { url: string; alt: string } | null;

export type PelayananItem = {
  id: string;
  nama: string;
  deskripsi: string | null;
  jadwal: string | null;
  icon: string;
};

export type MajelisItem = { id: string; nama: string; jabatan: string; photo: PublicPhoto };

export type KegiatanItem = {
  id: string;
  judul: string;
  tanggal: string;
  waktu: string | null;
  tempat: string | null;
  photo: PublicPhoto;
};

export type KontakInfo = {
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  jamSekretariat: string | null;
  mapsUrl: string | null;
};

export type RekeningInfo = { namaBank: string; nomorRekening: string; atasNama: string; qrisUrl: string | null };

export type BerandaContent = {
  heroTitle: string;
  heroSubtitle: string;
  heroPhoto: PublicPhoto;
  jadwalMingguIni: Result<PublicScheduleRow[]>;
  jadwalMingguIniRange: DateRange;
  wartaTerbaru: Result<PublicWartaListItem | null>;
  sambutan: { text: string; pastorName: string; pastorTitle: string; photo: PublicPhoto };
  pelayanan: PelayananItem[];
  kegiatan: KegiatanItem[];
  kontak: KontakInfo;
  rekening: RekeningInfo | null;
};

export async function loadBerandaContent(): Promise<BerandaContent> {
  const [jadwalMingguIni, wartaTerbaru] = await Promise.all([loadJadwalPekanIni(), loadLatestPublicWarta()]);
  return {
    ...placeholder.placeholderHero(),
    jadwalMingguIni,
    jadwalMingguIniRange: weekContaining(),
    wartaTerbaru,
    sambutan: placeholder.placeholderSambutan(),
    pelayanan: placeholder.placeholderPelayanan(),
    kegiatan: placeholder.placeholderKegiatan(),
    kontak: placeholder.placeholderKontak(),
    rekening: placeholder.placeholderRekening(),
  };
}

export type TentangKamiContent = {
  sejarah: { title: string; text: string; photo: PublicPhoto };
  visi: string;
  misi: string[];
  linimasa: { tahun: string; teks: string }[];
  majelis: MajelisItem[];
};

export function loadTentangKamiContent(): TentangKamiContent {
  return {
    sejarah: placeholder.placeholderSejarah(),
    visi: placeholder.placeholderVisi(),
    misi: placeholder.placeholderMisi(),
    linimasa: placeholder.placeholderLinimasa(),
    majelis: placeholder.placeholderMajelis(),
  };
}

export type JadwalIbadahContent = { week: DateRange; rows: Result<PublicScheduleRow[]> };

/**
 * The Minggu–Sabtu week containing today (Asia/Jakarta), same range as
 * Beranda and `public_jadwal_pekan_ini` — chosen over the rolling 7-day
 * `public_jadwal_mendatang` so the day tabs always cover this calendar
 * week (stage 9c decision, approved over stage 9b's original choice).
 */
export async function loadJadwalIbadahContent(): Promise<JadwalIbadahContent> {
  const rows = await loadJadwalPekanIni();
  return { week: weekContaining(), rows };
}

export type KontakContent = { kontak: KontakInfo; waLink: string | null };

export function loadKontakContent(): KontakContent {
  const kontak = placeholder.placeholderKontak();
  return { kontak, waLink: kontak.telepon ? buildWaLink(kontak.telepon) : null };
}
