import "server-only";

import { z } from "zod";

import { ApiError, dbError, mutation, rpcError, type RevalidateTarget } from "@/lib/api-mutation";
import { can } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/session";
import type { StatusKeanggotaan } from "@/lib/jemaat";
import {
  isKomisiEligible,
  type JabatanKomisiRow,
  type KomisiAnggotaRow,
  type KomisiDetail,
  type KomisiListRow,
} from "@/lib/komisi";
import { deletePhotoObject, PHOTO_FORM_MULTIPART, savePhotoSlot, withPhotoSlot, type StoredPhoto } from "@/lib/situs-photos";
import type { ServerSupabase } from "@/lib/supabase/server";
import { randomSlugSuffix, slugify } from "@/lib/warta";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const KOMISI_NOT_FOUND = "Komisi tidak ditemukan.";
const JABATAN_NOT_FOUND = "Jabatan tidak ditemukan.";
const ANGGOTA_NOT_FOUND = "Anggota komisi tidak ditemukan.";
const KOMISI_UNIQUE_MESSAGE = "Nama komisi sudah digunakan.";
const JABATAN_UNIQUE_MESSAGE = "Nama jabatan sudah digunakan.";
const JABATAN_IN_USE_MESSAGE = "Jabatan ini masih dipakai oleh anggota komisi.";
const NO_WARTA_READ = "Kamu tidak punya akses untuk tindakan ini.";

const REVALIDATE = [{ path: "/admin/komisi", type: "layout" }, { path: "/komisi", type: "layout" }] as const satisfies readonly RevalidateTarget[];

const KOMISI_COLUMNS = "id, nama, slug, deskripsi, periode, foto_path, foto_alt, pembina_jemaat_id, tampil, sort_order";

type KomisiRawRow = {
  id: string;
  nama: string;
  slug: string;
  deskripsi: string | null;
  periode: string | null;
  foto_path: string | null;
  foto_alt: string | null;
  pembina_jemaat_id: string | null;
  tampil: boolean;
  sort_order: number;
};

function storedPhoto(row: { foto_path: string | null; foto_alt: string | null }): StoredPhoto | null {
  return row.foto_path && row.foto_alt ? { path: row.foto_path, alt: row.foto_alt } : null;
}

/** `/admin/komisi` (brief §9.2, §14.8): a bounded list, loaded whole and filtered/sorted on the client. */
export async function loadKomisiList(supabase: ServerSupabase): Promise<{ data: KomisiListRow[] | null; error: string | null }> {
  const [komisiRes, countsRes, jemaatRes] = await Promise.all([
    supabase.from("komisi").select(KOMISI_COLUMNS).order("sort_order").order("created_at").order("id"),
    supabase.from("komisi_anggota").select("komisi_id"),
    supabase.from("jemaat").select("id, nama"),
  ]);
  if (komisiRes.error) return { data: null, error: komisiRes.error.message };

  const counts = new Map<string, number>();
  for (const row of countsRes.data ?? []) {
    counts.set(row.komisi_id, (counts.get(row.komisi_id) ?? 0) + 1);
  }
  const jemaatNama = new Map((jemaatRes.data ?? []).map((j) => [j.id, j.nama]));

  return {
    data: (komisiRes.data as KomisiRawRow[]).map((row) => ({
      id: row.id,
      nama: row.nama,
      slug: row.slug,
      deskripsi: row.deskripsi,
      periode: row.periode,
      foto_path: row.foto_path,
      foto_alt: row.foto_alt,
      pembinaJemaatId: row.pembina_jemaat_id,
      pembinaNama: row.pembina_jemaat_id ? (jemaatNama.get(row.pembina_jemaat_id) ?? null) : null,
      tampil: row.tampil,
      sortOrder: row.sort_order,
      jumlahAnggota: counts.get(row.id) ?? 0,
    })),
    error: null,
  };
}

