import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicProfilRow } from "@/lib/public-site";
import type { PublicScheduleRow } from "@/lib/public-schedule";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://contoh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/public-site", () => ({
  loadJadwalPekanIni: vi.fn(),
  loadLatestPublicWarta: vi.fn(),
  loadPublicProfil: vi.fn(),
  loadPublicPelayanan: vi.fn(),
  loadPublicMajelis: vi.fn(),
  loadPublicKegiatanMendatang: vi.fn(),
  loadPublicPendeta: vi.fn(),
}));

const {
  loadJadwalPekanIni,
  loadLatestPublicWarta,
  loadPublicProfil,
  loadPublicPelayanan,
  loadPublicMajelis,
  loadPublicKegiatanMendatang,
  loadPublicPendeta,
} = await import("@/lib/public-site");
const { kebaktianMingguTimes, loadBerandaContent, loadKontakContent, loadSosialMedia, loadTentangKamiContent } =
  await import("./site-content");

const EMPTY: PublicProfilRow = {
  hero_judul: null,
  hero_subjudul: null,
  hero_foto_path: null,
  hero_foto_alt: null,
  sambutan_teks: null,
  sambutan_pendeta_nama: null,
  sambutan_pendeta_peran: null,
  sambutan_pendeta_foto_path: null,
  sambutan_pendeta_foto_alt: null,
  sejarah: null,
  visi: null,
  misi: [],
  sejarah_foto_path: null,
  sejarah_foto_alt: null,
  alamat: null,
  telepon: null,
  email: null,
  jam_sekretariat: null,
  maps_url: null,
  instagram_url: null,
  youtube_url: null,
  facebook_url: null,
  nama_bank: null,
  nomor_rekening: null,
  atas_nama: null,
  qris_foto_path: null,
  qris_foto_alt: null,
  linimasa: [],
};

const PHOTO = "profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg";

function row(overrides: Partial<PublicScheduleRow>): PublicScheduleRow {
  return {
    id: "r",
    tanggal: "2026-10-04",
    jam: null,
    categoryKey: "umum",
    categoryName: "Kebaktian Minggu",
    tempatNama: null,
    wilayahNama: null,
    dpa: null,
    tema: null,
    pelayanFirmanNama: null,
    liturgosNama: null,
    pemusikNama: null,
    bahanAlkitab: null,
    kehadiranLakiLaki: null,
    kehadiranPerempuan: null,
    kehadiranAnak: null,
    catatan: null,
    smkaKelompok: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(loadJadwalPekanIni).mockResolvedValue({ data: [], error: null });
  vi.mocked(loadLatestPublicWarta).mockResolvedValue({ data: null, error: null });
  vi.mocked(loadPublicProfil).mockResolvedValue({ data: EMPTY, error: null });
  vi.mocked(loadPublicPelayanan).mockResolvedValue({ data: [], error: null });
  vi.mocked(loadPublicMajelis).mockResolvedValue({ data: [], error: null });
  vi.mocked(loadPublicKegiatanMendatang).mockResolvedValue({ data: [], error: null });
  vi.mocked(loadPublicPendeta).mockResolvedValue({ data: [], error: null });
});

describe("kebaktianMingguTimes", () => {
  it("lists this week's Kebaktian Minggu times, distinct and in order", () => {
    expect(
      kebaktianMingguTimes([
        row({ jam: "09:30:00" }),
        row({ jam: "07:00:00" }),
        row({ jam: "07:00:00" }),
        row({ jam: "18:00:00", categoryKey: "krt" }),
        row({ jam: null }),
      ]),
    ).toBe("07.00 & 09.30 WIB");
    expect(kebaktianMingguTimes([row({ categoryKey: "pa", jam: "19:00:00" })])).toBeNull();
  });
});

describe("empty Profil Gereja fields hide their sections (brief §14.6)", () => {
  it("Beranda: default hero title, no subtitle/photo/sambutan/kontak/rekening", async () => {
    const content = await loadBerandaContent();
    expect(content).toMatchObject({
      heroTitle: "GKP Rangkasbitung",
      heroSubtitle: null,
      heroPhoto: null,
      kebaktianMinggu: null,
      sambutan: null,
      kontak: null,
      rekening: null,
    });
  });

  it("Beranda: filled fields come through, photos as public bucket URLs", async () => {
    vi.mocked(loadPublicProfil).mockResolvedValue({
      data: {
        ...EMPTY,
        hero_judul: "Judul",
        hero_foto_path: PHOTO,
        hero_foto_alt: "Gedung",
        sambutan_teks: "Sambutan",
        alamat: "Alamat",
        nama_bank: "Bank",
        nomor_rekening: "123",
        atas_nama: "Nama",
      },
      error: null,
    });
    const content = await loadBerandaContent();
    expect(content.heroTitle).toBe("Judul");
    expect(content.heroPhoto).toEqual({
      url: `https://contoh.supabase.co/storage/v1/object/public/situs/${PHOTO}`,
      alt: "Gedung",
    });
    expect(content.sambutan).toEqual({ teks: "Sambutan", nama: null, jabatan: null, photo: null });
    expect(content.kontak?.alamat).toBe("Alamat");
    expect(content.rekening).toEqual({ namaBank: "Bank", nomorRekening: "123", atasNama: "Nama", qris: null });
  });

  it("a photo path the server wouldn't generate is never turned into a URL", async () => {
    vi.mocked(loadPublicProfil).mockResolvedValue({
      data: { ...EMPTY, hero_foto_path: "../../rahasia.jpg", hero_foto_alt: "x" },
      error: null,
    });
    expect((await loadBerandaContent()).heroPhoto).toBeNull();
  });

  it("Kontak: no fields → kontak null and no WhatsApp link; a number → a wa.me link", async () => {
    expect(await loadKontakContent()).toEqual({ data: { kontak: null, waLink: null }, error: null });

    vi.mocked(loadPublicProfil).mockResolvedValue({ data: { ...EMPTY, telepon: "081234567890" }, error: null });
    const content = await loadKontakContent();
    expect(content.data?.waLink).toBe("https://wa.me/6281234567890");
  });

  it("footer: no social links → null; a failed load → null, not an error", async () => {
    expect(await loadSosialMedia()).toBeNull();
    vi.mocked(loadPublicProfil).mockResolvedValue({ data: null, error: "profil gereja" });
    expect(await loadSosialMedia()).toBeNull();
    const tentang = await loadTentangKamiContent();
    expect(tentang.profil.error).toBe("profil gereja");
  });
});

