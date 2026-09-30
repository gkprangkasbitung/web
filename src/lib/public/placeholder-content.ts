import type { KegiatanItem, MajelisItem, PelayananItem } from "./site-content";

/**
 * Content the church hasn't supplied yet, for the modules that don't exist
 * until stage 11b (Pelayanan, Majelis, Kegiatan). Never invent church facts
 * (brief §12.4): every string here is a placeholder, not a guess. Profil
 * Gereja (stage 11a) is real data now and hides what's empty instead.
 *
 * The counts match `hint-placeholder-count` in the matching docs/design/*.html
 * mockup, so the layout looks complete (brief §9c instruction B) instead of
 * a single "being prepared" box per section. `site-content.ts` is the only
 * caller; when a real table lands, its loader function is replaced here and
 * nothing else in this file or its callers needs to change shape-wise beyond
 * that function's body.
 */

export function placeholderPelayanan(): PelayananItem[] {
  // TODO(konten): the church's regular ministries (§14.2), name + short description + schedule.
  const names = [
    "Sekolah Minggu",
    "Pemuda Remaja",
    "Persekutuan Perempuan",
    "Persekutuan Pria",
    "Lansia",
    "Pemahaman Alkitab",
  ];
  return names.map((nama, index) => ({
    id: `pelayanan-${index}`,
    nama,
    deskripsi: `TODO: deskripsi singkat pelayanan ${nama}.`,
    jadwal: null,
    icon: "HeartHandshake",
  }));
}

export function placeholderMajelis(): MajelisItem[] {
  // TODO(konten): the pastor and majelis, only with their consent to be listed publicly (§14.3).
  return [
    { id: "majelis-0", nama: "TODO: nama pendeta", jabatan: "Pendeta Jemaat", photo: null },
    { id: "majelis-1", nama: "TODO: nama", jabatan: "TODO: jabatan majelis", photo: null },
    { id: "majelis-2", nama: "TODO: nama", jabatan: "TODO: jabatan majelis", photo: null },
    { id: "majelis-3", nama: "TODO: nama", jabatan: "TODO: jabatan majelis", photo: null },
  ];
}

export function placeholderKegiatan(): KegiatanItem[] {
  // TODO(konten): the next published kegiatan (§14.4), newest 3 with tanggal >= today.
  return [0, 1, 2].map((index) => ({
    id: `kegiatan-${index}`,
    judul: "TODO: nama kegiatan",
    tanggal: "TODO",
    waktu: null,
    tempat: "TODO: tempat",
    photo: null,
  }));
}
