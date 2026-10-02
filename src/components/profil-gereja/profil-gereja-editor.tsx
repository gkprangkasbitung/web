"use client";

import type { SavedPhoto } from "@/components/shared/photo-field";
import { SOCIAL_PLATFORMS, type ProfilGerejaAdminData, type ProfilGerejaRow, type RekeningRow } from "@/lib/profil-gereja";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { LinimasaSection } from "./linimasa-section";
import { ProfilFormSection, type FieldConfig, type FormValues } from "./profil-form-section";
import { SambutanSection } from "./sambutan-section";

export type ProfilGerejaAccess = {
  /** situs:update: every section except Persembahan, and editing/reordering Linimasa. */
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
  /** situs_rekening:update: Persembahan. */
  canEditRekening: boolean;
};

const READ_ONLY = "Kamu hanya bisa melihat bagian ini.";

function photo(path: string | null, alt: string | null): SavedPhoto {
  return path && alt ? { url: situsPhotoUrl(path), alt } : null;
}

const text = (value: string | null) => value ?? "";

// ---------------------------------------------------------------------------
// Field layouts per section (brief §14.1)
// ---------------------------------------------------------------------------

const BERANDA_FIELDS: FieldConfig[] = [
  { key: "heroJudul", label: "Judul hero", kind: "text", maxLength: 120, help: "Kosongkan untuk memakai nama gereja." },
  { key: "heroSubjudul", label: "Subjudul hero", kind: "textarea", maxLength: 300, rows: 2 },
];
const berandaValues = (row: ProfilGerejaRow): FormValues => ({
  heroJudul: text(row.hero_judul),
  heroSubjudul: text(row.hero_subjudul),
});

const TENTANG_FIELDS: FieldConfig[] = [
  { key: "sejarah", label: "Sejarah", kind: "textarea", maxLength: 10000, rows: 8 },
  { key: "visi", label: "Visi", kind: "textarea", maxLength: 1000, rows: 3 },
  {
    key: "misi",
    label: "Misi",
    kind: "textarea",
    maxLength: 10000,
    rows: 5,
    help: "Satu misi per baris, sesuai urutan. Baris kosong diabaikan.",
  },
];
const tentangValues = (row: ProfilGerejaRow): FormValues => ({
  sejarah: text(row.sejarah),
  visi: text(row.visi),
  misi: row.misi.join("\n"),
});

const KONTAK_FIELDS: FieldConfig[] = [
  { key: "alamat", label: "Alamat", kind: "textarea", maxLength: 500, rows: 2 },
  {
    key: "telepon",
    label: "Telepon / WhatsApp",
    kind: "phone",
    maxLength: 15,
    placeholder: "Mis. 081234567890",
    help: "Angka saja. Dipakai juga untuk tombol chat WhatsApp.",
  },
  { key: "email", label: "Email", kind: "email", maxLength: 254 },
  { key: "jamSekretariat", label: "Jam sekretariat", kind: "text", maxLength: 200, placeholder: "Mis. Senin–Jumat, 09.00–15.00 WIB" },
  {
    key: "mapsUrl",
    label: "URL Google Maps",
    kind: "url",
    maxLength: 2000,
    help: "Salin dari tombol Bagikan di Google Maps: https://maps.app.goo.gl/… atau https://www.google.com/maps/…",
  },
];
const kontakValues = (row: ProfilGerejaRow): FormValues => ({
  alamat: text(row.alamat),
  telepon: text(row.telepon),
  email: text(row.email),
  jamSekretariat: text(row.jam_sekretariat),
  mapsUrl: text(row.maps_url),
});

const SOSIAL_FIELDS: FieldConfig[] = (["instagram", "youtube", "facebook"] as const).map((platform) => ({
  key: `${platform}Url`,
  label: SOCIAL_PLATFORMS[platform].label,
  kind: "url" as const,
  maxLength: 500,
  placeholder: SOCIAL_PLATFORMS[platform].example,
}));
const sosialValues = (row: ProfilGerejaRow): FormValues => ({
  instagramUrl: text(row.instagram_url),
  youtubeUrl: text(row.youtube_url),
  facebookUrl: text(row.facebook_url),
});

const PERSEMBAHAN_FIELDS: FieldConfig[] = [
  { key: "namaBank", label: "Nama bank", kind: "text", maxLength: 100 },
  { key: "nomorRekening", label: "Nomor rekening", kind: "text", maxLength: 40, help: "Angka, boleh dipisah spasi atau tanda hubung." },
  { key: "atasNama", label: "Atas nama", kind: "text", maxLength: 150 },
];
type RekeningValuesRow = Pick<RekeningRow, "nama_bank" | "nomor_rekening" | "atas_nama" | "qris_foto_path" | "qris_foto_alt">;
const persembahanValues = (row: RekeningValuesRow): FormValues => ({
  namaBank: text(row.nama_bank),
  nomorRekening: text(row.nomor_rekening),
  atasNama: text(row.atas_nama),
});

