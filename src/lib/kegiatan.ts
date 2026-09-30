export type KegiatanStatus = "draft" | "published";

export const KEGIATAN_STATUS_LABELS: Record<KegiatanStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export type KegiatanRow = {
  id: string;
  judul: string;
  tanggal: string;
  waktu: string | null;
  tempat: string | null;
  deskripsi: string | null;
  foto_path: string | null;
  foto_alt: string | null;
  status: KegiatanStatus;
};

export const KEGIATAN_DELETE_DESCRIPTION = "Tindakan ini tidak bisa dibatalkan.";
