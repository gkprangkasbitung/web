import "server-only";

import { weekContaining, type DateRange } from "@/lib/dates";
import { formatTanggalRange, formatWaktuRange, isSepanjangHari } from "@/lib/kegiatan";
import { formatJam } from "@/lib/peribadahan";
import {
  loadJadwalPekanIni,
  loadKegiatanBulan,
  loadKegiatanDetail,
  loadKegiatanMendatang,
  loadLatestPublicWarta,
  loadPublicKomisi,
  loadPublicKomisiList,
  loadPublicMajelis,
  loadPublicPelayanan,
  loadPublicPendeta,
  loadPublicProfil,
  type PublicMajelisRow,
  type PublicPelayananRow,
  type PublicPendetaRow,
  type PublicProfilRow,
  type PublicWartaListItem,
  type Result,
} from "@/lib/public-site";
import type { PublicScheduleRow } from "@/lib/public-schedule";
import type { PublicKegiatanBulanRow, PublicKegiatanMendatangRow } from "@/lib/public-kegiatan";
import { siteOrigin } from "@/lib/site-url";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { mapsEmbedSrc } from "./maps-embed";
import { buildShareWaLink, buildWaLink } from "./whatsapp";

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
  slug: string;
  /** Raw tanggal_mulai, for a compact date badge (the "Kegiatan lainnya" grid). */
  tanggalMulai: string;
  /** Formatted range: "16 – 18 Oktober 2026". */
  tanggal: string;
  waktuLabel: string | null;
  tempat: string | null;
  kategoriNama: string;
  kategoriWarna: string;
  photo: PublicPhoto;
};

export type KontakInfo = {
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  jamSekretariat: string | null;
  mapsUrl: string | null;
  /** The embedded map's `src` (lib/public/maps-embed.ts), from mapsUrl or else alamat; null when neither gives one. */
  mapEmbedSrc: string | null;
};

export type SosialMedia = { instagram: string | null; youtube: string | null; facebook: string | null };

export type RekeningInfo = { namaBank: string; nomorRekening: string; atasNama: string; qris: PublicPhoto };

export type SambutanInfo = { teks: string; nama: string | null; jabatan: string | null; photo: PublicPhoto };

// Only names the server generates (0029's private.is_situs_photo_path).
const PHOTO_PATH = /^[a-z]+\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function toPhoto(path: string | null, alt: string | null): PublicPhoto {
  return path && alt && PHOTO_PATH.test(path) ? { url: situsPhotoUrl(path), alt } : null;
}