describe("Pelayanan, Majelis, Kegiatan (brief §14.2-14.4)", () => {
  it("Beranda: pelayanan and kegiatan rows are mapped, kegiatan waktu/tanggal formatted", async () => {
    vi.mocked(loadPublicPelayanan).mockResolvedValue({
      data: [{ id: "p1", nama: "Sekolah Minggu", deskripsi: null, jadwal: null, icon: "Baby" }],
      error: null,
    });
    vi.mocked(loadPublicKegiatanMendatang).mockResolvedValue({
      data: [
        {
          id: "k1",
          judul: "Retret Pemuda",
          tanggal: "2026-10-04",
          waktu: "09:00:00",
          tempat: "Aula",
          foto_path: PHOTO,
          foto_alt: "Retret",
        },
      ],
      error: null,
    });

    const content = await loadBerandaContent();
    expect(content.pelayanan).toEqual([{ id: "p1", nama: "Sekolah Minggu", deskripsi: null, jadwal: null, icon: "Baby" }]);
    expect(content.kegiatan).toEqual([
      {
        id: "k1",
        judul: "Retret Pemuda",
        tanggal: expect.stringContaining("2026"),
        waktu: "09.00",
        tempat: "Aula",
        photo: { url: `https://contoh.supabase.co/storage/v1/object/public/situs/${PHOTO}`, alt: "Retret" },
      },
    ]);
  });

  it("a failed Pelayanan/Kegiatan load falls back to an empty list, not an error", async () => {
    vi.mocked(loadPublicPelayanan).mockResolvedValue({ data: null, error: "pelayanan" });
    vi.mocked(loadPublicKegiatanMendatang).mockResolvedValue({ data: null, error: "kegiatan" });
    const content = await loadBerandaContent();
    expect(content.pelayanan).toEqual([]);
    expect(content.kegiatan).toEqual([]);
  });

  it("Tentang Kami: majelis rows are mapped, photo hidden without alt text", async () => {
    vi.mocked(loadPublicMajelis).mockResolvedValue({
      data: [{ id: "m1", nama: "Pdt. Contoh", jabatan: "Pendeta Jemaat", foto_path: PHOTO, foto_alt: null }],
      error: null,
    });
    const tentang = await loadTentangKamiContent();
    expect(tentang.majelis).toEqual([{ id: "m1", nama: "Pdt. Contoh", jabatan: "Pendeta Jemaat", photo: null }]);
  });
});

describe("Pendeta (brief §14.7)", () => {
  it("Tentang Kami: splits currently-serving from past pastors, keeping public_pendeta()'s order", async () => {
    vi.mocked(loadPublicPendeta).mockResolvedValue({
      data: [
        { id: "d1", nama: "Pdt. Satu", peran: "Pendeta Jemaat", tahun_mulai: 2019, tahun_selesai: null, foto_path: null, foto_alt: null, keterangan: null },
        { id: "d2", nama: "Pdt. Dua", peran: "Pendeta Jemaat", tahun_mulai: 2010, tahun_selesai: 2019, foto_path: null, foto_alt: null, keterangan: null },
      ],
      error: null,
    });
    const tentang = await loadTentangKamiContent();
    expect(tentang.pendetaMelayani).toEqual([
      { id: "d1", nama: "Pdt. Satu", peran: "Pendeta Jemaat", tahunMulai: 2019, tahunSelesai: null, keterangan: null, photo: null },
    ]);
    expect(tentang.pendetaPernahMelayani).toEqual([
      { id: "d2", nama: "Pdt. Dua", peran: "Pendeta Jemaat", tahunMulai: 2010, tahunSelesai: 2019, keterangan: null, photo: null },
    ]);
  });

  it("Beranda: Sambutan reads nama/peran/foto from the picked pendeta", async () => {
    vi.mocked(loadPublicProfil).mockResolvedValue({
      data: {
        ...EMPTY,
        sambutan_teks: "Selamat datang",
        sambutan_pendeta_nama: "Pdt. Satu",
        sambutan_pendeta_peran: "Pendeta Jemaat",
      },
      error: null,
    });
    const content = await loadBerandaContent();
    expect(content.sambutan).toEqual({ teks: "Selamat datang", nama: "Pdt. Satu", jabatan: "Pendeta Jemaat", photo: null });
  });
});
