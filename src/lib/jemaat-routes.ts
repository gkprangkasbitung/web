import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import { isoDateSchema, today } from "@/lib/dates";
import { JENIS_KELAMIN, STATUS_KEANGGOTAAN, type JenisKelamin, type StatusKeanggotaan } from "@/lib/jemaat";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { idParams, optionalText, requiredText } from "@/lib/validation";

export type JemaatListRow = {
  id: string;
  nomorAnggota: string | null;
  nama: string;
  keluargaId: string | null;
  keluargaNama: string | null;
  wilayahId: string | null;
  wilayahNama: string | null;
  statusKeanggotaan: StatusKeanggotaan | null;
  noHp: string | null;
};

export type JemaatOverview = {
  rows: JemaatListRow[];
  jumlahJemaat: number;
  jumlahKeluarga: number;
  wilayahOptions: { id: string; nama: string }[];
  keluargaSuggestions: string[];
  labelOptions: { id: string; nama: string }[];
};

export type JemaatFormOptions = {
  wilayahOptions: { id: string; nama: string }[];
  keluargaOptions: { id: string; nama: string }[];
  labelOptions: { id: string; nama: string }[];
};

/** The dropdown/combobox options the profile form needs, shared by the list and detail pages. */
export async function loadJemaatFormOptions(
  supabase: ServerSupabase,
): Promise<{ data: JemaatFormOptions | null; error: string | null }> {
  const [wilayahRes, keluargaRes, labelRes] = await Promise.all([
    supabase.from("wilayah").select("id, nama").order("sort_order"),
    supabase.from("keluarga").select("id, nama").order("nama"),
    supabase.from("label_jemaat").select("id, nama").order("sort_order"),
  ]);
  const error = wilayahRes.error ?? keluargaRes.error ?? labelRes.error;
  if (error || !wilayahRes.data || !keluargaRes.data || !labelRes.data) {
    return { data: null, error: error?.message ?? "unknown" };
  }
  return {
    data: { wilayahOptions: wilayahRes.data, keluargaOptions: keluargaRes.data, labelOptions: labelRes.data },
    error: null,
  };
}

/** Everything the list page needs, loaded in full (brief §9.2: jemaat is a bounded, client-paginated list). */
export async function loadJemaatOverview(supabase: ServerSupabase): Promise<{ data: JemaatOverview | null; error: string | null }> {
  const [jemaatRes, options] = await Promise.all([
    supabase
      .from("jemaat")
      .select("id, nomor_anggota, nama, status_keanggotaan, wilayah_id, keluarga_id, no_hp")
      .order("nama"),
    loadJemaatFormOptions(supabase),
  ]);
  if (jemaatRes.error || !jemaatRes.data || !options.data) {
    return { data: null, error: jemaatRes.error?.message ?? options.error ?? "unknown" };
  }

  const wilayahMap = new Map(options.data.wilayahOptions.map((w) => [w.id, w.nama]));
  const keluargaMap = new Map(options.data.keluargaOptions.map((k) => [k.id, k.nama]));

  return {
    data: {
      rows: jemaatRes.data.map((j) => ({
        id: j.id,
        nomorAnggota: j.nomor_anggota,
        nama: j.nama,
        keluargaId: j.keluarga_id,
        keluargaNama: j.keluarga_id ? (keluargaMap.get(j.keluarga_id) ?? null) : null,
        wilayahId: j.wilayah_id,
        wilayahNama: j.wilayah_id ? (wilayahMap.get(j.wilayah_id) ?? null) : null,
        statusKeanggotaan: j.status_keanggotaan as StatusKeanggotaan | null,
        noHp: j.no_hp,
      })),
      jumlahJemaat: jemaatRes.data.length,
      jumlahKeluarga: options.data.keluargaOptions.length,
      wilayahOptions: options.data.wilayahOptions,
      keluargaSuggestions: options.data.keluargaOptions.map((k) => k.nama),
      labelOptions: options.data.labelOptions,
    },
    error: null,
  };
}