/** `/admin/komisi/jabatan`: a small master list, no manual reordering needed yet (seeded order is stable). */
export async function loadJabatanKomisiList(supabase: ServerSupabase) {
  return supabase
    .from("jabatan_komisi")
    .select("id, nama, tunggal, sort_order")
    .order("sort_order")
    .order("created_at")
    .order("id")
    .then(({ data, error }) => ({ data: data as JabatanKomisiRow[] | null, error }));
}

export type KomisiPersonOption = { id: string; nama: string; labels: string[] };

/**
 * The two filtered person lists the Komisi dialogs need (brief §14.8):
 * pembina (jemaat carrying the label named in komisi_settings) and eligible
 * members (Sidi/Anggota Penuh). The label is looked up by id, never by name.
 */
export async function loadKomisiPeopleOptions(
  supabase: ServerSupabase,
): Promise<{ pembinaOptions: KomisiPersonOption[]; anggotaOptions: KomisiPersonOption[] }> {
  const [jemaatRes, labelsRes, settingsRes] = await Promise.all([
    supabase.from("jemaat").select("id, nama, status_keanggotaan").order("nama"),
    supabase.from("jemaat_labels").select("jemaat_id, label_id, label_jemaat(nama)"),
    supabase.from("komisi_settings").select("pembina_label_id").eq("id", 1).maybeSingle(),
  ]);

  const pembinaLabelId = settingsRes.data?.pembina_label_id ?? null;
  const labelsByJemaat = new Map<string, string[]>();
  const pembinaEligible = new Set<string>();
  for (const row of labelsRes.data ?? []) {
    const nama = (row as { label_jemaat: { nama: string } | null }).label_jemaat?.nama;
    if (nama) {
      const list = labelsByJemaat.get(row.jemaat_id) ?? [];
      list.push(nama);
      labelsByJemaat.set(row.jemaat_id, list);
    }
    if (pembinaLabelId && row.label_id === pembinaLabelId) pembinaEligible.add(row.jemaat_id);
  }

  const people = (jemaatRes.data ?? []).map((j) => ({
    id: j.id,
    nama: j.nama,
    status: j.status_keanggotaan as StatusKeanggotaan | null,
    labels: labelsByJemaat.get(j.id) ?? [],
  }));

  return {
    pembinaOptions: people.filter((p) => pembinaEligible.has(p.id)).map(({ id, nama, labels }) => ({ id, nama, labels })),
    anggotaOptions: people.filter((p) => isKomisiEligible(p.status)).map(({ id, nama, labels }) => ({ id, nama, labels })),
  };
}

