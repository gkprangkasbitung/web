import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { quote } from "@/lib/activity-log";
import { fail, ok, readLimitedBody } from "@/lib/api";
import { ApiError, mutation, rpcError, type RevalidateTarget } from "@/lib/api-mutation";
import { can } from "@/lib/auth/permissions";
import { requirePermissionApi } from "@/lib/auth/session";
import { jakartaDateTime } from "@/lib/dates";
import { loadJemaatPilihan, toBarisImpor } from "@/lib/pemilihan/admin-data";
import {
  IMPOR_FILE,
  pemilihanInputSchema,
  perbaruiBarisInputSchema,
  simpanImporInputSchema,
  STATUS_TRANSISI,
  statusInputSchema,
  tampilkanHasilInputSchema,
  type BarisImporRow,
  type HasilLive,
} from "@/lib/pemilihan/admin-types";
import { loadHasilPartisipasi, loadHasilSuara, PemilihanError } from "@/lib/pemilihan/data";
import { susunPratinjau, type PratinjauImpor } from "@/lib/pemilihan/impor";
import { berikanSuaraDibantu } from "@/lib/pemilihan/mutations";
import { isPemilihanErrorCode, type PemilihanStatus } from "@/lib/pemilihan/types";
import { readXlsx, XlsxError, type XlsxSheet } from "@/lib/pemilihan/xlsx";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams } from "@/lib/validation";

/**
 * Pemilihan, the panitia's routes (brief §18.4–18.5, stage 14b). Every
 * write goes through RLS or a 0040 function with the user's own session,
 * and is logged under module `pemilihan` without any choice.
 */

const NOT_FOUND = "Pemilihan tidak ditemukan.";
const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";

const REVALIDATE = [{ path: "/admin/pemilihan", type: "layout" }] as const satisfies readonly RevalidateTarget[];

/**
 * 0038/0040's PM codes carry hand-written messages (never a choice), so
 * they are shown as they are; everything else as `rpcError`.
 */
function pmError(error: Pick<PostgrestError, "code" | "message">): Error {
  if (isPemilihanErrorCode(error.code)) return new ApiError(400, error.message);
  if (error.code === "23514") return new ApiError(400, "Data yang dikirim tidak valid.");
  return rpcError(error);
}

async function namaPemilihan(supabase: ServerSupabase, id: string): Promise<{ nama: string; status: PemilihanStatus }> {
  const { data, error } = await supabase.from("pemilihan").select("nama, status").eq("id", id).maybeSingle();
  if (error) throw pmError(error);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return { nama: data.nama, status: data.status as PemilihanStatus };
}

function jadwal(input: { tanggal: string; jam: string } | null): string | null {
  return input ? jakartaDateTime(input.tanggal, input.jam) : null;
}

// ---------------------------------------------------------------------------
// Elections
// ---------------------------------------------------------------------------

