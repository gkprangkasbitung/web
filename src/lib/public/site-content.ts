import "server-only";

import { formatDateLong, weekContaining, type DateRange } from "@/lib/dates";
import { formatJam } from "@/lib/peribadahan";
import {
  loadJadwalPekanIni,
  loadLatestPublicWarta,
  loadPublicKegiatanMendatang,
  loadPublicMajelis,
  loadPublicPelayanan,
  loadPublicPendeta,
  loadPublicProfil,
  type PublicMajelisRow,
  type PublicPelayananRow,
  type PublicPendetaRow,
  type PublicProfilRow,
  type PublicKegiatanRow,
  type PublicWartaListItem,
  type Result,
} from "@/lib/public-site";
import type { PublicScheduleRow } from "@/lib/public-schedule";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { buildWaLink } from "./whatsapp";

/**
 * The public site's one data-loading entry point (brief §9c instruction B):
 * one function per page, each returning everything that page's components
 * need as typed props. Components never fetch on their own.
 *
 * Two kinds of fields:
 * - schedule, warta, Pelayanan, Majelis, and Kegiatan — can fail, the page
 *   shows an inline error (schedule/warta) or an empty section (the rest,
 *   which already render nothing for an empty list) for just that piece;
 * - Profil Gereja (`public_profil_gereja()`, stage 11a) — an empty field is
 *   `null` and its section is hidden (brief §14.6), never a placeholder.
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

export type SosialMedia = { instagram: string | null; youtube: string | null; facebook: string | null };

export type RekeningInfo = { namaBank: string; nomorRekening: string; atasNama: string; qris: PublicPhoto };

export type SambutanInfo = { teks: string; nama: string | null; jabatan: string | null; photo: PublicPhoto };

// Only names the server generates (0029's private.is_situs_photo_path).
const PHOTO_PATH = /^[a-z]+\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function toPhoto(path: string | null, alt: string | null): PublicPhoto {
  return path && alt && PHOTO_PATH.test(path) ? { url: situsPhotoUrl(path), alt } : null;
}

function toKontak(row: PublicProfilRow): KontakInfo | null {
  const kontak = {
    alamat: row.alamat,
    telepon: row.telepon,
    email: row.email,
    jamSekretariat: row.jam_sekretariat,
    mapsUrl: row.maps_url,
  };
  return Object.values(kontak).some((value) => value !== null) ? kontak : null;
}

function toRekening(row: PublicProfilRow): RekeningInfo | null {
  if (!row.nama_bank || !row.nomor_rekening || !row.atas_nama) return null;
  return {
    namaBank: row.nama_bank,
    nomorRekening: row.nomor_rekening,
    atasNama: row.atas_nama,
    qris: toPhoto(row.qris_foto_path, row.qris_foto_alt),
  };
}

function toPelayananItem(row: PublicPelayananRow): PelayananItem {
  return { id: row.id, nama: row.nama, deskripsi: row.deskripsi, jadwal: row.jadwal, icon: row.icon };
}

function toMajelisItem(row: PublicMajelisRow): MajelisItem {
  return { id: row.id, nama: row.nama, jabatan: row.jabatan, photo: toPhoto(row.foto_path, row.foto_alt) };
}

function toKegiatanItem(row: PublicKegiatanRow): KegiatanItem {
  return {
    id: row.id,
    judul: row.judul,
    tanggal: formatDateLong(row.tanggal),
    waktu: row.waktu ? formatJam(row.waktu) : null,
    tempat: row.tempat,
    photo: toPhoto(row.foto_path, row.foto_alt),
  };
}

/** Beranda's "Kebaktian Minggu" card: this week's Kebaktian Minggu times, e.g. "07.00 & 09.30 WIB". */
export function kebaktianMingguTimes(rows: PublicScheduleRow[]): string | null {
  const times = [...new Set(rows.filter((row) => row.categoryKey === "umum" && row.jam).map((row) => formatJam(row.jam)))];
  times.sort();
  return times.length > 0 ? `${times.join(" & ")} WIB` : null;
}

export type BerandaContent = {
  heroTitle: string;
  heroSubtitle: string | null;
  heroPhoto: PublicPhoto;
  kebaktianMinggu: string | null;
  jadwalMingguIni: Result<PublicScheduleRow[]>;
  jadwalMingguIniRange: DateRange;
  wartaTerbaru: Result<PublicWartaListItem | null>;
  sambutan: SambutanInfo | null;
  pelayanan: PelayananItem[];
  kegiatan: KegiatanItem[];
  kontak: KontakInfo | null;
  rekening: RekeningInfo | null;
};

/** The church's name, when Profil Gereja has no hero title (the hero always shows, brief §2). */
export const DEFAULT_HERO_TITLE = "GKP Rangkasbitung";

