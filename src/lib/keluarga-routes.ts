import "server-only";

import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import type { StatusKeanggotaan } from "@/lib/jemaat";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const KELUARGA_UNIQUE_MESSAGE = "Nama keluarga sudah digunakan.";

export type KeluargaListRow = {
  id: string;
  nama: string;
  jumlahAnggota: number;
  anggota: string;
};

/** brief §9.10: bounded list, loaded in full and paginated on the client. */
export async function loadKeluargaOverview(
  supabase: ServerSupabase,
): Promise<{ data: KeluargaListRow[] | null; error: string | null }> {
  const [keluargaRes, jemaatRes] = await Promise.all([
    supabase.from("keluarga").select("id, nama").order("nama"),
    supabase.from("jemaat").select("id, nama, keluarga_id").not("keluarga_id", "is", null).order("nama"),
  ]);
  if (keluargaRes.error || jemaatRes.error || !keluargaRes.data || !jemaatRes.data) {
    return { data: null, error: (keluargaRes.error ?? jemaatRes.error)?.message ?? "unknown" };
  }

  const membersByKeluarga = new Map<string, string[]>();
  for (const j of jemaatRes.data) {
    if (!j.keluarga_id) continue;
    const list = membersByKeluarga.get(j.keluarga_id) ?? [];
    list.push(j.nama);
    membersByKeluarga.set(j.keluarga_id, list);
  }

  return {
    data: keluargaRes.data.map((k) => {
      const anggota = membersByKeluarga.get(k.id) ?? [];
      return { id: k.id, nama: k.nama, jumlahAnggota: anggota.length, anggota: anggota.join(", ") };
    }),
    error: null,
  };
}

export type KeluargaMember = {
  id: string;
  nomorAnggota: string | null;
  nama: string;
  wilayahNama: string | null;
  statusKeanggotaan: StatusKeanggotaan | null;
  noHp: string | null;
  hubunganKeluarga: string | null;
};

export type KeluargaDetail = {
  id: string;
  nama: string;
  anggota: KeluargaMember[];
};

export async function loadKeluargaDetail(
  supabase: ServerSupabase,
  id: string,
): Promise<{ data: KeluargaDetail | null; error: string | null }> {
  const keluargaRes = await supabase.from("keluarga").select("id, nama").eq("id", id).maybeSingle();
  if (keluargaRes.error) return { data: null, error: keluargaRes.error.message };
  if (!keluargaRes.data) return { data: null, error: null };

  const [anggotaRes, wilayahRes] = await Promise.all([
    supabase
      .from("jemaat")
      .select("id, nomor_anggota, nama, wilayah_id, status_keanggotaan, no_hp, hubungan_keluarga")
      .eq("keluarga_id", id)
      .order("nama"),
    supabase.from("wilayah").select("id, nama"),
  ]);
  const wilayahMap = new Map((wilayahRes.data ?? []).map((w) => [w.id, w.nama]));

  return {
    data: {
      id: keluargaRes.data.id,
      nama: keluargaRes.data.nama,
      anggota: (anggotaRes.data ?? []).map((a) => ({
        id: a.id,
        nomorAnggota: a.nomor_anggota,
        nama: a.nama,
        wilayahNama: a.wilayah_id ? (wilayahMap.get(a.wilayah_id) ?? null) : null,
        statusKeanggotaan: a.status_keanggotaan as StatusKeanggotaan | null,
        noHp: a.no_hp,
        hubunganKeluarga: a.hubungan_keluarga,
      })),
    },
    error: null,
  };
}

const namaSchema = z.object({ nama: requiredText("Nama Keluarga wajib diisi.", 200) });

/** POST /api/admin/keluarga */
export const createKeluarga = mutation({
  permission: ["warta", "update"],
  schema: namaSchema,
  status: 201,
  async run({ input, supabase }) {
    const { data, error } = await supabase.from("keluarga").insert({ nama: input.nama }).select().single();
    if (error) throw dbError(error, { unique: KELUARGA_UNIQUE_MESSAGE });
    return {
      data,
      log: { module: "jemaat", activity: `Menambah keluarga ${quote(input.nama)}` },
      revalidate: ["/admin/keluarga"],
    };
  },
});

/** PATCH /api/admin/keluarga/[id] (Ubah Nama) */
export const renameKeluarga = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: namaSchema,
  notFound: "Keluarga tidak ditemukan.",
  async run({ input, params, supabase }) {
    const current = await supabase.from("keluarga").select("nama").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: "Keluarga tidak ditemukan." });
    if (!current.data) throw new ApiError(404, "Keluarga tidak ditemukan.");

    const { data, error } = await supabase
      .from("keluarga")
      .update({ nama: input.nama })
      .eq("id", params.id)
      .select()
      .maybeSingle();
    if (error) throw dbError(error, { unique: KELUARGA_UNIQUE_MESSAGE, notFound: "Keluarga tidak ditemukan." });
    if (!data) throw new ApiError(404, "Keluarga tidak ditemukan.");

    const activity =
      current.data.nama === data.nama
        ? `Mengubah keluarga ${quote(data.nama)}`
        : `Mengubah nama keluarga ${quote(current.data.nama)} menjadi ${quote(data.nama)}`;
    return { data, log: { module: "jemaat", activity }, revalidate: ["/admin/keluarga", `/admin/keluarga/${params.id}`] };
  },
});

