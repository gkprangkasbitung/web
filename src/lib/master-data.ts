/**
 * Tempat, Wilayah, and Label Jemaat share one shape (brief §9.8). Plain data
 * only, so a config can be passed from a Server Component to the client table.
 */

export type MasterDataRow = {
  id: string;
  nama: string;
  keterangan: string | null;
  sort_order: number;
};

export type MasterDataField = {
  name: "nama" | "keterangan";
  label: string;
  required: boolean;
  placeholder?: string;
  maxLength: number;
};

export type MasterDataConfig = {
  table: "tempat" | "wilayah" | "label_jemaat";
  module: "tempat" | "wilayah" | "label_jemaat";
  apiPath: string;
  pagePath: string;
  title: string;
  description: string;
  /** Pagination and empty states: "{from}–{to} dari {total} tempat", "Belum ada tempat." */
  noun: string;
  /** Activity sentences: Menambah label jemaat "Pendeta". */
  logNoun: string;
  /** Delete dialog: Hapus label "Pendeta"? */
  dialogNoun: string;
  /** Toasts: "Tempat ditambahkan". */
  entityLabel: string;
  addLabel: string;
  fields: readonly MasterDataField[];
  /** The consequence stated in the delete confirmation. */
  deleteConsequence: string;
  notFound: string;
  /** Set when `nama` must be unique; compared case-insensitively. */
  uniqueNamaMessage?: string;
  /** Pages that show this data; the list page itself is always included. */
  revalidateLayouts: readonly string[];
};

const NAMA_MAX = 120;
const KETERANGAN_MAX = 500;
const IRREVERSIBLE = "Tindakan ini tidak bisa dibatalkan.";

export const TEMPAT: MasterDataConfig = {
  table: "tempat",
  module: "tempat",
  apiPath: "/api/admin/tempat",
  pagePath: "/admin/tempat",
  title: "Tempat",
  description: "Daftar tempat yang bisa dipilih di jadwal Peribadahan.",
  noun: "tempat",
  logNoun: "tempat",
  dialogNoun: "tempat",
  entityLabel: "Tempat",
  addLabel: "Tambah Tempat",
  fields: [
    { name: "nama", label: "Nama", required: true, maxLength: NAMA_MAX },
    { name: "keterangan", label: "Keterangan", required: false, placeholder: "Alamat/keterangan", maxLength: KETERANGAN_MAX },
  ],
  deleteConsequence: `Jadwal peribadahan yang memakai tempat ini akan dikosongkan tempatnya. ${IRREVERSIBLE}`,
  notFound: "Tempat tidak ditemukan.",
  revalidateLayouts: ["/admin/peribadahan", "/admin/warta"],
};

export const WILAYAH: MasterDataConfig = {
  table: "wilayah",
  module: "wilayah",
  apiPath: "/api/admin/wilayah",
  pagePath: "/admin/wilayah",
  title: "Wilayah",
  description: "Daftar wilayah untuk Kebaktian Rumah Tangga dan data jemaat.",
  noun: "wilayah",
  logNoun: "wilayah",
  dialogNoun: "wilayah",
  entityLabel: "Wilayah",
  addLabel: "Tambah Wilayah",
  fields: [{ name: "nama", label: "Nama", required: true, maxLength: NAMA_MAX }],
  deleteConsequence: `Jadwal peribadahan dan jemaat di wilayah ini akan dikosongkan wilayahnya. ${IRREVERSIBLE}`,
  notFound: "Wilayah tidak ditemukan.",
  revalidateLayouts: ["/admin/peribadahan", "/admin/warta", "/admin/jemaat", "/admin/keluarga"],
};

export const LABEL_JEMAAT: MasterDataConfig = {
  table: "label_jemaat",
  module: "label_jemaat",
  apiPath: "/api/admin/label-jemaat",
  pagePath: "/admin/label-jemaat",
  title: "Label Jemaat",
  description: "Label untuk jemaat, dipakai juga untuk mencari orang di pilihan petugas.",
  noun: "label",
  logNoun: "label jemaat",
  dialogNoun: "label",
  entityLabel: "Label",
  addLabel: "Tambah Label",
  fields: [{ name: "nama", label: "Nama Label", required: true, placeholder: "Mis. Pendeta", maxLength: NAMA_MAX }],
  deleteConsequence: `Label ini akan dilepas dari semua jemaat yang memakainya. ${IRREVERSIBLE}`,
  notFound: "Label tidak ditemukan.",
  uniqueNamaMessage: "Nama label sudah digunakan.",
  revalidateLayouts: ["/admin/jemaat", "/admin/peribadahan", "/admin/warta"],
};

export function fieldRequiredMessage(field: MasterDataField): string {
  return `${field.label} wajib diisi.`;
}