async function toKontak(row: PublicProfilRow): Promise<KontakInfo | null> {
  const fields = {
    alamat: row.alamat,
    telepon: row.telepon,
    email: row.email,
    jamSekretariat: row.jam_sekretariat,
    mapsUrl: row.maps_url,
  };
  if (!Object.values(fields).some((value) => value !== null)) return null;
  return { ...fields, mapEmbedSrc: await mapsEmbedSrc(row.maps_url, row.alamat) };
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

function toKegiatanItem(row: PublicKegiatanMendatangRow): KegiatanItem {
  return {
    id: row.id,
    judul: row.judul,
    slug: row.slug,
    tanggalMulai: row.tanggalMulai,
    tanggal: formatTanggalRange(row.tanggalMulai, row.tanggalSelesai),
    waktuLabel: isSepanjangHari(row.waktuMulai, row.waktuSelesai) ? null : formatWaktuRange(row.waktuMulai, row.waktuSelesai),
    tempat: row.tempat,
    kategoriNama: row.kategoriNama,
    kategoriWarna: row.kategoriWarna,
    photo: toPhoto(row.fotoPath, row.fotoAlt),
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
    loadKegiatanMendatang(3),
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
    kontak: profil ? await toKontak(profil) : null,
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
  const kontak = await toKontak(result.data);
  return { data: { kontak, waLink: kontak?.telepon ? buildWaLink(kontak.telepon) : null }, error: null };
}

export type FooterContent = { sosialMedia: SosialMedia | null; alamat: string | null; waLink: string | null };

/**
 * The footer on every public page (docs/design/beranda.html): alamat, the
 * WhatsApp link, and social links from Profil Gereja. Each is null when
 * unset; a failed load hides them all rather than failing the page.
 */
export async function loadFooterContent(): Promise<FooterContent> {
  const { data } = await loadPublicProfil();
  if (!data) return { sosialMedia: null, alamat: null, waLink: null };
  const links = { instagram: data.instagram_url, youtube: data.youtube_url, facebook: data.facebook_url };
  return {
    sosialMedia: Object.values(links).some((value) => value !== null) ? links : null,
    alamat: data.alamat,
    waLink: data.telepon ? buildWaLink(data.telepon) : null,
  };
}

// ---------------------------------------------------------------------------
// Komisi (brief §14.8, stage 11d)
// ---------------------------------------------------------------------------

export type KomisiCardItem = { id: string; nama: string; slug: string; deskripsi: string | null; photo: PublicPhoto };

/** `/komisi`: a grid of cards (brief §14.8), tampil = true in the admin's own order. */
export async function loadKomisiListContent(): Promise<Result<KomisiCardItem[]>> {
  const result = await loadPublicKomisiList();
  if (!result.data) return { data: null, error: result.error };
  return {
    data: result.data.map((row) => ({
      id: row.id,
      nama: row.nama,
      slug: row.slug,
      deskripsi: row.deskripsi,
      photo: toPhoto(row.foto_path, row.foto_alt),
    })),
    error: null,
  };
}

export type KomisiDetailContent = {
  nama: string;
  deskripsi: string | null;
  periode: string | null;
  photo: PublicPhoto;
  pembinaNama: string | null;
  anggotaPerJabatan: { jabatan: string; anggota: string[] }[];
};

/**
 * `/komisi/[slug]`: members grouped by jabatan (brief §14.8). `public_komisi_detail`
 * (0032) already orders rows by jabatan sort_order then nama, so members sharing
 * a jabatan are already contiguous — grouping here just folds them, keeping that order.
 */
export async function loadKomisiDetailContent(slug: string): Promise<KomisiDetailContent | null> {
  const row = await loadPublicKomisi(slug);
  if (!row) return null;

  const anggotaPerJabatan: { jabatan: string; anggota: string[] }[] = [];
  for (const member of row.anggota) {
    const current = anggotaPerJabatan.at(-1);
    if (current && current.jabatan === member.jabatan) current.anggota.push(member.nama);
    else anggotaPerJabatan.push({ jabatan: member.jabatan, anggota: [member.nama] });
  }

  return {
    nama: row.nama,
    deskripsi: row.deskripsi,
    periode: row.periode,
    photo: toPhoto(row.foto_path, row.foto_alt),
    pembinaNama: row.pembinaNama,
    anggotaPerJabatan,
  };
}

// ---------------------------------------------------------------------------
// Kalender Kegiatan (brief §14.4, stage 11e)
// ---------------------------------------------------------------------------

export type KegiatanKalenderContent = {
  bulan: string;
  events: PublicKegiatanBulanRow[];
  /** Distinct categories appearing this month, for the legend — sorted by name. */
  legend: { nama: string; warna: string }[];
};

/** `/kegiatan?bulan=YYYY-MM`. `bulan` must already be validated (the page falls back to the current month, never passing an invalid one through). */
export async function loadKegiatanKalenderContent(bulan: string): Promise<Result<KegiatanKalenderContent>> {
  const result = await loadKegiatanBulan(bulan);
  if (!result.data) return { data: null, error: result.error };

  const byKategori = new Map<string, { nama: string; warna: string }>();
  for (const event of result.data) byKategori.set(event.kategoriId, { nama: event.kategoriNama, warna: event.kategoriWarna });
  const legend = [...byKategori.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  return { data: { bulan, events: result.data, legend }, error: null };
}

export type KegiatanDetailContent = {
  id: string;
  judul: string;
  slug: string;
  kategoriNama: string;
  kategoriWarna: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  tempat: string | null;
  mapsUrl: string | null;
  deskripsi: string | null;
  infoPendaftaran: string | null;
  photo: PublicPhoto;
  penyelenggaraKomisiNama: string | null;
  penyelenggaraKomisiSlug: string | null;
  icsHref: string;
  /** null when `SITE_URL` isn't configured — the share button is hidden rather than built from the request's Host (brief §14.4, D). */
  waShareHref: string | null;
};

/** `/kegiatan/[slug]` (brief §14.4): draft/unknown slug -> `null` (the page 404s). */
export async function loadKegiatanDetailContent(slug: string): Promise<KegiatanDetailContent | null> {
  const row = await loadKegiatanDetail(slug);
  if (!row) return null;

  const origin = siteOrigin();
  const waShareHref = origin
    ? buildShareWaLink(`${row.judul} — ${formatTanggalRange(row.tanggalMulai, row.tanggalSelesai)}\n${origin}/kegiatan/${row.slug}`)
    : null;

  return {
    id: row.id,
    judul: row.judul,
    slug: row.slug,
    kategoriNama: row.kategoriNama,
    kategoriWarna: row.kategoriWarna,
    tanggalMulai: row.tanggalMulai,
    tanggalSelesai: row.tanggalSelesai,
    waktuMulai: row.waktuMulai,
    waktuSelesai: row.waktuSelesai,
    tempat: row.tempat,
    mapsUrl: row.mapsUrl,
    deskripsi: row.deskripsi,
    infoPendaftaran: row.infoPendaftaran,
    photo: toPhoto(row.fotoPath, row.fotoAlt),
    penyelenggaraKomisiNama: row.penyelenggaraKomisiNama,
    penyelenggaraKomisiSlug: row.penyelenggaraKomisiSlug,
    icsHref: `/kegiatan/${row.slug}/ics`,
    waShareHref,
  };
}

/** The detail page's "Kegiatan lainnya": next 3 upcoming, excluding the current event. */
export async function loadKegiatanLainnya(excludeId: string, limit = 3): Promise<KegiatanItem[]> {
  const result = await loadKegiatanMendatang(limit, excludeId);
  return (result.data ?? []).map(toKegiatanItem);
}