/** `/admin/komisi/[id]`: the komisi plus its members, jabatan sort_order then nama (matches `public_komisi_detail`). */
export async function loadKomisiDetail(supabase: ServerSupabase, id: string): Promise<{ data: KomisiDetail | null; error: string | null }> {
  const komisiRes = await supabase.from("komisi").select(KOMISI_COLUMNS).eq("id", id).maybeSingle();
  if (komisiRes.error) return { data: null, error: komisiRes.error.message };
  if (!komisiRes.data) return { data: null, error: null };
  const row = komisiRes.data as KomisiRawRow;

  const [anggotaRes, jemaatRes, jabatanRes] = await Promise.all([
    supabase.from("komisi_anggota").select("jemaat_id, jabatan_id").eq("komisi_id", id),
    supabase.from("jemaat").select("id, nama, status_keanggotaan"),
    supabase.from("jabatan_komisi").select("id, nama, sort_order"),
  ]);

  const jemaatMap = new Map((jemaatRes.data ?? []).map((j) => [j.id, j]));
  const jabatanMap = new Map((jabatanRes.data ?? []).map((j) => [j.id, j]));

  const anggota: KomisiAnggotaRow[] = (anggotaRes.data ?? []).map((member) => {
    const jemaat = jemaatMap.get(member.jemaat_id);
    const jabatan = jabatanMap.get(member.jabatan_id);
    const status = (jemaat?.status_keanggotaan as StatusKeanggotaan | null) ?? null;
    return {
      jemaatId: member.jemaat_id,
      nama: jemaat?.nama ?? "(jemaat tidak ditemukan)",
      jabatanId: member.jabatan_id,
      jabatanNama: jabatan?.nama ?? "(jabatan tidak ditemukan)",
      statusKeanggotaan: status,
      eligible: isKomisiEligible(status),
    };
  });
  anggota.sort((a, b) => {
    const orderA = jabatanMap.get(a.jabatanId)?.sort_order ?? 0;
    const orderB = jabatanMap.get(b.jabatanId)?.sort_order ?? 0;
    return orderA - orderB || a.nama.localeCompare(b.nama, "id");
  });

  return {
    data: {
      id: row.id,
      nama: row.nama,
      slug: row.slug,
      deskripsi: row.deskripsi,
      periode: row.periode,
      foto_path: row.foto_path,
      foto_alt: row.foto_alt,
      pembinaJemaatId: row.pembina_jemaat_id,
      pembinaNama: row.pembina_jemaat_id ? (jemaatMap.get(row.pembina_jemaat_id)?.nama ?? null) : null,
      tampil: row.tampil,
      anggota,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Komisi: create / update / delete / reorder
// ---------------------------------------------------------------------------

const fieldsSchema = withPhotoSlot({
  nama: requiredText("Nama wajib diisi.", 150),
  deskripsi: optionalText(2000),
  periode: optionalText(50),
  pembinaJemaatId: z
    .string()
    .nullish()
    .transform((value) => value || null),
  tampil: z
    .string()
    .nullish()
    .transform((value) => value === "1" || value === "true"),
});

/**
 * 0032's `komisi` triggers (slug immutability, the pembina label check) raise
 * 22023 with hand-authored Indonesian text, same as every RPC in this
 * codebase (`rpcError`'s own reasoning) — forwarded as-is rather than
 * `dbError`'s generic "Data yang dikirim tidak valid.", since `komisi`'s
 * writes are plain table operations, not RPCs.
 */
function komisiError(error: Parameters<typeof dbError>[0], messages: Parameters<typeof dbError>[1] = {}) {
  if (error.code === "22023") return new ApiError(400, error.message);
  return dbError(error, messages);
}

const SLUG_RETRIES = 5;

/** One attempt, then up to 5 retries with a random "-xxxx" suffix (brief §9.4's convention, reused here). */
async function insertKomisi(
  supabase: ServerSupabase,
  baseSlug: string,
  values: {
    nama: string;
    deskripsi: string | null;
    periode: string | null;
    pembina_jemaat_id: string | null;
    tampil: boolean;
    sort_order: number;
    foto_path: string | null;
    foto_alt: string | null;
  },
): Promise<KomisiRawRow> {
  for (let attempt = 0; attempt <= SLUG_RETRIES; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;
    const { data, error } = await supabase
      .from("komisi")
      .insert({ ...values, slug })
      .select(KOMISI_COLUMNS)
      .single();
    if (!error) return data as KomisiRawRow;
    // Only a slug collision is retried; a nama collision (or anything else) surfaces right away.
    if (error.code === "23505" && error.message.includes("komisi_slug_key") && attempt < SLUG_RETRIES) continue;
    throw komisiError(error, { unique: KOMISI_UNIQUE_MESSAGE });
  }
  throw new ApiError(400, "Gagal membuat alamat unik untuk komisi ini. Coba simpan lagi.");
}

/** POST /api/admin/komisi ("Tambah Komisi"), multipart. New rows go last. */
export const createKomisi = mutation({
  permission: ["situs", "create"],
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  status: 201,
  async run({ input, supabase }) {
    // Stage 4's "new rows go last" convention: max(sort_order) + 1, not the row count.
    const { data: last } = await supabase.from("komisi").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sortOrder = (last?.[0]?.sort_order ?? -1) + 1;
    const baseSlug = slugify(input.nama);

    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "komisi",
      slot: input.foto,
      current: null,
      write: (photo) =>
        insertKomisi(supabase, baseSlug, {
          nama: input.nama,
          deskripsi: input.deskripsi,
          periode: input.periode,
          pembina_jemaat_id: input.pembinaJemaatId,
          tampil: input.tampil,
          sort_order: sortOrder,
          foto_path: photo?.path ?? null,
          foto_alt: photo?.alt ?? null,
        }),
    });

    return {
      data,
      log: { module: "situs", activity: `Menambah komisi "${data.nama}"` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/komisi/[id]: every field together, multipart. Slug and sort_order are untouched. */
export const updateKomisi = mutation({
  permission: ["situs", "update"],
  params: idParams,
  multipart: PHOTO_FORM_MULTIPART,
  schema: fieldsSchema,
  notFound: KOMISI_NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("komisi").select("nama, foto_path, foto_alt").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: KOMISI_NOT_FOUND });
    if (!current.data) throw new ApiError(404, KOMISI_NOT_FOUND);

    const { result: data } = await savePhotoSlot({
      supabase,
      folder: "komisi",
      slot: input.foto,
      current: storedPhoto(current.data),
      write: async (photo) => {
        const { data, error } = await supabase
          .from("komisi")
          .update({
            nama: input.nama,
            deskripsi: input.deskripsi,
            periode: input.periode,
            pembina_jemaat_id: input.pembinaJemaatId,
            tampil: input.tampil,
            foto_path: photo?.path ?? null,
            foto_alt: photo?.alt ?? null,
          })
          .eq("id", params.id)
          .select(KOMISI_COLUMNS)
          .maybeSingle();
        if (error) throw komisiError(error, { unique: KOMISI_UNIQUE_MESSAGE, notFound: KOMISI_NOT_FOUND });
        if (!data) throw new ApiError(404, KOMISI_NOT_FOUND);
        return data as KomisiRawRow;
      },
    });

    const activity =
      current.data.nama === data.nama
        ? `Mengubah komisi "${data.nama}"`
        : `Mengubah komisi "${current.data.nama}" menjadi "${data.nama}"`;
    return { data, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/komisi/[id]; its photo object and every membership row are removed too (cascade). */
export const deleteKomisi = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: KOMISI_NOT_FOUND,
  async run({ params, supabase }) {
    // Counted *before* the delete: komisi_anggota cascades on delete, so
    // running this concurrently with (or after) it would race and read 0.
    const countRes = await supabase.from("komisi_anggota").select("jemaat_id", { count: "exact", head: true }).eq("komisi_id", params.id);
    const { data, error } = await supabase.from("komisi").delete().eq("id", params.id).select("id, nama, foto_path").maybeSingle();
    if (error) throw dbError(error, { notFound: KOMISI_NOT_FOUND });
    if (!data) throw new ApiError(404, KOMISI_NOT_FOUND);
    await deletePhotoObject(data.foto_path);

    const jumlahAnggota = countRes.count ?? 0;
    const consequence = jumlahAnggota > 0 ? ` (${jumlahAnggota} anggota ikut terlepas)` : "";
    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus komisi "${data.nama}"${consequence}` },
      revalidate: REVALIDATE,
    };
  },
});

const reorderSchema = z.object({ ids: z.array(z.uuid()) });

/** POST /api/admin/komisi/reorder: the atomic RPC rejects a stale list. */
export const reorderKomisi = mutation({
  permission: ["situs", "update"],
  schema: reorderSchema,
  async run({ input, supabase }) {
    const { error } = await supabase.rpc("reorder_komisi", { p_ids: input.ids });
    if (error) throw rpcError(error);
    return { data: { ok: true }, log: { module: "situs", activity: "Mengubah urutan komisi" }, revalidate: REVALIDATE };
  },
});

// ---------------------------------------------------------------------------
// Jabatan Komisi (master data)
// ---------------------------------------------------------------------------

const jabatanSchema = z.object({
  nama: requiredText("Nama jabatan wajib diisi.", 100),
  tunggal: z.boolean(),
});

/** POST /api/admin/komisi/jabatan. New rows go last (stage 4's `max(sort_order) + 1` convention). */
export const createJabatan = mutation({
  permission: ["situs", "create"],
  schema: jabatanSchema,
  status: 201,
  async run({ input, supabase }) {
    const { data: existing } = await supabase.from("jabatan_komisi").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("jabatan_komisi")
      .insert({ nama: input.nama, tunggal: input.tunggal, sort_order: sortOrder })
      .select("id, nama, tunggal, sort_order")
      .single();
    if (error) throw dbError(error, { unique: JABATAN_UNIQUE_MESSAGE });
    return {
      data: data as JabatanKomisiRow,
      log: { module: "situs", activity: `Menambah jabatan komisi "${data.nama}"` },
      revalidate: REVALIDATE,
    };
  },
});

/**
 * PATCH /api/admin/komisi/jabatan/[id]. Flipping `tunggal` to true can
 * conflict with an existing komisi that already holds this jabatan more
 * than once (0032's `cascade_jabatan_tunggal_change` trigger raises 23505);
 * `unique` here gives that case a specific message instead of the generic one.
 */
export const updateJabatan = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: jabatanSchema,
  notFound: JABATAN_NOT_FOUND,
  async run({ input, params, supabase }) {
    const current = await supabase.from("jabatan_komisi").select("nama").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: JABATAN_NOT_FOUND });
    if (!current.data) throw new ApiError(404, JABATAN_NOT_FOUND);

    const { data, error } = await supabase
      .from("jabatan_komisi")
      .update({ nama: input.nama, tunggal: input.tunggal })
      .eq("id", params.id)
      .select("id, nama, tunggal, sort_order")
      .maybeSingle();
    if (error) {
      throw dbError(error, {
        unique:
          error.message.includes("komisi_anggota")
            ? "Jabatan ini tidak bisa dibuat tunggal karena ada komisi dengan lebih dari satu pemegang jabatan ini."
            : JABATAN_UNIQUE_MESSAGE,
        notFound: JABATAN_NOT_FOUND,
      });
    }
    if (!data) throw new ApiError(404, JABATAN_NOT_FOUND);

    const activity =
      current.data.nama === data.nama
        ? `Mengubah jabatan komisi "${data.nama}"`
        : `Mengubah jabatan komisi "${current.data.nama}" menjadi "${data.nama}"`;
    return { data: data as JabatanKomisiRow, log: { module: "situs", activity }, revalidate: REVALIDATE };
  },
});

/** DELETE /api/admin/komisi/jabatan/[id]; refused (23503, `jabatan_id restrict`) while any member still uses it. */
export const deleteJabatan = mutation({
  permission: ["situs", "delete"],
  params: idParams,
  notFound: JABATAN_NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("jabatan_komisi").delete().eq("id", params.id).select("id, nama").maybeSingle();
    if (error) throw dbError(error, { inUse: JABATAN_IN_USE_MESSAGE, notFound: JABATAN_NOT_FOUND });
    if (!data) throw new ApiError(404, JABATAN_NOT_FOUND);
    return {
      data: { id: data.id },
      log: { module: "situs", activity: `Menghapus jabatan komisi "${data.nama}"` },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Komisi Anggota: managing members needs situs:update AND warta:read (brief
// §14.8), because members are jemaat rows (every church-content table is
// guarded by warta, brief §4). RLS (0032) enforces the same pair as a
// backstop; this app-level check only gets the friendlier, consistent 403.
// ---------------------------------------------------------------------------

function requireWartaRead(user: AuthUser): void {
  if (!can(user, "warta", "read")) throw new ApiError(403, NO_WARTA_READ);
}

const anggotaParams = z.object({ id: z.uuid(), jemaatId: z.uuid() });
const tambahAnggotaSchema = z.object({ jemaatId: z.uuid(), jabatanId: z.uuid() });
const ubahJabatanSchema = z.object({ jabatanId: z.uuid() });

async function anggotaLabel(supabase: ServerSupabase, komisiId: string, jemaatId: string) {
  const [komisi, jemaat] = await Promise.all([
    supabase.from("komisi").select("nama").eq("id", komisiId).maybeSingle(),
    supabase.from("jemaat").select("nama").eq("id", jemaatId).maybeSingle(),
  ]);
  return { komisiNama: komisi.data?.nama ?? "", jemaatNama: jemaat.data?.nama ?? "" };
}

/** POST /api/admin/komisi/[id]/anggota ("Tambah Anggota"). */
export const addKomisiAnggota = mutation({
  permission: ["situs", "update"],
  params: idParams,
  schema: tambahAnggotaSchema,
  status: 201,
  notFound: KOMISI_NOT_FOUND,
  async run({ input, params, user, supabase }) {
    requireWartaRead(user);
    const { data, error } = await supabase.rpc("add_komisi_anggota", {
      p_komisi_id: params.id,
      p_jemaat_id: input.jemaatId,
      p_jabatan_id: input.jabatanId,
    });
    if (error) throw rpcError(error);
    const { komisiNama, jemaatNama } = await anggotaLabel(supabase, params.id, input.jemaatId);
    const { data: jabatan } = await supabase.from("jabatan_komisi").select("nama").eq("id", input.jabatanId).maybeSingle();
    return {
      data,
      log: {
        module: "situs",
        activity: `Menambah "${jemaatNama}" sebagai ${jabatan?.nama ?? "anggota"} komisi "${komisiNama}"`,
      },
      revalidate: [...REVALIDATE, `/admin/komisi/${params.id}`],
    };
  },
});

/** PATCH /api/admin/komisi/[id]/anggota/[jemaatId] (the inline jabatan editor). */
export const updateKomisiAnggotaJabatan = mutation({
  permission: ["situs", "update"],
  params: anggotaParams,
  schema: ubahJabatanSchema,
  notFound: ANGGOTA_NOT_FOUND,
  async run({ input, params, user, supabase }) {
    requireWartaRead(user);
    const { data, error } = await supabase.rpc("update_komisi_anggota_jabatan", {
      p_komisi_id: params.id,
      p_jemaat_id: params.jemaatId,
      p_jabatan_id: input.jabatanId,
    });
    if (error) throw rpcError(error);
    const { komisiNama, jemaatNama } = await anggotaLabel(supabase, params.id, params.jemaatId);
    const { data: jabatan } = await supabase.from("jabatan_komisi").select("nama").eq("id", input.jabatanId).maybeSingle();
    return {
      data,
      log: {
        module: "situs",
        activity: `Mengubah jabatan "${jemaatNama}" di komisi "${komisiNama}" menjadi ${jabatan?.nama ?? "anggota"}`,
      },
      revalidate: [`/admin/komisi/${params.id}`],
    };
  },
});

/** DELETE /api/admin/komisi/[id]/anggota/[jemaatId]. */
export const removeKomisiAnggota = mutation({
  permission: ["situs", "update"],
  params: anggotaParams,
  notFound: ANGGOTA_NOT_FOUND,
  async run({ params, user, supabase }) {
    requireWartaRead(user);
    const { komisiNama, jemaatNama } = await anggotaLabel(supabase, params.id, params.jemaatId);
    const { data, error } = await supabase
      .from("komisi_anggota")
      .delete()
      .eq("komisi_id", params.id)
      .eq("jemaat_id", params.jemaatId)
      .select("jemaat_id")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: ANGGOTA_NOT_FOUND });
    if (!data) throw new ApiError(404, ANGGOTA_NOT_FOUND);
    return {
      data: { id: data.jemaat_id },
      log: { module: "situs", activity: `Menghapus "${jemaatNama}" dari komisi "${komisiNama}"` },
      revalidate: [...REVALIDATE, `/admin/komisi/${params.id}`],
    };
  },
});
