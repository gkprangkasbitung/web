/**
 * Pemilihan, the panitia's routes (stage 14b; brief §18.4–18.5) against the
 * local stack, as real signed-in accounts:
 * - the fixture import (tests/fixtures/peserta-pemilihan-contoh.xlsx):
 *   preview, save, the values the database derives, resolution, and
 *   "Buka" refused while a row is unresolved;
 * - a second election opened through the route: no re-import afterwards,
 *   pemilihan:read alone sees turnout but no tally, the tally is live with
 *   the Portal Jemaat switch off, assisted voting (form number rules, the
 *   "not voted yet" list), the CSV and the berita acara figures equal
 *   hasil_suara / hasil_partisipasi;
 * - the activity log for every step, never with a choice.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { actAs, call, callForm, createTestUser, serviceClient, signIn, type Session } from "./harness";

const routes = await import("@/lib/pemilihan-routes");
const { createUsernameAccountsRoute } = await import("@/lib/username-accounts-routes");
const { loadBelumMemilih } = await import("@/lib/pemilihan/admin-data");
const { loadHasilPartisipasi, loadHasilSuara } = await import("@/lib/pemilihan/data");
const { hasilKeCsv } = await import("@/lib/pemilihan/ekspor");
const { turunkan } = await import("@/lib/pemilihan/impor");
const { buatXlsx, GABUNGAN_JUDUL, JUDUL_PANITIA } = await import("@/lib/pemilihan/xlsx-testing");
const { jakartaDateTimeParts } = await import("@/lib/dates");

const RUN = Date.now().toString(36);
const PASSWORD = "rahasia-panitia-123";
const svc = serviceClient();
const created = { users: [] as string[], jemaat: [] as string[], pemilihan: [] as string[], roles: [] as string[] };

let panitia: Session;
let panitiaId: string;
let pembaca: Session;
let viewer: Session;

const consoleOutput: string[] = [];

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? "no data");
  return result.data;
}

async function newJemaat(nama: string, alamat: string | null = null): Promise<string> {
  const { id } = must(await svc.from("jemaat").insert({ nama, alamat }).select("id").single());
  created.jemaat.push(id);
  return id;
}

function localPsql(sql: string) {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId || !/^[a-z0-9-]+$/.test(projectId)) throw new Error("No project_id in supabase/config.toml");
  execSync(`docker exec -i supabase_db_${projectId} psql -U postgres -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ["pipe", "ignore", "pipe"] });
}

async function logs(): Promise<string[]> {
  const { data } = await svc.from("activity_logs").select("activity").eq("user_id", panitiaId).order("created_at");
  return (data ?? []).map((row) => row.activity);
}

function fileForm(...files: { name: string; data: Uint8Array }[]): FormData {
  const form = new FormData();
  for (const file of files) form.append("file", new File([file.data as BlobPart], file.name));
  return form;
}

type Pratinjau = Awaited<ReturnType<typeof import("@/lib/pemilihan/impor").susunPratinjau>>;

beforeAll(async () => {
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "));
    });
  }

  const panitiaEmail = `panitia14b-${RUN}@test.local`;
  panitiaId = await createTestUser(panitiaEmail, PASSWORD, ["panitia_pemilihan"]);
  created.users.push(panitiaId);
  panitia = await signIn(panitiaEmail, PASSWORD);

  // A role with pemilihan:read only.
  const role = must(await svc.from("roles").insert({ name: `uji_pembaca_${RUN}`, description: "uji" }).select("id").single());
  created.roles.push(role.id);
  const perm = must(await svc.from("permissions").select("id").eq("resource", "pemilihan").eq("action", "read").single());
  must(await svc.from("role_permissions").insert({ role_id: role.id, permission_id: perm.id }).select("role_id"));
  const pembacaEmail = `pembaca14b-${RUN}@test.local`;
  const pembacaId = await createTestUser(pembacaEmail, PASSWORD, [`uji_pembaca_${RUN}`]);
  created.users.push(pembacaId);
  pembaca = await signIn(pembacaEmail, PASSWORD);

  viewer = await signIn("viewer@gkp.test");
});

afterAll(async () => {
  actAs(null);
  vi.restoreAllMocks();
  const ids = created.pemilihan.filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length) {
    const list = ids.map((id) => `'${id}'`).join(", ");
    localPsql(`
      begin;
      alter table public.pemilihan_suara disable trigger pemilihan_final;
      alter table public.pemilihan_partisipasi disable trigger pemilihan_final;
      alter table public.pemilihan disable trigger pemilihan_guard;
      alter table public.pemilihan_peserta disable trigger pemilihan_peserta_guard;
      alter table public.pemilihan_impor_baris disable trigger pemilihan_impor_baris_guard;
      delete from public.pemilihan_suara where pemilihan_id in (${list});
      delete from public.pemilihan_partisipasi where pemilihan_id in (${list});
      delete from public.pemilihan where id in (${list});
      alter table public.pemilihan_suara enable trigger pemilihan_final;
      alter table public.pemilihan_partisipasi enable trigger pemilihan_final;
      alter table public.pemilihan enable trigger pemilihan_guard;
      alter table public.pemilihan_peserta enable trigger pemilihan_peserta_guard;
      alter table public.pemilihan_impor_baris enable trigger pemilihan_impor_baris_guard;
      commit;
    `);
  }
  // Accounts created for jemaat by the panitia here.
  if (created.jemaat.length) {
    const { data } = await svc.from("profiles").select("id").in("jemaat_id", created.jemaat);
    for (const row of data ?? []) if (!created.users.includes(row.id)) created.users.push(row.id);
  }
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  if (created.jemaat.length) await svc.from("jemaat").delete().in("id", created.jemaat);
  for (const id of created.roles) await svc.from("roles").delete().eq("id", id);
  if (panitiaId) await svc.from("activity_logs").delete().eq("user_id", panitiaId);
});

async function buatPemilihan(nama: string): Promise<string> {
  actAs(panitia);
  const now = Date.now();
  const toWib = (ms: number) => {
    const { date, time } = jakartaDateTimeParts(new Date(ms));
    return { tanggal: date, jam: time };
  };
  const result = await call(routes.createPemilihan, {
    method: "POST",
    body: { nama, periode: "2027–2031", dibuka: toWib(now - 120_000), ditutup: toWib(now + 3 * 3_600_000) },
  });
  expect(result.status).toBe(201);
  const id = (result.body.data as unknown as { id: string }).id;
  created.pemilihan.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

describe("import of the panitia's file (fixture)", () => {
  let pemilihanA: string;
  const j: Record<string, string> = {};
  let pratinjau: Pratinjau;

  beforeAll(async () => {
    j.adi = await newJemaat("Bpk. Contoh Adi Pratama");
    j.budi = await newJemaat("Contoh Budi Santoso");
    j.citra = await newJemaat("Ibu Contoh Citra br Simanjuntak");
    j.dewi = await newJemaat("Sdri. Contoh Dewi Lestari");
    j.eko1 = await newJemaat("Contoh Eko", "Jl. Raya Rangkasbitung");
    j.eko2 = await newJemaat("Contoh Eko", "Bypass No. 3");
    j.fajar = await newJemaat("Bpk. Contoh Fajar Butar-Butar");
    j.gita = await newJemaat("Contoh Gita Ananda");
    j.hana = await newJemaat("Contoh Hana");
    j.ester = await newJemaat("Ibu Contoh Ester");
    j.indra = await newJemaat("Contoh Indra Wijaya");
    j.kartika = await newJemaat("Contoh Kartika Sari");
    j.lukas = await newJemaat("Contoh Lukas");
    j.maria = await newJemaat("Contoh Maria Ulfa");
    pemilihanA = await buatPemilihan(`Pemilihan Uji Fixture ${RUN}`);
  });

  it("only pemilihan:update may preview an import", async () => {
    const form = () => fileForm({ name: "peserta.xlsx", data: new Uint8Array(readFileSync("tests/fixtures/peserta-pemilihan-contoh.xlsx")) });
    for (const session of [viewer, pembaca]) {
      actAs(session);
      expect((await callForm(routes.pratinjauImporRoute, { method: "POST", form: form(), params: { id: pemilihanA } })).status).toBe(403);
    }
  });

  it("previews the fixture: two sheets, name in two sheets → Ambigu, unknown name → Tidak ditemukan, errors kept", async () => {
    actAs(panitia);
    const result = await callForm(routes.pratinjauImporRoute, {
      method: "POST",
      form: fileForm({ name: "peserta.xlsx", data: new Uint8Array(readFileSync("tests/fixtures/peserta-pemilihan-contoh.xlsx")) }),
      params: { id: pemilihanA },
    });
    expect(result.status).toBe(200);
    pratinjau = result.body.data as unknown as Pratinjau;
    expect(pratinjau.lembar.map((l) => [l.kelompokWilayah, l.jumlahBaris])).toEqual([
      ["Wil. 1", 9],
      ["Maja", 6],
    ]);
    const by = (kelompok: string, nama: string) => pratinjau.baris.find((r) => r.kelompokWilayah === kelompok && r.nama === nama)!;
    expect(by("Wil. 1", "Contoh Ester").kategori).toBe("ambigu");
    expect(by("Maja", "Contoh Ester").kategori).toBe("ambigu");
    expect(by("Wil. 1", "Contoh Eko")).toMatchObject({ kategori: "ambigu", calonJemaatIds: [j.eko2, j.eko1] });
    expect(by("Maja", "Contoh Joko").kategori).toBe("tidak_ditemukan");
    expect(by("Wil. 1", "Contoh Fajar Butar - butar")).toMatchObject({ kategori: "cocok", jemaatId: j.fajar });
    expect(by("Wil. 1", "Contoh Citra Br. Simanjuntak")).toMatchObject({ kategori: "cocok", jemaatId: j.citra });
    expect(by("Wil. 1", "Contoh Gita Ananda").kategori).toBe("error");
    expect(by("Wil. 1", "Contoh Hana").kategori).toBe("error");
    // Nothing was written.
    expect((await panitia.supabase.from("pemilihan_impor_baris").select("id").eq("pemilihan_id", pemilihanA)).data).toEqual([]);
  });

  it("refuses files that aren't .xlsx", async () => {
    actAs(panitia);
    const result = await callForm(routes.pratinjauImporRoute, {
      method: "POST",
      form: fileForm({ name: "peserta.csv", data: new TextEncoder().encode("No,Nama\n1,Adi") }),
      params: { id: pemilihanA },
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/bukan file \.xlsx/);
  });

  it("saves atomically; the database derives the same values as the preview", async () => {
    actAs(panitia);
    const result = await call(routes.simpanImpor, { method: "POST", body: { baris: pratinjau.baris, jumlahLembar: 2 }, params: { id: pemilihanA } });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ jumlahBaris: 15, jumlahBeres: 8, jumlahPeserta: 8 });

    const stored = must(
      await panitia.supabase
        .from("pemilihan_impor_baris")
        .select("nama, kelompok_wilayah, tanda_memilih, tanda_dipilih, tanda_tidak_dipilih, dapat_memilih, dapat_dipilih, perlu_konfirmasi_memilih")
        .eq("pemilihan_id", pemilihanA),
    );
    expect(stored).toHaveLength(15);
    for (const row of stored) {
      const t = turunkan({ memilih: row.tanda_memilih as never, dipilih: row.tanda_dipilih as never, tidakDipilih: row.tanda_tidak_dipilih as never });
      expect({ m: row.dapat_memilih, d: row.dapat_dipilih, k: row.perlu_konfirmasi_memilih }, row.nama).toEqual({
        m: t.dapatMemilih,
        d: t.dapatDipilih,
        k: t.perluKonfirmasiMemilih,
      });
    }
    const budi = must(await svc.from("pemilihan_peserta").select("kelompok_wilayah, alasan_tidak_dapat_dipilih").eq("pemilihan_id", pemilihanA).eq("jemaat_id", j.budi!).single());
    expect(budi).toEqual({ kelompok_wilayah: "Wil. 1", alasan_tidak_dapat_dipilih: "Usia >65" });
    expect((await logs()).at(-1)).toBe(
      `Mengimpor peserta pemilihan "Pemilihan Uji Fixture ${RUN}": 15 baris dari 2 sheet (9 cocok, 3 ambigu, 1 tidak ditemukan, 2 error)`,
    );
  });

  it("Buka is refused while rows are unresolved", async () => {
    actAs(panitia);
    const result = await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "buka" }, params: { id: pemilihanA } });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Masih ada 7 baris impor peserta yang belum beres. Selesaikan dulu sebelum membuka pemilihan.");
    expect(must(await svc.from("pemilihan").select("status").eq("id", pemilihanA).single()).status).toBe("draft");
  });

  it("resolving rows: one jemaat per list, friendly refusal, logged", async () => {
    actAs(panitia);
    const rows = must(await panitia.supabase.from("pemilihan_impor_baris").select("id, nama, kelompok_wilayah").eq("pemilihan_id", pemilihanA));
    const id = (kelompok: string, nama: string) => rows.find((r) => r.kelompok_wilayah === kelompok && r.nama === nama)!.id;
    const patch = (barisId: string, body: Record<string, unknown>) =>
      call(routes.perbaruiBarisImpor, { method: "PATCH", body, params: { id: pemilihanA, barisId } });

    expect((await patch(id("Wil. 1", "Contoh Ester"), { jemaatId: j.ester })).status).toBe(200);
    const dua = await patch(id("Maja", "Contoh Ester"), { jemaatId: j.ester });
    expect(dua.status).toBe(400);
    expect(dua.body.error).toBe("Jemaat ini sudah dipakai di baris lain. Satu jemaat hanya boleh muncul sekali.");
    expect((await patch(id("Maja", "Contoh Ester"), { dikeluarkan: true })).status).toBe(200);
    expect((await patch(id("Wil. 1", "Contoh Eko"), { jemaatId: j.eko2 })).status).toBe(200);
    expect((await patch(id("Maja", "Contoh Joko"), { dikeluarkan: true })).status).toBe(200);
    expect((await patch(id("Wil. 1", "Contoh Gita Ananda"), { dapatDipilih: true })).status).toBe(200);
    expect((await patch(id("Wil. 1", "Contoh Hana"), { dapatDipilih: false })).status).toBe(200);
    expect((await patch(id("Maja", "Contoh Maria Ulfa"), { dapatMemilih: false })).status).toBe(200);
    expect((await patch(id("Maja", "Contoh Lukas"), {})).status).toBe(400);

    const belum = must(await panitia.supabase.from("pemilihan_impor_baris").select("nama").eq("pemilihan_id", pemilihanA).eq("beres", false));
    expect(belum).toEqual([]);
    expect(await logs()).toContain(
      `Memperbarui baris impor "Contoh Eko" (Wil. 1, baris 12) pada pemilihan "Pemilihan Uji Fixture ${RUN}": jemaat "Contoh Eko"`,
    );

    // Every row is resolved; the fixture just doesn't have 10 candidates.
    const buka = await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "buka" }, params: { id: pemilihanA } });
    expect(buka.status).toBe(400);
    expect(buka.body.error).toMatch(/^Calon yang dapat dipilih baru \d+ orang/);
  });
});

// ---------------------------------------------------------------------------
// An election run end to end
// ---------------------------------------------------------------------------

describe("an election opened, assisted, closed", () => {
  let pemilihanB: string;
  const calon: string[] = [];
  let sendiri: string;
  let tanpaAkun: string;
  let lain: string;

  beforeAll(async () => {
    for (let i = 1; i <= 12; i++) calon.push(await newJemaat(`Uji Calon Panitia ${String(i).padStart(2, "0")} ${RUN}`));
    sendiri = await newJemaat(`Uji Panitia Sendiri ${RUN}`);
    tanpaAkun = await newJemaat(`Uji Pemilih Tanpa Akun ${RUN}`);
    lain = await newJemaat(`Uji Pemilih Lain ${RUN}`);
    must(await svc.from("profiles").update({ jemaat_id: sendiri }).eq("id", panitiaId).select("id"));
    pemilihanB = await buatPemilihan(`Pemilihan Uji Penuh ${RUN}`);

    const rows = [
      ...JUDUL_PANITIA,
      ...calon.map((_, i) => [i + 1, `Uji Calon Panitia ${String(i + 1).padStart(2, "0")} ${RUN}`, "√", "√", null, null, null, null, null]),
      [13, `Uji Panitia Sendiri ${RUN}`, "Ya", null, "Ya", null, ">65", null, "Panitia"],
      [14, `Uji Pemilih Tanpa Akun ${RUN}`, 1, 0, 1, null, null, null, null],
      [15, `Uji Pemilih Lain ${RUN}`, true, false, true, null, null, null, null],
    ];
    actAs(panitia);
    const preview = await callForm(routes.pratinjauImporRoute, {
      method: "POST",
      form: fileForm({ name: "Teluk Lada.xlsx", data: buatXlsx([{ name: "Sheet1", rows, merges: GABUNGAN_JUDUL }]) }),
      params: { id: pemilihanB },
    });
    expect(preview.status).toBe(200);
    const data = preview.body.data as unknown as Pratinjau;
    expect(data.baris.every((r) => r.kategori === "cocok" && r.kelompokWilayah === "Teluk Lada")).toBe(true);
    const saved = await call(routes.simpanImpor, { method: "POST", body: { baris: data.baris, jumlahLembar: 1 }, params: { id: pemilihanB } });
    expect(saved.body.data).toEqual({ jumlahBaris: 15, jumlahBeres: 15, jumlahPeserta: 15 });
  });

  it("opens through the route, logged; then the list is frozen", async () => {
    actAs(panitia);
    const buka = await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "buka" }, params: { id: pemilihanB } });
    expect(buka.status).toBe(200);
    expect((await logs()).at(-1)).toBe(`Membuka pemilihan "Pemilihan Uji Penuh ${RUN}"`);

    const again = await call(routes.simpanImpor, {
      method: "POST",
      body: {
        baris: [
          {
            sumber: "x › y", kelompokWilayah: "y", baris: 8, nomor: null, nama: "Siapa", domisili: null, tandaMemilih: "ya",
            tandaDipilih: "ya", tandaTidakDipilih: "kosong", usia: null, keterangan: null, kategori: "cocok", calonJemaatIds: [lain], jemaatId: lain, catatan: [],
          },
        ],
        jumlahLembar: 1,
      },
      params: { id: pemilihanB },
    });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("Daftar peserta tidak bisa diubah setelah pemilihan dibuka.");
    const preview = await callForm(routes.pratinjauImporRoute, {
      method: "POST",
      form: fileForm({ name: "a.xlsx", data: buatXlsx([{ name: "A", rows: JUDUL_PANITIA }]) }),
      params: { id: pemilihanB },
    });
    expect(preview.status).toBe(400);
    const edit = await call(routes.updatePemilihan, {
      method: "PATCH",
      body: { nama: "Ganti", periode: null, dibuka: null, ditutup: null },
      params: { id: pemilihanB },
    });
    expect(edit.status).toBe(400);
    expect(must(await svc.from("pemilihan_peserta").select("jemaat_id").eq("pemilihan_id", pemilihanB))).toHaveLength(15);
  });

  it("assisted voting: required form number, friendly duplicate, own record and voted voters not listed", async () => {
    actAs(panitia);
    const belumAwal = await loadBelumMemilih(panitia.supabase, pemilihanB);
    expect(belumAwal.map((p) => p.jemaatId)).not.toContain(sendiri);
    expect(belumAwal.map((p) => p.jemaatId)).toContain(tanpaAkun);

    const ballot = { penatua: calon.slice(0, 10), ppj: calon.slice(0, 5) };
    const bantu = (body: Record<string, unknown>) => call(routes.bantuRoute, { method: "POST", body, params: { id: pemilihanB } });

    const tanpaNomor = await bantu({ jemaatId: tanpaAkun, nomorFormulir: "  ", ...ballot });
    expect(tanpaNomor.status).toBe(400);
    expect(tanpaNomor.body.error).toBe("Nomor formulir wajib diisi.");

    const sukses = await bantu({ jemaatId: tanpaAkun, nomorFormulir: "F-001", ...ballot });
    expect(sukses.status).toBe(200);
    expect((await logs()).at(-1)).toBe("Membantu pemilih memberikan suara: Uji Pemilih Tanpa Akun " + RUN + " (formulir F-001)");

    const ganda = await bantu({ jemaatId: lain, nomorFormulir: "f-001", ...ballot });
    expect(ganda.status).toBe(400);
    expect(ganda.body).toMatchObject({ error: 'Nomor formulir "f-001" sudah dipakai pada pemilihan ini.', reason: "formulir_terpakai" });

    const diriSendiri = await bantu({ jemaatId: sendiri, nomorFormulir: "F-002", ...ballot });
    expect(diriSendiri.status).toBe(400);

    const belum = await loadBelumMemilih(panitia.supabase, pemilihanB);
    expect(belum.map((p) => p.jemaatId)).not.toContain(tanpaAkun);
    expect(belum).toHaveLength(belumAwal.length - 1);
  });

  it("pemilihan:read alone sees turnout but no tally; the tally is live for pemilihan_hasil:read with the portal switch off", async () => {
    actAs(pembaca);
    const reader = await call(routes.hasilRoute, { method: "GET", params: { id: pemilihanB } });
    expect(reader.status).toBe(200);
    const readerData = reader.body.data as unknown as { partisipasi: { sudahMemilih: number; dibantu: number }; suara: unknown };
    expect(readerData.partisipasi).toMatchObject({ sudahMemilih: 1, dibantu: 1 });
    expect(readerData.suara).toBeNull();
    expect((await pembaca.supabase.rpc("hasil_suara", { p_pemilihan_id: pemilihanB })).error?.code).toBe("42501");

    actAs(viewer);
    expect((await call(routes.hasilRoute, { method: "GET", params: { id: pemilihanB } })).status).toBe(403);

    actAs(panitia);
    const live = await call(routes.hasilRoute, { method: "GET", params: { id: pemilihanB } });
    const liveData = live.body.data as unknown as { tampilkanHasil: boolean; status: string; suara: { jumlahSuara: number }[] };
    expect(liveData).toMatchObject({ status: "dibuka", tampilkanHasil: false });
    expect(liveData.suara).toHaveLength(24);
    expect(liveData.suara.reduce((sum, row) => sum + row.jumlahSuara, 0)).toBe(15);
  });

  it("the Portal Jemaat switch, logged both ways", async () => {
    actAs(pembaca);
    expect((await call(routes.ubahTampilkanHasil, { method: "PATCH", body: { aktif: true }, params: { id: pemilihanB } })).status).toBe(403);
    actAs(panitia);
    expect((await call(routes.ubahTampilkanHasil, { method: "PATCH", body: { aktif: true }, params: { id: pemilihanB } })).status).toBe(200);
    expect((await call(routes.ubahTampilkanHasil, { method: "PATCH", body: { aktif: false }, params: { id: pemilihanB } })).status).toBe(200);
    expect((await logs()).slice(-2)).toEqual([
      `Menyalakan "Tampilkan hasil sementara di Portal Jemaat" untuk pemilihan "Pemilihan Uji Penuh ${RUN}"`,
      `Mematikan "Tampilkan hasil sementara di Portal Jemaat" untuk pemilihan "Pemilihan Uji Penuh ${RUN}"`,
    ]);
  });

  it("the panitia creates a username account for a voter without one, but not for a non-voter", async () => {
    actAs(panitia);
    const ok = await call(createUsernameAccountsRoute, {
      method: "POST",
      body: { items: [{ jemaatId: lain, username: `uji.lain.${RUN}` }] },
    });
    expect(ok.status).toBe(201);
    const outsider = await newJemaat(`Uji Bukan Pemilih ${RUN}`);
    const refused = await call(createUsernameAccountsRoute, {
      method: "POST",
      body: { items: [{ jemaatId: outsider, username: `uji.luar.${RUN}` }] },
    });
    expect(refused.status).toBe(400);
    expect((await svc.from("profiles").select("id").eq("jemaat_id", outsider)).data).toEqual([]);
  });

  it("closes and announces; the CSV and the berita acara figures equal hasil_suara / hasil_partisipasi", async () => {
    actAs(panitia);
    expect((await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "umumkan" }, params: { id: pemilihanB } })).status).toBe(400);
    expect((await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "tutup" }, params: { id: pemilihanB } })).status).toBe(200);
    expect((await call(routes.bantuRoute, {
      method: "POST",
      body: { jemaatId: lain, nomorFormulir: "F-009", penatua: calon.slice(0, 10), ppj: calon.slice(0, 5) },
      params: { id: pemilihanB },
    })).status).toBe(400);

    const suara = await loadHasilSuara(panitia.supabase, pemilihanB);
    const direct = must(await panitia.supabase.rpc("hasil_suara", { p_pemilihan_id: pemilihanB }));
    const csv = hasilKeCsv(suara).split("\r\n");
    expect(csv).toHaveLength(direct.length + 1);
    direct.forEach((row, i) => {
      expect(csv[i + 1]).toContain(`"${row.kontes_nama}","${row.peringkat}","${row.nama_tampilan}","${row.jumlah_suara}"`);
    });

    const partisipasi = await loadHasilPartisipasi(panitia.supabase, pemilihanB);
    const directPartisipasi = must(await panitia.supabase.rpc("hasil_partisipasi", { p_pemilihan_id: pemilihanB }))[0]!;
    expect(partisipasi).toMatchObject({
      totalPemilih: directPartisipasi.total_pemilih,
      sudahMemilih: directPartisipasi.sudah_memilih,
      mandiri: directPartisipasi.mandiri,
      dibantu: directPartisipasi.dibantu,
    });
    expect(partisipasi.dibantuPerPanitia).toEqual([{ userId: panitiaId, nama: expect.any(String), jumlah: 1 }]);

    expect((await call(routes.ubahStatusPemilihan, { method: "POST", body: { aksi: "umumkan" }, params: { id: pemilihanB } })).status).toBe(200);
    expect((await logs()).slice(-2)).toEqual([`Menutup pemilihan "Pemilihan Uji Penuh ${RUN}"`, `Mengumumkan hasil pemilihan "Pemilihan Uji Penuh ${RUN}"`]);
  });

  it("no log line and no console output names a choice", async () => {
    const names = calon.map((_, i) => `Uji Calon Panitia ${String(i + 1).padStart(2, "0")} ${RUN}`);
    const all = (await logs()).join("\n") + "\n" + consoleOutput.join("\n");
    for (let i = 0; i < 10; i++) {
      expect(all).not.toContain(calon[i]!);
    }
    // The import log carries counts, never names.
    for (const nama of names) expect((await logs()).join("\n")).not.toContain(nama);
  });
});
