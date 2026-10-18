import { z } from "zod";

/**
 * The Warta DOCX tag contract (brief §16, docs/warta-template.md). Client-safe:
 * the schema and types are shared by the generator (server) and the preview
 * dialog (browser).
 *
 * The schema IS the contract: `WartaDocxViewModel` is inferred from it, the
 * generator validates every view model against it before rendering, and a
 * test walks it against the tags in templates/warta/warta.docx, both ways.
 * Every value is a string or boolean, never null: an empty field is "".
 */

const text = z.string();
const flag = z.boolean();

/** One Peribadahan row of PA, Lansia, Perempuan, Pria, or Pemuda Remaja: its own heading + table. */
const ibadahRow = z.strictObject({
  hari: text,
  tanggal: text,
  waktu: text,
  tempat: text,
  pf: text,
  liturgos: text,
  dpa: text,
  tema: text,
});

const kas = z.strictObject({
  saldo_awal_tanggal: text,
  saldo_awal: text,
  penerimaan: z.array(z.strictObject({ tanggal: text, keterangan: text, jumlah: text })),
  pengeluaran: z.array(z.strictObject({ tanggal: text, keterangan: text, jumlah: text })),
  total_penerimaan: text,
  total_pengeluaran: text,
  saldo_akhir_tanggal: text,
  saldo_akhir: text,
});

export const wartaDocxSchema = z.strictObject({
  informasi: z.strictObject({ hari: text, tanggal: text, judul: text, tema: text }),
  renungan: z.strictObject({ judul: text, ayat: text, kitab: text, isi: text, sumber: text }),
  gereja: z.strictObject({
    jadwal_rutin: z.array(z.strictObject({ nama: text, keterangan_waktu: text })),
    alamat: text,
    kontak: z.array(z.strictObject({ label: text, nilai: text })),
    pendeta: z.array(z.strictObject({ nama: text, no_hp: text })),
    rekening: z.strictObject({ tampil: flag, nama_bank: text, atas_nama: text, nomor_rekening: text }),
  }),
  peribadahan: z.strictObject({
    /** `umum` rows grouped by date. */
    kebaktian_minggu: z.array(
      z.strictObject({
        hari: text,
        tanggal: text,
        baris: z.array(z.strictObject({ waktu: text, tempat: text, pf: text, liturgos: text, keterangan: text })),
      }),
    ),
    petugas_pujian: z.strictObject({
      tampil: flag,
      baris: z.array(z.strictObject({ hari: text, tanggal: text, waktu: text, pnj: text, pemusik: text })),
    }),
    smka: z.array(
      z.strictObject({
        hari: text,
        tanggal: text,
        waktu: text,
        pf_batita: text,
        pf_balita: text,
        pf_kecil: text,
        pf_tanggung: text,
        pf_besar: text,
        pf_tunas_remaja: text,
        pelayan_liturgi: text,
        pemusik: text,
        bahan_alkitab: text,
        tema: text,
      }),
    ),
    /** KRT rows grouped by date + time; each row carries its own wilayah, DPA, and tema. */
    krt: z.array(
      z.strictObject({
        hari: text,
        tanggal: text,
        waktu: text,
        baris: z.array(
          z.strictObject({ wilayah: text, tempat: text, pf: text, liturgos: text, dpa: text, tema: text }),
        ),
      }),
    ),
    pemahaman_alkitab: z.array(ibadahRow),
    kebaktian_lansia: z.array(ibadahRow),
    kebaktian_perempuan: z.array(ibadahRow),
    kebaktian_pria: z.array(ibadahRow),
    doa_pagi: z.strictObject({
      tampil: flag,
      baris: z.array(z.strictObject({ hari: text, tanggal: text, waktu: text, tempat: text })),
    }),
    kebaktian_pemuda_remaja: z.array(ibadahRow),
  }),
  /** Word numbers the heading paragraph itself, so there is no `nomor` here. */
  litbang: z.array(z.strictObject({ nama: text, deskripsi: text })),
  sarana_dana: z.strictObject({
    kas_jemaat: kas,
    kas_sarana_prasarana: kas,
    /** Names only, two per row; never an amount (brief §16.2). */
    persembahan_bulanan: z.array(
      z.strictObject({ tanggal: text, no_kiri: text, nama_kiri: text, no_kanan: text, nama_kanan: text }),
    ),
  }),
  kesaksian: z.array(z.strictObject({ nomor: text, judul: text, deskripsi: text })),
  bacaan: z.strictObject({
    pukul: text,
    tata_kebaktian: text,
    nas_pembimbing: text,
    pembacaan_alkitab: text,
    pembacaan_mazmur: text,
    pujian: z.array(z.strictObject({ buku: text, nomor: text })),
  }),
  kehadiran: z.strictObject({
    tampil: flag,
    layanan: z.array(
      z.strictObject({
        judul: text,
        hari: text,
        tanggal: text,
        waktu: text,
        total: text,
        baris: z.array(z.strictObject({ label: text, rincian: text })),
      }),
    ),
  }),
});

export type WartaDocxViewModel = z.infer<typeof wartaDocxSchema>;

/** Editor sections a Kelengkapan item links to (`id`s set in `WartaEditor`). */
export const WARTA_EDITOR_SECTIONS = {
  informasi: "informasi",
  peribadahan: "peribadahan",
  litbang: "litbang",
  saranaDana: "sarana-dana",
  kesaksian: "kesaksian",
  bahanBacaan: "bahan-bacaan",
} as const;

/** One missing piece of data, linking to where it is filled in: `#section` in the editor or an admin page. */
export type KelengkapanItem = { pesan: string; href: string };

/** `GET /api/admin/warta/[id]/docx?mode=preview` → `{ data }`. */
export type WartaDocxPreview = {
  /** SHA-256 of the canonical view model + template version; sent back on download. */
  hash: string;
  /** When the preview was built (ISO timestamp), shown as "Dibuat pukul HH.mm". */
  dibuatPada: string;
  kelengkapan: KelengkapanItem[];
  /** The rendered .docx, base64. */
  docx: string;
};

export const WARTA_HASH_HEADER = "X-Warta-Hash";

export const WARTA_DOCX_STALE =
  "Data warta berubah sejak pratinjau dibuat. Muat ulang pratinjau.";

/** `warta-YYYY-MM-DD[-DRAFT].docx`, from the date, never from the raw judul (brief §16.3). */
export function wartaDocxFileName(tanggalKebaktian: string, status: string): string {
  return `warta-${tanggalKebaktian}${status === "draft" ? "-DRAFT" : ""}.docx`;
}