export async function loadBerandaContent(): Promise<BerandaContent> {
  const [jadwalMingguIni, wartaTerbaru, profilResult, pelayananResult, kegiatanResult] = await Promise.all([
    loadJadwalPekanIni(),
    loadLatestPublicWarta(),
    loadPublicProfil(),
    loadPublicPelayanan(),
    loadPublicKegiatanMendatang(),
  ]);
  // A failed Profil load hides its sections (already logged), like an empty profile.
  const profil = profilResult.data;

  return {
    heroTitle: profil?.hero_judul ?? DEFAULT_HERO_TITLE,
    heroSubtitle: profil?.hero_subjudul ?? null,
    heroPhoto: profil ? toPhoto(profil.hero_foto_path, profil.hero_foto_alt) : null,
    kebaktianMinggu: jadwalMingguIni.data ? kebaktianMingguTimes(jadwalMingguIni.data) : null,
    jadwalMingguIni,
    jadwalMingguIniRange: weekContaining(),
    wartaTerbaru,
    sambutan: profil?.sambutan_teks
      ? {
          teks: profil.sambutan_teks,
          nama: profil.sambutan_pendeta_nama,
          jabatan: profil.sambutan_pendeta_peran,
          photo: toPhoto(profil.sambutan_pendeta_foto_path, profil.sambutan_pendeta_foto_alt),
        }
      : null,
    pelayanan: (pelayananResult.data ?? []).map(toPelayananItem),
    kegiatan: (kegiatanResult.data ?? []).map(toKegiatanItem),
    kontak: profil ? toKontak(profil) : null,
    rekening: profil ? toRekening(profil) : null,
  };
}

export type TentangKamiProfil = {
  sejarah: string | null;
  sejarahPhoto: PublicPhoto;
  visi: string | null;
  misi: string[];
  linimasa: { tahun: string; teks: string }[];
};

export type PendetaItem = {
  id: string;
  nama: string;
  peran: string;
  tahunMulai: number;
  tahunSelesai: number | null;
  keterangan: string | null;
  photo: PublicPhoto;
};

export type TentangKamiContent = {
  profil: Result<TentangKamiProfil>;
  /** Currently serving (brief §14.7: usually one, but not assumed to be exactly one). */
  pendetaMelayani: PendetaItem[];
  pendetaPernahMelayani: PendetaItem[];
  majelis: MajelisItem[];
};

function toPendetaItem(row: PublicPendetaRow): PendetaItem {
  return {
    id: row.id,
    nama: row.nama,
    peran: row.peran,
    tahunMulai: row.tahun_mulai,
    tahunSelesai: row.tahun_selesai,
    keterangan: row.keterangan,
    photo: toPhoto(row.foto_path, row.foto_alt),
  };
}

export async function loadTentangKamiContent(): Promise<TentangKamiContent> {
  const [result, majelisResult, pendetaResult] = await Promise.all([
    loadPublicProfil(),
    loadPublicMajelis(),
    loadPublicPendeta(),
  ]);
  const pendeta = (pendetaResult.data ?? []).map(toPendetaItem);
  return {
    profil: result.data
      ? {
          data: {
            sejarah: result.data.sejarah,
            sejarahPhoto: toPhoto(result.data.sejarah_foto_path, result.data.sejarah_foto_alt),
            visi: result.data.visi,
            misi: result.data.misi,
            linimasa: result.data.linimasa,
          },
          error: null,
        }
      : { data: null, error: result.error },
    // public_pendeta() already orders "currently serving first"; splitting
    // on tahunSelesai here keeps that same order within each group.
    pendetaMelayani: pendeta.filter((p) => p.tahunSelesai === null),
    pendetaPernahMelayani: pendeta.filter((p) => p.tahunSelesai !== null),
    majelis: (majelisResult.data ?? []).map(toMajelisItem),
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

export type KontakContent = Result<{ kontak: KontakInfo | null; waLink: string | null }>;

export async function loadKontakContent(): Promise<KontakContent> {
  const result = await loadPublicProfil();
  if (!result.data) return { data: null, error: result.error };
  const kontak = toKontak(result.data);
  return { data: { kontak, waLink: kontak?.telepon ? buildWaLink(kontak.telepon) : null }, error: null };
}

/** The footer's social links (every public page); null when none is set or the load failed. */
export async function loadSosialMedia(): Promise<SosialMedia | null> {
  const { data } = await loadPublicProfil();
  if (!data) return null;
  const links = { instagram: data.instagram_url, youtube: data.youtube_url, facebook: data.facebook_url };
  return Object.values(links).some((value) => value !== null) ? links : null;
}