export type JemaatDetail = {
  id: string;
  nomorAnggota: string | null;
  nama: string;
  jenisKelamin: JenisKelamin | null;
  statusKeanggotaan: StatusKeanggotaan | null;
  wilayahId: string | null;
  wilayahNama: string | null;
  pekerjaan: string | null;
  alamat: string | null;
  noHp: string | null;
  tanggalLahir: string | null;
  tanggalMasuk: string | null;
  keluargaId: string | null;
  keluargaNama: string | null;
  hubunganKeluarga: string | null;
  labelIds: string[];
  anggotaKeluarga: { id: string; nama: string; hubunganKeluarga: string | null; statusKeanggotaan: StatusKeanggotaan | null }[];
};

export async function loadJemaatDetail(
  supabase: ServerSupabase,
  id: string,
): Promise<{ data: JemaatDetail | null; error: string | null }> {
  const { data: jemaat, error } = await supabase
    .from("jemaat")
    .select(
      "id, nomor_anggota, nama, jenis_kelamin, status_keanggotaan, wilayah_id, pekerjaan, alamat, no_hp, tanggal_lahir, tanggal_masuk, keluarga_id, hubungan_keluarga",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!jemaat) return { data: null, error: null };

  const [wilayahRes, keluargaRes, labelsRes, anggotaRes] = await Promise.all([
    jemaat.wilayah_id
      ? supabase.from("wilayah").select("nama").eq("id", jemaat.wilayah_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    jemaat.keluarga_id
      ? supabase.from("keluarga").select("nama").eq("id", jemaat.keluarga_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("jemaat_labels").select("label_id").eq("jemaat_id", id),
    jemaat.keluarga_id
      ? supabase
          .from("jemaat")
          .select("id, nama, hubungan_keluarga, status_keanggotaan")
          .eq("keluarga_id", jemaat.keluarga_id)
          .neq("id", id)
          .order("nama")
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    data: {
      id: jemaat.id,
      nomorAnggota: jemaat.nomor_anggota,
      nama: jemaat.nama,
      jenisKelamin: jemaat.jenis_kelamin as JenisKelamin | null,
      statusKeanggotaan: jemaat.status_keanggotaan as StatusKeanggotaan | null,
      wilayahId: jemaat.wilayah_id,
      wilayahNama: wilayahRes.data?.nama ?? null,
      pekerjaan: jemaat.pekerjaan,
      alamat: jemaat.alamat,
      noHp: jemaat.no_hp,
      tanggalLahir: jemaat.tanggal_lahir,
      tanggalMasuk: jemaat.tanggal_masuk,
      keluargaId: jemaat.keluarga_id,
      keluargaNama: keluargaRes.data?.nama ?? null,
      hubunganKeluarga: jemaat.hubungan_keluarga,
      labelIds: (labelsRes.data ?? []).map((l) => l.label_id),
      anggotaKeluarga: (anggotaRes.data ?? []).map((a) => ({
        id: a.id,
        nama: a.nama,
        hubunganKeluarga: a.hubungan_keluarga,
        statusKeanggotaan: a.status_keanggotaan as StatusKeanggotaan | null,
      })),
    },
    error: null,
  };
}

/** A jemaat's pastoral notes, newest first (brief §9.9). */
export async function loadCatatanPastoral(supabase: ServerSupabase, jemaatId: string) {
  const { data, error } = await supabase
    .from("jemaat_catatan_pastoral")
    .select("id, jenis, tanggal, penulis_nama, isi")
    .eq("jemaat_id", jemaatId)
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export type PersonOptionRow = {
  id: string;
  nama: string;
  labels: string[];
  keluargaId: string | null;
  keluargaNama: string | null;
};

/**
 * All jemaat with their labels and current family (brief §9.5), for the
 * person picker. The family is included so "Tambah Anggota" (brief §9.10)
 * can warn before moving someone out of another family.
 */
export async function listPeopleForPicker(supabase: ServerSupabase): Promise<PersonOptionRow[]> {
  const [jemaatRes, labelsRes, keluargaRes] = await Promise.all([
    supabase.from("jemaat").select("id, nama, keluarga_id").order("nama"),
    supabase.from("jemaat_labels").select("jemaat_id, label_jemaat(nama)"),
    supabase.from("keluarga").select("id, nama"),
  ]);
  const labelsByJemaat = new Map<string, string[]>();
  for (const row of labelsRes.data ?? []) {
    const nama = (row as { label_jemaat: { nama: string } | null }).label_jemaat?.nama;
    if (!nama) continue;
    const list = labelsByJemaat.get(row.jemaat_id) ?? [];
    list.push(nama);
    labelsByJemaat.set(row.jemaat_id, list);
  }
  const keluargaMap = new Map((keluargaRes.data ?? []).map((k) => [k.id, k.nama]));
  return (jemaatRes.data ?? []).map((j) => ({
    id: j.id,
    nama: j.nama,
    labels: labelsByJemaat.get(j.id) ?? [],
    keluargaId: j.keluarga_id,
    keluargaNama: j.keluarga_id ? (keluargaMap.get(j.keluarga_id) ?? null) : null,
  }));
}

const jemaatProfileSchema = z.object({
  nama: requiredText("Nama wajib diisi.", 200),
  nomorAnggota: optionalText(50),
  jenisKelamin: z.enum(JENIS_KELAMIN).nullish(),
  statusKeanggotaan: z.enum(STATUS_KEANGGOTAAN).nullish(),
  wilayahId: z.uuid().nullish(),
  pekerjaan: optionalText(200),
  alamat: optionalText(500),
  noHp: optionalText(30),
  tanggalLahir: isoDateSchema.nullish(),
  tanggalMasuk: isoDateSchema.nullish(),
  keluargaNama: optionalText(200),
  hubunganKeluarga: optionalText(50),
  labelIds: z.array(z.uuid()).default([]),
});

type SaveJemaatRpcArgs = Database["public"]["Functions"]["save_jemaat"]["Args"];

/**
 * `save_jemaat`'s parameters all default to null in Postgres, and the
 * generated RPC types make each one optional rather than nullable — so
 * "clear this field" is expressed by omitting the key, not by sending
 * `null` (see docs/progress.md, stage 2). PostgREST calls the function with
 * its default (also null) either way, so this is behaviorally identical.
 */
function toRpcArgs(input: z.infer<typeof jemaatProfileSchema>, id?: string): SaveJemaatRpcArgs {
  return {
    p_nama: input.nama,
    ...(id ? { p_id: id } : {}),
    p_nomor_anggota: input.nomorAnggota ?? undefined,
    p_jenis_kelamin: input.jenisKelamin ?? undefined,
    p_status_keanggotaan: input.statusKeanggotaan ?? undefined,
    p_wilayah_id: input.wilayahId ?? undefined,
    p_pekerjaan: input.pekerjaan ?? undefined,
    p_alamat: input.alamat ?? undefined,
    p_no_hp: input.noHp ?? undefined,
    p_tanggal_lahir: input.tanggalLahir ?? undefined,
    p_tanggal_masuk: input.tanggalMasuk ?? undefined,
    p_keluarga_nama: input.keluargaNama ?? undefined,
    p_hubungan_keluarga: input.hubunganKeluarga ?? undefined,
    p_label_ids: input.labelIds,
  };
}

/** POST /api/admin/jemaat */
export const createJemaat = mutation({
  permission: ["warta", "update"],
  schema: jemaatProfileSchema,
  status: 201,
  async run({ input, supabase }) {
    const { data: id, error } = await supabase.rpc("save_jemaat", toRpcArgs(input));
    if (error) throw rpcError(error);
    return {
      data: { id },
      log: { module: "jemaat", activity: `Menambah jemaat ${quote(input.nama)}` },
      revalidate: ["/admin/jemaat", "/admin/keluarga"],
    };
  },
});

/** PATCH /api/admin/jemaat/[id] */
export const updateJemaat = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: jemaatProfileSchema,
  notFound: "Jemaat tidak ditemukan.",
  async run({ input, params, supabase }) {
    const { error } = await supabase.rpc("save_jemaat", toRpcArgs(input, params.id));
    if (error) throw rpcError(error);
    return {
      data: { id: params.id },
      log: { module: "jemaat", activity: `Mengubah data jemaat ${quote(input.nama)}` },
      revalidate: [`/admin/jemaat/${params.id}`, "/admin/jemaat", "/admin/keluarga"],
    };
  },
});

/** DELETE /api/admin/jemaat/[id] */
export const deleteJemaat = mutation({
  permission: ["warta", "update"],
  params: idParams,
  notFound: "Jemaat tidak ditemukan.",
  async run({ params, supabase }) {
    const { data, error } = await supabase.from("jemaat").delete().eq("id", params.id).select("id, nama").maybeSingle();
    if (error) throw dbError(error, { notFound: "Jemaat tidak ditemukan." });
    if (!data) throw new ApiError(404, "Jemaat tidak ditemukan.");
    return {
      data: { id: data.id },
      log: { module: "jemaat", activity: `Menghapus jemaat ${quote(data.nama)}` },
      revalidate: ["/admin/jemaat", "/admin/keluarga"],
    };
  },
});

const catatanSchema = z.object({
  jenis: requiredText("Jenis wajib diisi.", 100),
  tanggal: isoDateSchema,
  isi: requiredText("Isi wajib diisi.", 5000),
});

/** POST /api/admin/jemaat/[id]/catatan */
export const createCatatan = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: catatanSchema,
  status: 201,
  notFound: "Jemaat tidak ditemukan.",
  async run({ input, params, user, supabase }) {
    const jemaatRes = await supabase.from("jemaat").select("nama").eq("id", params.id).maybeSingle();
    if (jemaatRes.error) throw dbError(jemaatRes.error, { notFound: "Jemaat tidak ditemukan." });
    if (!jemaatRes.data) throw new ApiError(404, "Jemaat tidak ditemukan.");

    const { data, error } = await supabase
      .from("jemaat_catatan_pastoral")
      .insert({
        jemaat_id: params.id,
        jenis: input.jenis,
        tanggal: input.tanggal,
        isi: input.isi,
        // The author is always the server's own session user; the client can't forge this.
        penulis_id: user.id,
        penulis_nama: user.fullName ?? user.email,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return {
      data,
      log: { module: "jemaat", activity: `Menambah catatan pastoral untuk ${quote(jemaatRes.data.nama)}` },
      revalidate: [`/admin/jemaat/${params.id}`],
    };
  },
});

const catatanParams = z.object({ id: z.uuid(), catatanId: z.uuid() });
const catatanUpdateSchema = z.object({
  jenis: requiredText("Jenis wajib diisi.", 100),
  tanggal: isoDateSchema,
  isi: requiredText("Isi wajib diisi.", 5000),
});

/** PATCH /api/admin/jemaat/[id]/catatan/[catatanId] */
export const updateCatatan = mutation({
  permission: ["warta", "update"],
  params: catatanParams,
  schema: catatanUpdateSchema,
  notFound: "Catatan tidak ditemukan.",
  async run({ input, params, supabase }) {
    const { data, error } = await supabase
      .from("jemaat_catatan_pastoral")
      .update({ jenis: input.jenis, tanggal: input.tanggal, isi: input.isi })
      .eq("id", params.catatanId)
      .eq("jemaat_id", params.id)
      .select()
      .maybeSingle();
    if (error) throw dbError(error, { notFound: "Catatan tidak ditemukan." });
    if (!data) throw new ApiError(404, "Catatan tidak ditemukan.");
    const jemaatRes = await supabase.from("jemaat").select("nama").eq("id", params.id).maybeSingle();
    return {
      data,
      log: { module: "jemaat", activity: `Mengubah catatan pastoral untuk ${quote(jemaatRes.data?.nama ?? "")}` },
      revalidate: [`/admin/jemaat/${params.id}`],
    };
  },
});

/** DELETE /api/admin/jemaat/[id]/catatan/[catatanId] */
export const deleteCatatan = mutation({
  permission: ["warta", "update"],
  params: catatanParams,
  notFound: "Catatan tidak ditemukan.",
  async run({ params, supabase }) {
    const jemaatRes = await supabase.from("jemaat").select("nama").eq("id", params.id).maybeSingle();
    const { data, error } = await supabase
      .from("jemaat_catatan_pastoral")
      .delete()
      .eq("id", params.catatanId)
      .eq("jemaat_id", params.id)
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error, { notFound: "Catatan tidak ditemukan." });
    if (!data) throw new ApiError(404, "Catatan tidak ditemukan.");
    return {
      data: { id: data.id },
      log: { module: "jemaat", activity: `Menghapus catatan pastoral untuk ${quote(jemaatRes.data?.nama ?? "")}` },
      revalidate: [`/admin/jemaat/${params.id}`],
    };
  },
});

export function defaultCatatanTanggal(): string {
  return today();
}
