/**
 * Portal Jemaat backend (stage 13a; brief §17.1, §17.2, §17.4): the portal
 * functions over the real Supabase REST API with each account's own JWT,
 * the lib/portal loaders and mutations, the admin decision RPCs, and
 * "Hapus akun login".
 *
 * Jemaat A and her son A2 share a family; jemaat B is in another one. B's
 * values carry markers (Budi, 0822…, UJI-PB, 777777, "Tempat Budi") so any
 * leak to A shows up in the response text.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actAs, createTestUser, env, serviceClient, signIn, type Session } from "./harness";

const { loadKeluargaSaya, loadKomisiSaya, loadPelayananSaya, loadPengajuanSaya, loadPengaturanPortal, loadPersembahanSaya, loadProfilSaya } =
  await import("@/lib/portal/data");
const { ajukanPerubahan, batalkanPengajuan } = await import("@/lib/portal/mutations");
const { hapusAkunLogin } = await import("@/app/jemaat/actions");

const RUN = Date.now().toString(36);
const PASSWORD = "rahasia-portal-data-123";
const YEAR = 2032;
const RANGE = { dari: `${YEAR}-01-01`, sampai: `${YEAR}-12-31` };
const B_MARKERS = /Budi|0822|UJI-PB|777777|55555/;
const PASTORAL_MARKER = `PASTORAL-${RUN}`;

const svc = serviceClient();
const created = {
  users: [] as string[],
  jemaat: [] as string[],
  keluarga: [] as string[],
  komisi: [] as string[],
  items: [] as string[],
  tempat: [] as string[],
  transactions: [] as string[],
};
let settingBefore = false;

type Account = { id: string; email: string; session: Session; token: string };

let jemaatA: string;
let jemaatB: string;
let pengajuanB: string;
let accountA: Account;
let accountB: Account;
let staffOnly: Account;
let admin: Session;
let viewer: Session;

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? "no data");
  return result.data;
}

async function newJemaat(fields: Record<string, unknown>): Promise<string> {
  const { id } = must(await svc.from("jemaat").insert(fields as never).select("id").single());
  created.jemaat.push(id);
  return id;
}

async function account(label: string, jemaatId: string | null, roles: string[] = []): Promise<Account> {
  const email = `portal-data-${label}-${RUN}@test.local`;
  const id = await createTestUser(email, PASSWORD, roles);
  created.users.push(id);
  if (jemaatId) {
    const { error } = await svc.from("profiles").update({ jemaat_id: jemaatId }).eq("id", id);
    if (error) throw error;
  }
  const session = await signIn(email, PASSWORD);
  const token = (await session.supabase.auth.getSession()).data.session!.access_token;
  return { id, email, session, token };
}

/** Calls a portal function over the Supabase REST API, as `token` (anon when null). */
async function rest(fn: string, args: Record<string, unknown>, token: string | null) {
  const response = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token ?? env.anonKey}`,
      "Content-Profile": "portal",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as unknown };
}

const READ_CALLS: [string, Record<string, unknown>][] = [
  ["profil_saya", {}],
  ["keluarga_saya", {}],
  ["pelayanan_saya", RANGE],
  ["komisi_saya", {}],
  ["persembahan_saya", { tahun: YEAR }],
  ["pengaturan_portal", {}],
  ["pengajuan_saya", {}],
];
const ALL_CALLS: [string, Record<string, unknown>][] = [
  ...READ_CALLS,
  ["ajukan_perubahan", { data: { alamat: "Jalan Uji" } }],
  ["batalkan_pengajuan", { id: "00000000-0000-4000-8000-000000000000" }],
];

async function setPersembahanSetting(on: boolean) {
  const { error } = await svc.from("profil_gereja").update({ portal_tampilkan_persembahan: on }).eq("id", 1);
  if (error) throw error;
}

async function logRows(filter: { module: string; activity: string; userId?: string; email?: string }) {
  let query = svc.from("activity_logs").select("user_id, user_email, module, activity, ip_address").eq("module", filter.module).eq("activity", filter.activity);
  if (filter.userId) query = query.eq("user_id", filter.userId);
  if (filter.email) query = query.eq("user_email", filter.email);
  return must(await query);
}

/** Runs something that should redirect; returns the target path. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = ((error as { digest?: string }).digest ?? "").match(/^NEXT_REDIRECT;[a-z]+;([^;]+);/);
    if (match) return match[1]!;
    throw error;
  }
  throw new Error("Expected a redirect");
}

beforeAll(async () => {
  settingBefore = must(await svc.from("profil_gereja").select("portal_tampilkan_persembahan").eq("id", 1).single())
    .portal_tampilkan_persembahan;
  await setPersembahanSetting(false);

  const keluarga = must(
    await svc
      .from("keluarga")
      .insert([{ nama: `Keluarga Uji Anna ${RUN}` }, { nama: `Keluarga Uji Budi ${RUN}` }])
      .select("id, nama"),
  );
  created.keluarga.push(...keluarga.map((k) => k.id));
  const [keluargaA, keluargaB] = [keluarga[0]!.id, keluarga[1]!.id];

  jemaatA = await newJemaat({
    nama: `Uji Anna ${RUN}`,
    nomor_anggota: `UJI-PA-${RUN}`,
    status_keanggotaan: "sidi",
    keluarga_id: keluargaA,
    hubungan_keluarga: "Kepala Keluarga",
    no_hp: "081100001111",
    alamat: "Jalan Anna 1",
    pekerjaan: "Guru",
  });
  const jemaatA2 = await newJemaat({
    nama: `Uji Andi ${RUN}`,
    status_keanggotaan: "baptis_anak",
    keluarga_id: keluargaA,
    hubungan_keluarga: "Anak",
    no_hp: "081177770000",
    alamat: "Jalan Andi Rahasia",
    tanggal_lahir: "2012-02-02",
  });
  jemaatB = await newJemaat({
    nama: `Uji Budi ${RUN}`,
    nomor_anggota: `UJI-PB-${RUN}`,
    status_keanggotaan: "anggota_penuh",
    keluarga_id: keluargaB,
    hubungan_keluarga: "Kepala Keluarga",
    no_hp: "082299990000",
    alamat: `Jalan Budi ${RUN}`,
    pekerjaan: "Petani Budi",
  });

  must(
    await svc.from("jemaat_catatan_pastoral").insert([
      { jemaat_id: jemaatA, jenis: `JENIS-${PASTORAL_MARKER}`, tanggal: `${YEAR}-01-01`, isi: `ISI-${PASTORAL_MARKER}` },
      { jemaat_id: jemaatB, jenis: `JENIS-${PASTORAL_MARKER}`, tanggal: `${YEAR}-01-01`, isi: `ISI-${PASTORAL_MARKER}` },
    ]).select("id"),
  );

  // Schedule: A preaches and leads PNJ on a Kebaktian Minggu where B is
  // liturgos; A is Pelayan Liturgi on an SMKA row; B plays alone elsewhere.
  const categories = must(await svc.from("peribadahan_categories").select("id, key").in("key", ["umum", "smka"]));
  const categoryId = (key: string) => categories.find((c) => c.key === key)!.id;
  const tempat = must(
    await svc
      .from("tempat")
      .insert([{ nama: `Tempat Anna ${RUN}` }, { nama: `Tempat Budi ${RUN}` }])
      .select("id"),
  );
  created.tempat.push(...tempat.map((t) => t.id));
  const items = must(
    await svc
      .from("peribadahan_items")
      .insert([
        {
          category_id: categoryId("umum"),
          tanggal: `${YEAR}-03-07`,
          jam: "08:00",
          tempat_id: tempat[0]!.id,
          pelayan_firman_id: jemaatA,
          liturgos_id: jemaatB,
          pnj_id: jemaatA,
        },
        { category_id: categoryId("smka"), tanggal: `${YEAR}-03-07`, jam: "10:00", liturgos_id: jemaatA },
        { category_id: categoryId("umum"), tanggal: `${YEAR}-03-14`, jam: "08:00", tempat_id: tempat[1]!.id, pemusik_id: jemaatB },
      ])
      .select("id"),
  );
  created.items.push(...items.map((i) => i.id));

  // Komisi: A is an Anggota of one; B of another.
  const anggota = must(await svc.from("jabatan_komisi").select("id").eq("nama", "Anggota").single());
  const komisi = must(
    await svc
      .from("komisi")
      .insert([
        { nama: `Komisi Anna ${RUN}`, slug: `komisi-anna-${RUN}`, tampil: true },
        { nama: `Komisi Budi ${RUN}`, slug: `komisi-budi-${RUN}`, tampil: true },
      ])
      .select("id"),
  );
  created.komisi.push(...komisi.map((k) => k.id));
  must(
    await svc
      .from("komisi_anggota")
      .insert([
        { komisi_id: komisi[0]!.id, jemaat_id: jemaatA, jabatan_id: anggota.id },
        { komisi_id: komisi[1]!.id, jemaat_id: jemaatB, jabatan_id: anggota.id },
      ])
      .select("id"),
  );

  // Persembahan Bulanan: A, her son A2, and B.
  const persembahan = must(await svc.from("sarana_dana_items").select("id").eq("key", "persembahan_bulanan").single());
  const transactions = must(
    await svc
      .from("sarana_dana_transactions")
      .insert([
        { item_id: persembahan.id, tanggal: `${YEAR}-01-10`, tipe: "masuk", jumlah: 123456, jemaat_id: jemaatA },
        { item_id: persembahan.id, tanggal: `${YEAR}-01-11`, tipe: "masuk", jumlah: 55555, jemaat_id: jemaatA2 },
        { item_id: persembahan.id, tanggal: `${YEAR}-01-12`, tipe: "masuk", jumlah: 777777, jemaat_id: jemaatB },
      ])
      .select("id"),
  );
  created.transactions.push(...transactions.map((t) => t.id));

  accountA = await account("a", jemaatA);
  accountB = await account("b", jemaatB);
  staffOnly = await account("staff", null, ["viewer"]);
  admin = await signIn("admin@gkp.test");
  viewer = await signIn("viewer@gkp.test");

  // B's own waiting request, through the real RPC.
  const ajuan = await accountB.session.supabase.schema("portal").rpc("ajukan_perubahan", { data: { alamat: `Alamat Baru Budi ${RUN}` } });
  if (ajuan.error || typeof ajuan.data !== "string") throw new Error(ajuan.error?.message ?? "no id");
  pengajuanB = ajuan.data;
});

afterAll(async () => {
  actAs(null);
  await setPersembahanSetting(settingBefore);
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  if (created.transactions.length) await svc.from("sarana_dana_transactions").delete().in("id", created.transactions);
  if (created.items.length) await svc.from("peribadahan_items").delete().in("id", created.items);
  if (created.komisi.length) await svc.from("komisi").delete().in("id", created.komisi);
  if (created.jemaat.length) await svc.from("jemaat").delete().in("id", created.jemaat);
  if (created.keluarga.length) await svc.from("keluarga").delete().in("id", created.keluarga);
  if (created.tempat.length) await svc.from("tempat").delete().in("id", created.tempat);
});

describe("portal functions over Supabase REST", () => {
  it("with A's JWT, no portal function ever returns B's data, a family member's giving, or a pastoral note", async () => {
    for (const on of [false, true]) {
      await setPersembahanSetting(on);
      for (const [fn, args] of READ_CALLS) {
        const response = await rest(fn, args, accountA.token);
        expect(response.status, `${fn} (setting ${on})`).toBe(200);
        expect(response.text, fn).not.toMatch(B_MARKERS);
        expect(response.text, fn).not.toContain(PASTORAL_MARKER);
        expect(response.text, fn).not.toContain(pengajuanB);
      }
    }

    // And they do return A's own data.
    expect((await rest("profil_saya", {}, accountA.token)).json).toEqual([
      expect.objectContaining({ nama: `Uji Anna ${RUN}`, no_hp: "081100001111" }),
    ]);
    expect((await rest("persembahan_saya", { tahun: YEAR }, accountA.token)).json).toEqual([
      { tanggal: `${YEAR}-01-10`, jumlah: 123456 },
    ]);
    await setPersembahanSetting(false);
  });

  it("A can't cancel B's request over REST either, and B's request is untouched", async () => {
    // P0002, like every "not found" in this codebase's RPCs; PostgREST
    // answers it with 500, and the app maps the code (lib/portal: tidak_ditemukan).
    const response = await rest("batalkan_pengajuan", { id: pengajuanB }, accountA.token);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.json).toEqual({ code: "P0002", details: null, hint: null, message: "Pengajuan tidak ditemukan." });
    const row = must(await svc.from("jemaat_pengajuan_perubahan").select("status").eq("id", pengajuanB).single());
    expect(row.status).toBe("menunggu");
  });

  it("keluarga_saya returns only nama, hubungan_keluarga, and status_keanggotaan", async () => {
    const response = await rest("keluarga_saya", {}, accountA.token);
    const rows = response.json as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["hubungan_keluarga", "nama", "status_keanggotaan"]);
    expect(response.text).not.toMatch(/081177770000|Jalan Andi|2012-02-02/);
  });

  it("the anon key can execute no portal function", async () => {
    for (const [fn, args] of ALL_CALLS) {
      const response = await rest(fn, args, null);
      expect(response.status, fn).toBe(401);
      expect(response.json, fn).toMatchObject({ code: "42501" });
    }
  });

  it("a staff account without a jemaat gets a clear 403 PT403 from every portal function", async () => {
    for (const [fn, args] of ALL_CALLS) {
      const response = await rest(fn, args, staffOnly.token);
      expect(response.status, fn).toBe(403);
      expect(response.json, fn).toMatchObject({ code: "PT403", message: "Akun ini belum terhubung ke data jemaat." });
    }
  });

  it("a jemaat account can't read jemaat, keluarga, transactions, pastoral notes, or change requests directly", async () => {
    const headers = { apikey: env.anonKey, Authorization: `Bearer ${accountA.token}` };
    for (const table of ["jemaat", "keluarga", "sarana_dana_transactions", "jemaat_catatan_pastoral", "jemaat_pengajuan_perubahan"]) {
      const response = await fetch(`${env.url}/rest/v1/${table}?select=*`, { headers });
      expect(response.status, table).toBe(200);
      expect(await response.json(), table).toEqual([]);
    }

    const insert = await fetch(`${env.url}/rest/v1/jemaat_pengajuan_perubahan`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jemaat_id: jemaatA, data: { alamat: "Langsung" } }),
    });
    expect(insert.status).toBe(403);
    const update = await fetch(`${env.url}/rest/v1/jemaat_pengajuan_perubahan?id=eq.${pengajuanB}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dibatalkan" }),
    });
    expect(update.status).toBe(403);
  });
});