/** POST /api/admin/pemilihan (pemilihan:create): a new draft. */
export const createPemilihan = mutation({
  permission: ["pemilihan", "create"],
  schema: pemilihanInputSchema,
  status: 201,
  run: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("pemilihan")
      .insert({ nama: input.nama, periode: input.periode, dibuka_pada: jadwal(input.dibuka), ditutup_pada: jadwal(input.ditutup) })
      .select("id, nama")
      .single();
    if (error) throw pmError(error);
    return {
      data: { id: data.id },
      log: { module: "pemilihan", activity: `Membuat pemilihan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/pemilihan/[id] (pemilihan:update): name, period, schedule; the database refuses after draft. */
export const updatePemilihan = mutation({
  permission: ["pemilihan", "update"],
  params: idParams,
  schema: pemilihanInputSchema,
  notFound: NOT_FOUND,
  run: async ({ input, params, supabase }) => {
    const { data, error } = await supabase
      .from("pemilihan")
      .update({ nama: input.nama, periode: input.periode, dibuka_pada: jadwal(input.dibuka), ditutup_pada: jadwal(input.ditutup) })
      .eq("id", params.id)
      .select("id, nama")
      .maybeSingle();
    if (error) throw pmError(error);
    if (!data) throw new ApiError(404, NOT_FOUND);
    return {
      data: { id: data.id },
      log: { module: "pemilihan", activity: `Mengubah pemilihan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** DELETE /api/admin/pemilihan/[id] (pemilihan:delete): drafts only (the database refuses otherwise). */
export const deletePemilihan = mutation({
  permission: ["pemilihan", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  run: async ({ params, supabase }) => {
    const { data, error } = await supabase.from("pemilihan").delete().eq("id", params.id).select("nama").maybeSingle();
    if (error) throw pmError(error);
    if (!data) throw new ApiError(404, NOT_FOUND);
    return {
      data: null,
      log: { module: "pemilihan", activity: `Menghapus pemilihan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

const STATUS_LOG = { buka: "Membuka pemilihan", tutup: "Menutup pemilihan", umumkan: "Mengumumkan hasil pemilihan" } as const;

/**
 * POST /api/admin/pemilihan/[id]/status (pemilihan:update): buka / tutup /
 * umumkan. The update only applies from the expected status, so a stale
 * page can't skip a step; the database checks the rest (0038, 0040).
 */
export const ubahStatusPemilihan = mutation({
  permission: ["pemilihan", "update"],
  params: idParams,
  schema: statusInputSchema,
  notFound: NOT_FOUND,
  run: async ({ input, params, supabase }) => {
    const { dari, ke } = STATUS_TRANSISI[input.aksi];
    const { data, error } = await supabase
      .from("pemilihan")
      .update({ status: ke })
      .eq("id", params.id)
      .eq("status", dari)
      .select("nama, status")
      .maybeSingle();
    if (error) throw pmError(error);
    if (!data) {
      const now = await namaPemilihan(supabase, params.id);
      throw new ApiError(400, `Status pemilihan ini sudah berubah menjadi "${now.status}". Muat ulang halaman.`);
    }
    return {
      data: { status: data.status },
      log: { module: "pemilihan", activity: `${STATUS_LOG[input.aksi]} ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

/** PATCH /api/admin/pemilihan/[id]/tampilkan-hasil (pemilihan:update): the Portal Jemaat switch (§18.6), at any time. */
export const ubahTampilkanHasil = mutation({
  permission: ["pemilihan", "update"],
  params: idParams,
  schema: tampilkanHasilInputSchema,
  notFound: NOT_FOUND,
  run: async ({ input, params, supabase }) => {
    const { data, error } = await supabase
      .from("pemilihan")
      .update({ tampilkan_hasil_saat_berjalan: input.aktif })
      .eq("id", params.id)
      .select("nama, tampilkan_hasil_saat_berjalan")
      .maybeSingle();
    if (error) throw pmError(error);
    if (!data) throw new ApiError(404, NOT_FOUND);
    const verb = data.tampilkan_hasil_saat_berjalan ? "Menyalakan" : "Mematikan";
    return {
      data: { aktif: data.tampilkan_hasil_saat_berjalan },
      log: { module: "pemilihan", activity: `${verb} "Tampilkan hasil sementara di Portal Jemaat" untuk pemilihan ${quote(data.nama)}` },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/pemilihan/[id]/impor/pratinjau (pemilihan:update):
 * multipart, one or more `file` fields (.xlsx). Reads and matches; writes
 * nothing, so nothing is logged. Draft only.
 */
export async function pratinjauImporRoute(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<NextResponse> {
  const auth = await requirePermissionApi("pemilihan", "update");
  if (!auth.ok) return auth.response;
  const params = idParams.safeParse(await context.params);
  if (!params.success) return fail(NOT_FOUND, 404);

  try {
    const pemilihan = await namaPemilihan(auth.supabase, params.data.id);
    if (pemilihan.status !== "draft") return fail("Daftar peserta tidak bisa diubah setelah pemilihan dibuka.", 400);
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status);
    throw error;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return fail("Data yang dikirim tidak valid.", 400);
  const body = await readLimitedBody(request, IMPOR_FILE.totalBytes + 64 * 1024);
  if (!body) return fail("Total ukuran file maksimal 4 MB.", 400);

  let files: File[];
  try {
    const form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
    files = form.getAll("file").filter((value): value is File => value instanceof File);
  } catch {
    return fail("Data yang dikirim tidak valid.", 400);
  }
  if (files.length === 0) return fail("Pilih minimal satu file .xlsx.", 400);
  if (files.length > IMPOR_FILE.maxFiles) return fail(`Maksimal ${IMPOR_FILE.maxFiles} file sekali impor.`, 400);

  const read: { name: string; sheets: XlsxSheet[] }[] = [];
  for (const file of files) {
    const name = file.name.replace(/[\\/]/g, "_").slice(0, 150) || "file.xlsx";
    if (!/\.xlsx$/i.test(name)) return fail(`"${name}" bukan file .xlsx. Simpan sebagai Excel Workbook (.xlsx).`, 400);
    if (file.size > IMPOR_FILE.maxBytes) return fail(`"${name}" lebih dari 1 MB.`, 400);
    try {
      read.push({ name, sheets: readXlsx(new Uint8Array(await file.arrayBuffer())) });
    } catch (error) {
      if (error instanceof XlsxError) return fail(`${name}: ${error.message}`, 400);
      console.error("[pemilihan] reading an import file failed:", error instanceof Error ? error.name : typeof error);
      return fail(`${name}: file tidak bisa dibaca.`, 400);
    }
  }

  try {
    const jemaat = await loadJemaatPilihan(auth.supabase);
    const pratinjau: PratinjauImpor = susunPratinjau(read, jemaat);
    if (pratinjau.baris.length === 0) {
      return fail("Tidak ada baris peserta yang terbaca. Periksa judul kolom No dan Nama.", 400);
    }
    return ok(pratinjau);
  } catch (error) {
    if (error instanceof PemilihanError) return fail(error.message, error.reason === "akses" ? 403 : 500);
    console.error("[pemilihan] import preview failed:", error instanceof Error ? error.name : typeof error);
    return fail(GENERIC_ERROR, 500);
  }
}

/** POST /api/admin/pemilihan/[id]/impor (pemilihan:update): saves the previewed rows, replacing the whole list atomically. */
export const simpanImpor = mutation({
  permission: ["pemilihan", "update"],
  params: idParams,
  schema: simpanImporInputSchema,
  notFound: NOT_FOUND,
  run: async ({ input, params, supabase }) => {
    const { nama } = await namaPemilihan(supabase, params.id);
    const { data, error } = await supabase.rpc("impor_peserta_pemilihan", {
      p_pemilihan_id: params.id,
      p_baris: input.baris.map((row) => ({
        sumber: row.sumber,
        kelompok_wilayah: row.kelompokWilayah,
        baris: row.baris,
        nomor: row.nomor,
        nama: row.nama,
        domisili: row.domisili,
        tanda_memilih: row.tandaMemilih,
        tanda_dipilih: row.tandaDipilih,
        tanda_tidak_dipilih: row.tandaTidakDipilih,
        usia: row.usia,
        keterangan: row.keterangan,
        kategori: row.kategori,
        calon_jemaat_ids: row.calonJemaatIds,
        catatan: row.catatan,
        jemaat_id: row.jemaatId,
      })),
    });
    if (error) throw pmError(error);
    const hasil = data?.[0] ?? { jumlah_baris: 0, jumlah_beres: 0, jumlah_peserta: 0 };

    const per = (k: string) => input.baris.filter((row) => row.kategori === k).length;
    const rincian = `${per("cocok")} cocok, ${per("ambigu")} ambigu, ${per("tidak_ditemukan")} tidak ditemukan, ${per("error")} error`;
    return {
      data: { jumlahBaris: hasil.jumlah_baris, jumlahBeres: hasil.jumlah_beres, jumlahPeserta: hasil.jumlah_peserta },
      log: {
        module: "pemilihan",
        activity: `Mengimpor peserta pemilihan ${quote(nama)}: ${hasil.jumlah_baris} baris dari ${input.jumlahLembar} sheet (${rincian})`,
      },
      revalidate: REVALIDATE,
    };
  },
});

const barisParams = z.object({ id: z.uuid(), barisId: z.uuid() });

/** PATCH /api/admin/pemilihan/[id]/impor/[barisId] (pemilihan:update): resolve one row. */
export const perbaruiBarisImpor = mutation({
  permission: ["pemilihan", "update"],
  params: barisParams,
  schema: perbaruiBarisInputSchema,
  notFound: "Baris impor tidak ditemukan.",
  run: async ({ input, params, supabase }) => {
    const { nama } = await namaPemilihan(supabase, params.id);
    const owner = await supabase.from("pemilihan_impor_baris").select("pemilihan_id").eq("id", params.barisId).maybeSingle();
    if (owner.error) throw pmError(owner.error);
    if (owner.data?.pemilihan_id !== params.id) throw new ApiError(404, "Baris impor tidak ditemukan.");

    const { data, error } = await supabase.rpc("perbarui_baris_impor", {
      p_baris_id: params.barisId,
      ...(input.jemaatId !== undefined ? { p_jemaat_id: input.jemaatId } : {}),
      ...(input.dapatMemilih !== undefined ? { p_dapat_memilih: input.dapatMemilih } : {}),
      ...(input.dapatDipilih !== undefined ? { p_dapat_dipilih: input.dapatDipilih } : {}),
      ...(input.dikeluarkan !== undefined ? { p_dikeluarkan: input.dikeluarkan } : {}),
    });
    if (error) throw pmError(error);
    const row = (data as unknown as Parameters<typeof toBarisImpor>[0][] | null)?.[0];
    if (!row) throw new ApiError(404, "Baris impor tidak ditemukan.");
    const baris: BarisImporRow = toBarisImpor(row);

    let jemaatNama: string | null = null;
    if (input.jemaatId) {
      const jemaat = await supabase.rpc("pemilihan_jemaat_akun", { p_jemaat_ids: [input.jemaatId] });
      jemaatNama = jemaat.data?.[0]?.nama ?? null;
    }
    const perubahan = [
      input.jemaatId ? `jemaat ${quote(jemaatNama ?? "?")}` : null,
      input.dapatMemilih !== undefined ? `dapat memilih: ${input.dapatMemilih ? "ya" : "tidak"}` : null,
      input.dapatDipilih !== undefined ? (input.dapatDipilih ? "dapat dipilih" : "tidak dapat dipilih") : null,
      input.dikeluarkan === true ? "dikeluarkan dari daftar" : input.dikeluarkan === false ? "dikembalikan ke daftar" : null,
    ].filter(Boolean);
    return {
      data: baris,
      log: {
        module: "pemilihan",
        activity: `Memperbarui baris impor ${quote(baris.nama)} (${baris.kelompokWilayah}, baris ${baris.baris}) pada pemilihan ${quote(nama)}: ${perubahan.join(", ")}`,
      },
      revalidate: REVALIDATE,
    };
  },
});

// ---------------------------------------------------------------------------
// Live results
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/pemilihan/[id]/hasil (pemilihan:read): what the live page
 * polls every 10 s. Tallies only with pemilihan_hasil:read, in any status,
 * whatever the Portal Jemaat switch says (§18.4). Never who voted for whom.
 */
export async function hasilRoute(
  _request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<NextResponse> {
  const auth = await requirePermissionApi("pemilihan", "read");
  if (!auth.ok) return auth.response;
  const params = idParams.safeParse(await context.params);
  if (!params.success) return fail(NOT_FOUND, 404);
  const id = params.data.id;

  try {
    const { data, error } = await auth.supabase
      .from("pemilihan")
      .select("status, tampilkan_hasil_saat_berjalan")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(NOT_FOUND, 404);
    const [partisipasi, suara] = await Promise.all([
      loadHasilPartisipasi(auth.supabase, id),
      can(auth.user, "pemilihan_hasil", "read") ? loadHasilSuara(auth.supabase, id) : Promise.resolve(null),
    ]);
    const response = ok({
      status: data.status as PemilihanStatus,
      tampilkanHasil: data.tampilkan_hasil_saat_berjalan,
      partisipasi,
      suara,
      waktu: new Date().toISOString(),
    } satisfies HasilLive);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof PemilihanError) return fail(error.message, error.reason === "akses" ? 403 : 500);
    console.error("[pemilihan] hasil failed:", (error as { code?: string })?.code ?? (error instanceof Error ? error.name : typeof error));
    return fail(GENERIC_ERROR, 500);
  }
}

// ---------------------------------------------------------------------------
// Assisted voting
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/pemilihan/[id]/bantu (pemilihan_bantu:create): records a
 * paper ballot (§18.5) through `berikanSuaraDibantu`, which validates,
 * writes, and logs "Membantu pemilih memberikan suara: {nama} (formulir
 * {nomor})". The body is never logged.
 */
export async function bantuRoute(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<NextResponse> {
  const auth = await requirePermissionApi("pemilihan_bantu", "create");
  if (!auth.ok) return auth.response;
  const params = idParams.safeParse(await context.params);
  if (!params.success) return fail(NOT_FOUND, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Data yang dikirim tidak valid.", 400);
  }
  const input = body && typeof body === "object" ? { ...(body as Record<string, unknown>), pemilihanId: params.data.id } : body;

  const result = await berikanSuaraDibantu({ supabase: auth.supabase, user: auth.user }, input);
  if (!result.ok) {
    const status = result.reason === "akses" ? 403 : result.reason === "tidak_ditemukan" ? 404 : result.reason === "gagal" ? 500 : 400;
    const response = NextResponse.json({ error: result.message, reason: result.reason }, { status });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = ok(result.data);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
