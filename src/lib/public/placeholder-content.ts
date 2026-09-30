import type { KegiatanItem, KontakInfo, MajelisItem, PelayananItem, RekeningInfo } from "./site-content";

/**
 * Content the church hasn't supplied yet, for the modules that don't exist
 * until stage 11a (Profil Gereja) / 11b (Pelayanan, Majelis, Kegiatan) / 14
 * (photo uploads, Persembahan). Never invent church facts (brief §12.4):
 * every string here is a placeholder, not a guess.
 *
 * The counts match `hint-placeholder-count` in the matching docs/design/*.html
 * mockup, so the layout looks complete (brief §9c instruction B) instead of
 * a single "being prepared" box per section. `site-content.ts` is the only
 * caller; when a real table lands, its loader function is replaced here and
 * nothing else in this file or its callers needs to change shape-wise beyond
 * that function's body.
 */

export function placeholderHero() {
  return {
    heroTitle: "Mari beribadah bersama kami",
    // TODO(konten): a short welcome line or motto from the church. Don't invent one.
    heroSubtitle: "TODO: kalimat sambutan singkat untuk beranda.",
    heroPhoto: null,
  };
}

export function placeholderSambutan() {
  return {
    // TODO(konten): a welcome message from the pastor or majelis, 3-4 sentences.
    text: "TODO: sambutan singkat dari pendeta jemaat, 3–4 kalimat.",
    pastorName: "TODO: nama pendeta jemaat",
    pastorTitle: "Pendeta Jemaat",
    photo: null,
  };
}

export function placeholderSejarah() {
  return {
    // TODO(konten): the congregation's history (founding, milestones), 1-2 paragraphs.
    title: "TODO: judul singkat tentang perjalanan jemaat",
    text: "TODO: sejarah singkat jemaat, 1–2 paragraf.",
    photo: null,
  };
}

export function placeholderVisi(): string {
  // TODO(konten): the official vision statement.
  return "TODO: rumusan visi jemaat.";
}

export function placeholderMisi(): string[] {
  // TODO(konten): the official mission statements, in order.
  return ["TODO: misi pertama.", "TODO: misi kedua.", "TODO: misi ketiga."];
}

export function placeholderLinimasa(): { tahun: string; teks: string }[] {
  // TODO(konten): the congregation's timeline (year + short event), 4 milestones.
  return [
    { tahun: "TODO", teks: "TODO: peristiwa penting, mis. awal persekutuan." },
    { tahun: "TODO", teks: "TODO: peristiwa penting, mis. pendewasaan jemaat." },
    { tahun: "TODO", teks: "TODO: peristiwa penting, mis. pembangunan gedung." },
    { tahun: "TODO", teks: "TODO: peristiwa penting terbaru." },
  ];
}

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

export function placeholderKontak(): KontakInfo {
  // TODO(konten): the church's address, secretariat phone/WhatsApp, email, and office hours (§14.1 Kontak).
  return { alamat: null, telepon: null, email: null, jamSekretariat: null, mapsUrl: null };
}

export function placeholderRekening(): RekeningInfo | null {
  // TODO(konten): bank account details for offerings (§14.1 Persembahan), supplied by the church.
  return null;
}