describe("lib/portal loaders (A's own session)", () => {
  it("return A's own data, with role labels from the category config", async () => {
    const supabase = accountA.session.supabase;
    expect(await loadProfilSaya(supabase)).toMatchObject({ nama: `Uji Anna ${RUN}`, pekerjaan: "Guru", alamat: "Jalan Anna 1" });
    expect(await loadKeluargaSaya(supabase)).toEqual([
      { nama: `Uji Anna ${RUN}`, hubunganKeluarga: "Kepala Keluarga", statusKeanggotaan: "sidi" },
      { nama: `Uji Andi ${RUN}`, hubunganKeluarga: "Anak", statusKeanggotaan: "baptis_anak" },
    ]);
    expect((await loadPelayananSaya(supabase, RANGE.dari, RANGE.sampai)).map((r) => [r.tanggal, r.kategoriKey, r.peranLabel, r.tempatNama])).toEqual([
      [`${YEAR}-03-07`, "umum", "Pelayan Firman", `Tempat Anna ${RUN}`],
      [`${YEAR}-03-07`, "umum", "Pemandu Nyanyian Jemaat", `Tempat Anna ${RUN}`],
      [`${YEAR}-03-07`, "smka", "Pelayan Liturgi", null],
    ]);
    expect(await loadKomisiSaya(supabase)).toEqual([
      { komisiNama: `Komisi Anna ${RUN}`, komisiSlug: `komisi-anna-${RUN}`, periode: null, jabatanNama: "Anggota" },
    ]);
  });

  it("persembahan: nothing while the setting is off; only A's own (not A2's) while on", async () => {
    const supabase = accountA.session.supabase;
    expect(await loadPengaturanPortal(supabase)).toEqual({ tampilkanPersembahan: false });
    expect(await loadPersembahanSaya(supabase, YEAR)).toEqual([]);
    await setPersembahanSetting(true);
    try {
      expect(await loadPengaturanPortal(supabase)).toEqual({ tampilkanPersembahan: true });
      expect(await loadPersembahanSaya(supabase, YEAR)).toEqual([{ tanggal: `${YEAR}-01-10`, jumlah: 123456 }]);
    } finally {
      await setPersembahanSetting(false);
    }
  });

  it("a staff account without a jemaat gets a PortalError with reason bukan_jemaat", async () => {
    await expect(loadProfilSaya(staffOnly.session.supabase)).rejects.toMatchObject({
      name: "PortalError",
      reason: "bukan_jemaat",
      message: "Akun ini belum terhubung ke data jemaat.",
    });
  });
});

