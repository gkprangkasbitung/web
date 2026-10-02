import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError, type RevalidateTarget } from "@/lib/api-mutation";
import { can } from "@/lib/auth/permissions";
import { loadPendetaList } from "@/lib/pendeta-routes";
import {
  mapsUrlField,
  misiField,
  nomorRekeningField,
  socialUrlField,
  teleponField,
  type LinimasaRow,
  type ProfilGerejaAdminData,
  type ProfilGerejaRow,
} from "@/lib/profil-gereja";
import {
  PHOTO_FORM_MULTIPART,
  savePhotoSlot,
  withPhotoSlot,
  type PhotoChange,
  type PhotoSlotInput,
  type StoredPhoto,
} from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";
import type { Database } from "@/types/database";

type ProfilUpdate = Database["public"]["Tables"]["profil_gereja"]["Update"];

const SINGLETON_ID = 1;
const LINIMASA_NOT_FOUND = "Linimasa tidak ditemukan.";

/**
 * The admin page, plus every public page: Beranda, Tentang Kami, and Kontak
 * read this data, and the footer (on every public page) shows the social
 * links (brief §14.6). The public pages render per request, so this mostly
 * refreshes router caches, but it keeps the rule in one place.
 */
const REVALIDATE: readonly RevalidateTarget[] = ["/admin/profil-gereja", { path: "/", type: "layout" }];

/** `/admin/profil-gereja`: both singletons and the timeline, in order. */
export async function loadProfilGerejaAdmin(
  supabase: ServerSupabase,
): Promise<{ data: ProfilGerejaAdminData; error: null } | { data: null; error: unknown }> {
  const [profil, rekening, linimasa, pendeta] = await Promise.all([
    supabase.from("profil_gereja").select("*").eq("id", SINGLETON_ID).maybeSingle(),
    supabase.from("profil_gereja_rekening").select("*").eq("id", SINGLETON_ID).maybeSingle(),
    loadLinimasa(supabase),
    loadPendetaList(supabase),
  ]);
  const error = profil.error ?? rekening.error ?? linimasa.error ?? pendeta.error;
  if (error || !profil.data || !rekening.data || !linimasa.data || !pendeta.data) {
    return { data: null, error: error ?? "profil_gereja row missing" };
  }
  return {
    data: { profil: profil.data, rekening: rekening.data, linimasa: linimasa.data, pendeta: pendeta.data },
    error: null,
  };
}

function loadLinimasa(supabase: ServerSupabase) {
  return supabase
    .from("profil_gereja_linimasa")
    .select("id, tahun, teks, sort_order")
    .order("sort_order")
    .order("created_at")
    .order("id");
}

const PHOTO_CHANGE_SUFFIX: Record<PhotoChange, string> = {
  none: "",
  alt: " (teks alternatif foto diubah)",
  added: " (foto ditambahkan)",
  replaced: " (foto diganti)",
  removed: " (foto dihapus)",
};

function storedPhoto(path: string | null, alt: string | null): StoredPhoto | null {
  return path && alt ? { path, alt } : null;
}

async function currentProfil(supabase: ServerSupabase): Promise<ProfilGerejaRow> {
  const { data, error } = await supabase.from("profil_gereja").select("*").eq("id", SINGLETON_ID).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "Profil gereja tidak ditemukan.");
  return data;
}

async function updateProfil(
  supabase: ServerSupabase,
  fields: ProfilUpdate,
  messages: Parameters<typeof dbError>[1] = {},
): Promise<ProfilGerejaRow> {
  const { data, error } = await supabase
    .from("profil_gereja")
    .update(fields)
    .eq("id", SINGLETON_ID)
    .select("*")
    .maybeSingle();
  if (error) throw dbError(error, messages);
  // RLS hides the row from a user without situs:update: nothing was written.
  if (!data) throw new ApiError(403, "Kamu tidak punya akses untuk tindakan ini.");
  return data;
}

type PhotoColumns = {
  path: "hero_foto_path" | "sejarah_foto_path";
  alt: "hero_foto_alt" | "sejarah_foto_alt";
};