function validateRekening(values: FormValues): string | null {
  const filled = [values.namaBank, values.nomorRekening, values.atasNama].filter((value) => value?.trim()).length;
  return filled === 0 || filled === 3
    ? null
    : "Isi nama bank, nomor rekening, dan atas nama sekaligus, atau kosongkan ketiganya.";
}

/** `/admin/profil-gereja` (brief §14.1): one form per section, each with its own "Simpan". */
export function ProfilGerejaEditor({ data, access }: { data: ProfilGerejaAdminData; access: ProfilGerejaAccess }) {
  const { profil, rekening } = data;
  const readOnlyNote = access.canUpdate ? undefined : READ_ONLY;

  return (
    <div className="flex flex-col gap-6">
      <ProfilFormSection<ProfilGerejaRow>
        title="Beranda"
        description="Bagian pembuka di halaman utama situs."
        endpoint="/api/admin/profil-gereja/beranda"
        fields={BERANDA_FIELDS}
        initialValues={berandaValues(profil)}
        photo={{ label: "Foto hero", saved: photo(profil.hero_foto_path, profil.hero_foto_alt), altHint: "Gedung gereja tampak depan" }}
        canWrite={access.canUpdate}
        readOnlyNote={readOnlyNote}
        successMessage="Bagian Beranda disimpan"
        fromResponse={(row) => ({ values: berandaValues(row), photo: photo(row.hero_foto_path, row.hero_foto_alt) })}
      />

      <SambutanSection profil={profil} pendeta={data.pendeta} canWrite={access.canUpdate} />

      <ProfilFormSection<ProfilGerejaRow>
        title="Tentang"
        description="Sejarah, visi, dan misi di halaman Tentang Kami."
        endpoint="/api/admin/profil-gereja/tentang"
        fields={TENTANG_FIELDS}
        initialValues={tentangValues(profil)}
        photo={{ label: "Foto sejarah", saved: photo(profil.sejarah_foto_path, profil.sejarah_foto_alt), altHint: "Gedung gereja pada masa awal" }}
        canWrite={access.canUpdate}
        readOnlyNote={readOnlyNote}
        successMessage="Bagian Tentang disimpan"
        fromResponse={(row) => ({ values: tentangValues(row), photo: photo(row.sejarah_foto_path, row.sejarah_foto_alt) })}
      />

      <LinimasaSection
        items={data.linimasa}
        access={{ canCreate: access.canCreate, canUpdate: access.canUpdate, canDelete: access.canDelete }}
      />

      <ProfilFormSection<ProfilGerejaRow>
        title="Kontak"
        description="Alamat dan kontak sekretariat di halaman Kontak dan Beranda."
        endpoint="/api/admin/profil-gereja/kontak"
        fields={KONTAK_FIELDS}
        initialValues={kontakValues(profil)}
        canWrite={access.canUpdate}
        readOnlyNote={readOnlyNote}
        successMessage="Bagian Kontak disimpan"
        fromResponse={(row) => ({ values: kontakValues(row) })}
      />

      <ProfilFormSection<ProfilGerejaRow>
        title="Sosial Media"
        description="Tautan di bagian bawah setiap halaman situs. Hanya alamat https dari platform masing-masing."
        endpoint="/api/admin/profil-gereja/sosial-media"
        fields={SOSIAL_FIELDS}
        initialValues={sosialValues(profil)}
        canWrite={access.canUpdate}
        readOnlyNote={readOnlyNote}
        successMessage="Bagian Sosial Media disimpan"
        fromResponse={(row) => ({ values: sosialValues(row) })}
      />

      <ProfilFormSection<RekeningValuesRow>
        title="Persembahan"
        description="Rekening resmi gereja untuk persembahan, tampil di halaman utama. Setiap perubahan dicatat di Log Aktivitas beserta nilai lama dan barunya."
        endpoint="/api/admin/profil-gereja/persembahan"
        fields={PERSEMBAHAN_FIELDS}
        initialValues={persembahanValues(rekening)}
        photo={{
          label: "Gambar QRIS (opsional)",
          saved: photo(rekening.qris_foto_path, rekening.qris_foto_alt),
          altHint: "Kode QRIS persembahan GKP Rangkasbitung",
          // Uploading or removing the file also needs situs:update (§14.5).
          locked: !access.canUpdate,
        }}
        canWrite={access.canEditRekening}
        readOnlyNote="Hanya pengguna dengan izin situs_rekening:update yang bisa mengubah rekening."
        successMessage="Bagian Persembahan disimpan"
        validate={validateRekening}
        fromResponse={(row) => ({ values: persembahanValues(row), photo: photo(row.qris_foto_path, row.qris_foto_alt) })}
      />
    </div>
  );
}