describe("change requests", () => {
  const context = () => ({ supabase: accountA.session.supabase, user: { id: accountA.id, email: accountA.email } });

  it("refuses keys outside the whitelist, in the app and in the database", async () => {
    for (const key of ["status_keanggotaan", "nomor_anggota"]) {
      const result = await ajukanPerubahan(context(), { [key]: "x" });
      expect(result).toMatchObject({ ok: false, reason: "tidak_valid" });
      // The database refuses it too, whatever the app does.
      const rpc = await accountA.session.supabase.schema("portal").rpc("ajukan_perubahan", { data: { [key]: "x" } });
      expect(rpc.error).toMatchObject({ code: "22023" });
      expect(rpc.error?.message).toContain(`Data "${key}" tidak bisa diajukan`);
    }
    expect(await loadPengajuanSaya(accountA.session.supabase)).toEqual([]);
  });

  it("submits, refuses a second waiting request, cancels, and logs each step under jemaat", async () => {
    const submitted = await ajukanPerubahan(context(), { no_hp: "081100002222", alamat: "Jalan Anna 1", pekerjaan: "" });
    expect(submitted.ok).toBe(true);
    const [request] = await loadPengajuanSaya(accountA.session.supabase);
    expect(request).toMatchObject({ status: "menunggu", data: { no_hp: "081100002222", pekerjaan: null } });
    expect(request!.data).not.toHaveProperty("alamat");
    expect(
      await logRows({ module: "jemaat", activity: `Mengajukan perubahan data "Uji Anna ${RUN}": No. HP, Pekerjaan`, userId: accountA.id }),
    ).toEqual([expect.objectContaining({ user_email: accountA.email, ip_address: expect.any(String) })]);

    const second = await ajukanPerubahan(context(), { alamat: "Jalan Lain" });
    expect(second).toEqual({
      ok: false,
      reason: "bentrok",
      message: "Masih ada pengajuan perubahan yang menunggu ditinjau. Batalkan dulu atau tunggu sampai ditinjau.",
    });

    expect(await batalkanPengajuan(context(), pengajuanB)).toMatchObject({ ok: false, reason: "tidak_ditemukan" });
    expect(await batalkanPengajuan(context(), request!.id)).toEqual({ ok: true, data: null });
    expect(
      await logRows({ module: "jemaat", activity: `Membatalkan pengajuan perubahan data "Uji Anna ${RUN}"`, userId: accountA.id }),
    ).toHaveLength(1);
    expect(await batalkanPengajuan(context(), request!.id)).toMatchObject({ ok: false, reason: "tidak_valid" });
  });

  it("setujui_pengajuan: refused for a jemaat and a viewer; an admin's applies the change and closes the request at once", async () => {
    const submitted = await ajukanPerubahan(context(), { no_hp: "081100003333", pekerjaan: "Dosen" });
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.data.id;

    for (const session of [accountA.session, viewer]) {
      const refused = await session.supabase.rpc("setujui_pengajuan", { p_id: id });
      expect(refused.error).toMatchObject({ code: "42501" });
    }
    const untouched = must(await svc.from("jemaat").select("no_hp, pekerjaan").eq("id", jemaatA).single());
    expect(untouched).toEqual({ no_hp: "081100001111", pekerjaan: "Guru" });

    const approved = await admin.supabase.rpc("setujui_pengajuan", { p_id: id });
    expect(approved).toMatchObject({ error: null, data: `Uji Anna ${RUN}` });
    expect(must(await svc.from("jemaat").select("no_hp, alamat, pekerjaan").eq("id", jemaatA).single())).toEqual({
      no_hp: "081100003333",
      alamat: "Jalan Anna 1",
      pekerjaan: "Dosen",
    });
    const adminId = (await admin.supabase.auth.getUser()).data.user!.id;
    expect(must(await svc.from("jemaat_pengajuan_perubahan").select("status, ditinjau_oleh").eq("id", id).single())).toEqual({
      status: "disetujui",
      ditinjau_oleh: adminId,
    });

    const again = await admin.supabase.rpc("setujui_pengajuan", { p_id: id });
    expect(again.error).toMatchObject({ code: "22023", message: "Pengajuan ini sudah tidak menunggu." });
  });

  it("tolak_pengajuan needs warta:update and a catatan", async () => {
    expect((await viewer.supabase.rpc("tolak_pengajuan", { p_id: pengajuanB, p_catatan: "Tidak" })).error).toMatchObject({ code: "42501" });
    expect((await admin.supabase.rpc("tolak_pengajuan", { p_id: pengajuanB, p_catatan: " " })).error).toMatchObject({
      code: "22023",
      message: "Catatan penolakan wajib diisi.",
    });
    expect(await admin.supabase.rpc("tolak_pengajuan", { p_id: pengajuanB, p_catatan: "Alamat belum lengkap." })).toMatchObject({
      error: null,
      data: `Uji Budi ${RUN}`,
    });
    const rows = await loadPengajuanSaya(accountB.session.supabase);
    expect(rows).toEqual([expect.objectContaining({ id: pengajuanB, status: "ditolak", catatanAdmin: "Alamat belum lengkap." })]);
    expect(rows[0]).not.toHaveProperty("ditinjauOleh");
  });
});