/** DELETE /api/admin/keluarga/[id] */
export const removeKeluarga = mutation({
  permission: ["warta", "update"],
  params: idParams,
  notFound: "Keluarga tidak ditemukan.",
  async run({ params, supabase }) {
    const current = await supabase.from("keluarga").select("nama").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: "Keluarga tidak ditemukan." });
    if (!current.data) throw new ApiError(404, "Keluarga tidak ditemukan.");

    const { error } = await supabase.rpc("delete_keluarga", { p_id: params.id });
    if (error) throw rpcError(error);
    return {
      data: { id: params.id },
      log: { module: "jemaat", activity: `Menghapus keluarga ${quote(current.data.nama)}` },
      revalidate: ["/admin/keluarga", "/admin/jemaat"],
    };
  },
});

const anggotaParams = z.object({ id: z.uuid(), jemaatId: z.uuid() });
const hubunganSchema = z.object({ hubunganKeluarga: optionalText(50) });
const tambahAnggotaSchema = z.object({ jemaatId: z.uuid(), hubunganKeluarga: optionalText(50) });

async function namesFor(supabase: ServerSupabase, keluargaId: string, jemaatId: string) {
  const [keluarga, jemaat] = await Promise.all([
    supabase.from("keluarga").select("nama").eq("id", keluargaId).maybeSingle(),
    supabase.from("jemaat").select("nama").eq("id", jemaatId).maybeSingle(),
  ]);
  return { keluargaNama: keluarga.data?.nama ?? "", jemaatNama: jemaat.data?.nama ?? "" };
}

/** POST /api/admin/keluarga/[id]/anggota (Tambah Anggota; also used to move someone from another family). */
export const addAnggota = mutation({
  permission: ["warta", "update"],
  params: idParams,
  schema: tambahAnggotaSchema,
  status: 201,
  notFound: "Keluarga tidak ditemukan.",
  async run({ input, params, supabase }) {
    const { keluargaNama, jemaatNama } = await namesFor(supabase, params.id, input.jemaatId);
    const { error } = await supabase.rpc("set_jemaat_keluarga", {
      p_jemaat_id: input.jemaatId,
      p_keluarga_id: params.id,
      p_hubungan_keluarga: input.hubunganKeluarga ?? undefined,
    });
    if (error) throw rpcError(error);
    return {
      data: { id: input.jemaatId },
      log: { module: "jemaat", activity: `Menambahkan ${quote(jemaatNama)} ke keluarga ${quote(keluargaNama)}` },
      revalidate: [`/admin/keluarga/${params.id}`, "/admin/keluarga", "/admin/jemaat", `/admin/jemaat/${input.jemaatId}`],
    };
  },
});

/** PATCH /api/admin/keluarga/[id]/anggota/[jemaatId] (the inline hubungan edit) */
export const updateAnggotaHubungan = mutation({
  permission: ["warta", "update"],
  params: anggotaParams,
  schema: hubunganSchema,
  notFound: "Jemaat tidak ditemukan.",
  async run({ input, params, supabase }) {
    const { keluargaNama, jemaatNama } = await namesFor(supabase, params.id, params.jemaatId);
    const { error } = await supabase.rpc("set_jemaat_keluarga", {
      p_jemaat_id: params.jemaatId,
      p_keluarga_id: params.id,
      p_hubungan_keluarga: input.hubunganKeluarga ?? undefined,
    });
    if (error) throw rpcError(error);
    return {
      data: { id: params.jemaatId },
      log: {
        module: "jemaat",
        activity: `Mengubah hubungan keluarga ${quote(jemaatNama)} di keluarga ${quote(keluargaNama)}`,
      },
      revalidate: [`/admin/keluarga/${params.id}`],
    };
  },
});

/** DELETE /api/admin/keluarga/[id]/anggota/[jemaatId] (Keluarkan) */
export const removeAnggota = mutation({
  permission: ["warta", "update"],
  params: anggotaParams,
  notFound: "Jemaat tidak ditemukan.",
  async run({ params, supabase }) {
    const { keluargaNama, jemaatNama } = await namesFor(supabase, params.id, params.jemaatId);
    // Omitting p_keluarga_id/p_hubungan_keluarga passes Postgres their default (null): detaches the jemaat.
    const { error } = await supabase.rpc("set_jemaat_keluarga", { p_jemaat_id: params.jemaatId });
    if (error) throw rpcError(error);
    return {
      data: { id: params.jemaatId },
      log: { module: "jemaat", activity: `Mengeluarkan ${quote(jemaatNama)} dari keluarga ${quote(keluargaNama)}` },
      revalidate: [`/admin/keluarga/${params.id}`, "/admin/keluarga", "/admin/jemaat", `/admin/jemaat/${params.jemaatId}`],
    };
  },
});