/**
 * One Profil Gereja section with a photo (Beranda, Sambutan, Tentang): a
 * multipart PATCH that saves its text fields and its photo in one request.
 */
function photoSection<S extends z.ZodType<{ foto: PhotoSlotInput }>>(config: {
  label: string;
  schema: S;
  columns: PhotoColumns;
  toFields: (input: z.infer<S>) => ProfilUpdate;
}) {
  return mutation({
    permission: ["situs", "update"],
    multipart: PHOTO_FORM_MULTIPART,
    schema: config.schema,
    async run({ input, supabase }) {
      const current = await currentProfil(supabase);
      const { result, change } = await savePhotoSlot({
        supabase,
        folder: "profil",
        slot: input.foto,
        current: storedPhoto(current[config.columns.path], current[config.columns.alt]),
        write: (photo) =>
          updateProfil(supabase, {
            ...config.toFields(input as z.infer<S>),
            [config.columns.path]: photo?.path ?? null,
            [config.columns.alt]: photo?.alt ?? null,
          }),
      });

      return {
        data: result,
        log: { module: "situs", activity: `Mengubah profil gereja bagian ${config.label}${PHOTO_CHANGE_SUFFIX[change]}` },
        revalidate: REVALIDATE,
      };
    },
  });
}

/** PATCH /api/admin/profil-gereja/beranda: hero title, subtitle, photo. */
export const updateBeranda = photoSection({
  label: "Beranda",
  schema: withPhotoSlot({ heroJudul: optionalText(120), heroSubjudul: optionalText(300) }),
  columns: { path: "hero_foto_path", alt: "hero_foto_alt" },
  toFields: (input) => ({ hero_judul: input.heroJudul, hero_subjudul: input.heroSubjudul }),
});

const sambutanSchema = z.object({
  sambutanTeks: optionalText(2000),
  // Picked from the pendeta table (brief §14.7), not typed in here anymore.
  pendetaId: z.uuid().nullish().transform((value) => value ?? null),
});