describe("Hapus akun login (§17.4)", () => {
  it("refuses a staff account, also one that is a jemaat too, and deletes nothing", async () => {
    const staffJemaat = await account("staff-jemaat", await newJemaat({ nama: `Uji Staf Jemaat ${RUN}` }), ["viewer"]);
    for (const target of [staffOnly, staffJemaat]) {
      actAs(target.session);
      expect(await hapusAkunLogin()).toEqual({
        error: "Akun pengurus tidak bisa dihapus dari Portal Jemaat. Hubungi super admin.",
      });
      const { data, error } = await svc.auth.admin.getUserById(target.id);
      expect(error).toBeNull();
      expect(data.user?.id).toBe(target.id);
    }
    actAs(null);
    expect(await hapusAkunLogin()).toEqual({ error: "Sesi kamu sudah berakhir. Silakan masuk kembali." });
  });

  it("deletes a jemaat's auth user and profile, keeps the jemaat and its waiting request, and logs under akun", async () => {
    const jemaatD = await newJemaat({ nama: `Uji Dewi ${RUN}`, status_keanggotaan: "sidi", alamat: "Jalan Dewi" });
    const accountD = await account("d", jemaatD);
    const ajuan = await ajukanPerubahan(
      { supabase: accountD.session.supabase, user: { id: accountD.id, email: accountD.email } },
      { alamat: "Jalan Dewi Baru" },
    );
    if (!ajuan.ok) throw new Error(ajuan.message);

    actAs(accountD.session);
    expect(await redirectOf(() => hapusAkunLogin())).toBe("/portal");
    actAs(null);

    const { data } = await svc.auth.admin.getUserById(accountD.id);
    expect(data.user).toBeNull();
    expect(must(await svc.from("profiles").select("id").eq("id", accountD.id))).toEqual([]);
    expect(must(await svc.from("jemaat").select("nama, alamat").eq("id", jemaatD).single())).toEqual({
      nama: `Uji Dewi ${RUN}`,
      alamat: "Jalan Dewi",
    });
    expect(must(await svc.from("jemaat_pengajuan_perubahan").select("status, diajukan_oleh").eq("id", ajuan.data.id).single())).toEqual({
      status: "menunggu",
      diajukan_oleh: null,
    });

    // Written before the delete, so it carries the email; user_id is set
    // null by the foreign key afterwards.
    expect(await logRows({ module: "akun", activity: `Menghapus akun login Portal Jemaat "Uji Dewi ${RUN}"`, email: accountD.email })).toEqual([
      expect.objectContaining({ user_id: null, user_email: accountD.email }),
    ]);

    // The session cookies are cleared, and the old session no longer works.
    const authCookies = [...accountD.session.jar].filter(([name, value]) => name.startsWith("sb-") && value !== "");
    expect(authCookies).toEqual([]);
    const reuse = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${accountD.token}` } });
    expect(reuse.status).not.toBe(200);
  });
});