/** PATCH /api/admin/profil-gereja/sambutan (JSON): text, and the picked pendeta. */
export const updateSambutan = mutation({
  permission: ["situs", "update"],
  schema: sambutanSchema,
  async run({ input, supabase }) {
    const data = await updateProfil(
      supabase,
      { sambutan_teks: input.sambutanTeks, sambutan_pendeta_id: input.pendetaId },
      { inUse: "Pendeta yang dipilih tidak ditemukan." },
    );
    return {
      data,
      log: { module: "situs", activity: "Mengubah profil gereja bagian Sambutan" },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/profil-gereja/tentang: sejarah, visi, misi (one per line), photo. */
export const updateTentang = photoSection({
  label: "Tentang",
  schema: withPhotoSlot({ sejarah: optionalText(10000), visi: optionalText(1000), misi: misiField }),
  columns: { path: "sejarah_foto_path", alt: "sejarah_foto_alt" },
  toFields: (input) => ({ sejarah: input.sejarah, visi: input.visi, misi: input.misi }),
});

const kontakSchema = z.object({
  alamat: optionalText(500),
  telepon: teleponField,
  email: z
    .string({ error: "Data yang dikirim tidak valid." })
    .trim()
    .nullish()
    .transform((value) => value || null)
    .pipe(z.email("Alamat email tidak valid.").max(254, "Maksimal 254 karakter.").nullable()),
  jamSekretariat: optionalText(200),
  mapsUrl: mapsUrlField,
});

/** PATCH /api/admin/profil-gereja/kontak (JSON). */
export const updateKontak = mutation({
  permission: ["situs", "update"],
  schema: kontakSchema,
  async run({ input, supabase }) {
    const data = await updateProfil(supabase, {
      alamat: input.alamat,
      telepon: input.telepon,
      email: input.email,
      jam_sekretariat: input.jamSekretariat,
      maps_url: input.mapsUrl,
    });
    return {
      data,
      log: { module: "situs", activity: "Mengubah profil gereja bagian Kontak" },
      revalidate: REVALIDATE,
    };
  },
});

const sosialMediaSchema = z.object({
  instagramUrl: socialUrlField("instagram"),
  youtubeUrl: socialUrlField("youtube"),
  facebookUrl: socialUrlField("facebook"),
});

/** PATCH /api/admin/profil-gereja/sosial-media (JSON). */
export const updateSosialMedia = mutation({
  permission: ["situs", "update"],
  schema: sosialMediaSchema,
  async run({ input, supabase }) {
    const data = await updateProfil(supabase, {
      instagram_url: input.instagramUrl,
      youtube_url: input.youtubeUrl,
      facebook_url: input.facebookUrl,
    });
    return {
      data,
      log: { module: "situs", activity: "Mengubah profil gereja bagian Sosial Media" },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Persembahan (situs_rekening:update)
// ---------------------------------------------------------------------------

const rekeningSchema = withPhotoSlot({
  namaBank: optionalText(100),
  nomorRekening: nomorRekeningField,
  atasNama: optionalText(150),
}).refine(
  (input) => [input.namaBank, input.nomorRekening, input.atasNama].every((value) => value === null) ||
    [input.namaBank, input.nomorRekening, input.atasNama].every((value) => value !== null),
  { message: "Isi nama bank, nomor rekening, dan atas nama sekaligus, atau kosongkan ketiganya." },
);

const rekeningValuesSchema = z.object({
  nama_bank: z.string().nullable(),
  nomor_rekening: z.string().nullable(),
  atas_nama: z.string().nullable(),
  qris_foto_path: z.string().nullable(),
  qris_foto_alt: z.string().nullable(),
});
const rekeningResultSchema = z.object({ old: rekeningValuesSchema, new: rekeningValuesSchema });
type RekeningValues = z.infer<typeof rekeningValuesSchema>;

function shown(value: string | null): string {
  return value === null ? "(kosong)" : quote(value);
}

/** "nama bank "A" → "B"; nomor rekening …; QRIS diganti" — every field that changed, old and new (brief §14.1). */
export function describeRekeningChange(before: RekeningValues, after: RekeningValues): string {
  const parts: string[] = [];
  const fields = [
    ["nama bank", "nama_bank"],
    ["nomor rekening", "nomor_rekening"],
    ["atas nama", "atas_nama"],
  ] as const;
  for (const [label, key] of fields) {
    if (before[key] !== after[key]) parts.push(`${label} ${shown(before[key])} → ${shown(after[key])}`);
  }
  if (before.qris_foto_path !== after.qris_foto_path) {
    parts.push(!before.qris_foto_path ? "QRIS ditambahkan" : !after.qris_foto_path ? "QRIS dihapus" : "QRIS diganti");
  } else if (before.qris_foto_alt !== after.qris_foto_alt) {
    parts.push(`teks alternatif QRIS ${shown(before.qris_foto_alt)} → ${shown(after.qris_foto_alt)}`);
  }
  return parts.length > 0
    ? `Mengubah rekening persembahan: ${parts.join("; ")}`
    : "Menyimpan rekening persembahan tanpa perubahan";
}

/**
 * PATCH /api/admin/profil-gereja/persembahan (multipart). Needs
 * situs_rekening:update (also enforced by RLS and the RPC); uploading or
 * removing the QRIS file also needs situs:update, like every photo (§14.5).
 */
export const updatePersembahan = mutation({
  permission: ["situs_rekening", "update"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: rekeningSchema,
  async run({ input, supabase, user }) {
    if ((input.foto.file || input.foto.remove) && !can(user, "situs", "update")) {
      throw new ApiError(403, "Kamu tidak punya akses untuk tindakan ini.");
    }

    const current = await supabase
      .from("profil_gereja_rekening")
      .select("qris_foto_path, qris_foto_alt")
      .eq("id", SINGLETON_ID)
      .maybeSingle();
    if (current.error) throw dbError(current.error);
    if (!current.data) throw new ApiError(404, "Data rekening tidak ditemukan.");

    const { result } = await savePhotoSlot({
      supabase,
      folder: "profil",
      slot: input.foto,
      current: storedPhoto(current.data.qris_foto_path, current.data.qris_foto_alt),
      write: async (photo) => {
        const { data, error } = await supabase.rpc("update_profil_gereja_rekening", {
          // Omitted (undefined) arguments default to null.
          p_nama_bank: input.namaBank ?? undefined,
          p_nomor_rekening: input.nomorRekening ?? undefined,
          p_atas_nama: input.atasNama ?? undefined,
          p_qris_foto_path: photo?.path,
          p_qris_foto_alt: photo?.alt,
        });
        if (error) throw error.code === "23514" ? dbError(error) : rpcError(error);
        return rekeningResultSchema.parse(data);
      },
    });

    return {
      data: result.new,
      log: { module: "situs", activity: describeRekeningChange(result.old, result.new) },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Linimasa
// ---------------------------------------------------------------------------

const linimasaSchema = z.object({
  tahun: requiredText("Tahun wajib diisi.", 20),
  teks: requiredText("Keterangan wajib diisi.", 500),
});

/** "1950 · Awal persekutuan…" for activity sentences. */
function linimasaLabel(row: { tahun: string; teks: string }): string {
  const teks = row.teks.length > 60 ? `${row.teks.slice(0, 57)}…` : row.teks;
  return quote(`${row.tahun} · ${teks}`);
}

/** POST /api/admin/profil-gereja/linimasa. New items go last (stage 4's max + 1). */
export const createLinimasa = mutation({
  permission: ["situs", "create"],
  schema: linimasaSchema,
  status: 201,
  async run({ input, supabase }) {
    const last = await supabase
      .from("profil_gereja_linimasa")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw dbError(last.error);

    const { data, error } = await supabase
      .from("profil_gereja_linimasa")
      .insert({ tahun: input.tahun, teks: input.teks, sort_order: last.data ? last.data.sort_order + 1 : 0 })
      .select("id, tahun, teks, sort_order")
      .single();
    if (error) throw dbError(error);

    return {
      data: data as LinimasaRow,
      log: { module: "situs", activity: `Menambah linimasa ${linimasaLabel(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/profil-gereja/linimasa/[id]. */
export const updateLinimasa = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: linimasaSchema,
  notFound: LINIMASA_NOT_FOUND,
  async run({ input, params, supabase }) {
    const { data, error } = await supabase
      .from("profil_gereja_linimasa")
      .update({ tahun: input.tahun, teks: input.teks })
      .eq("id", params.id)
      .select("id, tahun, teks, sort_order")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: LINIMASA_NOT_FOUND });
    if (!data) throw new ApiError(404, LINIMASA_NOT_FOUND);

    return {
      data: data as LinimasaRow,
      log: { module: "situs", activity: `Mengubah linimasa ${linimasaLabel(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** DELETE /api/admin/profil-gereja/linimasa/[id] (situs:delete). */
export const deleteLinimasa = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: LINIMASA_NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase
      .from("profil_gereja_linimasa")
      .delete()
      .eq("id", params.id)
      .select("id, tahun, teks")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: LINIMASA_NOT_FOUND });
    if (!data) throw new ApiError(404, LINIMASA_NOT_FOUND);

    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus linimasa ${linimasaLabel(data)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** POST /api/admin/profil-gereja/linimasa/reorder: the atomic RPC rejects a stale list (stage 8's pattern). */
export const reorderLinimasa = mutation({
  permission: ["situs", "update"],
  schema: z.object({ ids: z.array(z.uuid()) }),
  async run({ input, supabase }) {
    const { error } = await supabase.rpc("reorder_profil_linimasa", { p_ids: input.ids });
    if (error) throw rpcError(error);
    return {
      data: { ok: true },
      log: { module: "situs", activity: "Mengubah urutan linimasa" },
      revalidate: REVALIDATE,
    };
  },
});
