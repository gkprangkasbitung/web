/**
 * Pemilihan backend (stage 14a; brief §18.2–18.3, §18.5–18.6) over the real
 * Supabase REST API with each account's own JWT, plus the lib/pemilihan
 * loaders and mutations.
 *
 * - No account (super_admin, panitia, viewer, a voter, the service role)
 *   reads or writes pemilihan_suara / pemilihan_partisipasi directly.
 * - A vote leaves no trace on any row a staff account can read: xmin/xmax of
 *   the voter's and the candidates' jemaat, peserta, and profile rows are
 *   unchanged (a foreign key or row lock would stamp them with the voting
 *   transaction's id, and REST exposes those columns).
 * - Five simultaneous votes from one account: exactly one counts.
 * - Activity log rows and server console output never carry a choice.
 *
 * Votes are final, so the API can't remove them; afterAll cleans up with a
 * direct postgres connection to the local stack's container.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { actAs, createTestUser, env, serviceClient, signIn, type Session } from "./harness";

const { loadHasilPartisipasi, loadHasilPemilihan, loadHasilSuara, loadKandidat, loadKontes, loadPemilihanAktifSaya, PemilihanError } =
  await import("@/lib/pemilihan/data");
const { berikanSuara, berikanSuaraDibantu } = await import("@/lib/pemilihan/mutations");

const RUN = Date.now().toString(36);
const PASSWORD = "rahasia-pemilihan-123";
const NAMA_PEMILIHAN = `Pemilihan Uji Integrasi ${RUN}`;
const CANDIDATE_MARKER = /Kandidat Integrasi/;

const svc = serviceClient();
const created = { users: [] as string[], jemaat: [] as string[], pemilihan: [] as string[] };

type Account = { id: string; email: string; session: Session; token: string };

let pemilihanId: string;
let voter1Jemaat: string;
const candidates: string[] = [];
let voter1: Account;
let voter2: Account;
let voter3: Account;
let voter4: Account;
let assistedJemaat: string;
let panitia: Account;
let superAdmin: Account;
let viewer: Account;

const consoleOutput: string[] = [];

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? "no data");
  return result.data;
}

async function newJemaat(nama: string): Promise<string> {
  const { id } = must(await svc.from("jemaat").insert({ nama }).select("id").single());
  created.jemaat.push(id);
  return id;
}

async function tokenOf(session: Session): Promise<string> {
  return (await session.supabase.auth.getSession()).data.session!.access_token;
}

async function account(label: string, jemaatId: string | null, roles: string[] = []): Promise<Account> {
  const email = `pemilihan-${label}-${RUN}@test.local`;
  const id = await createTestUser(email, PASSWORD, roles);
  created.users.push(id);
  if (jemaatId) {
    const { error } = await svc.from("profiles").update({ jemaat_id: jemaatId }).eq("id", id);
    if (error) throw error;
  }
  const session = await signIn(email, PASSWORD);
  return { id, email, session, token: await tokenOf(session) };
}

async function seeded(email: string): Promise<Account> {
  const session = await signIn(email);
  const id = (await session.supabase.auth.getUser()).data.user!.id;
  return { id, email, session, token: await tokenOf(session) };
}

/** A Supabase REST request as `token` (the anon key when null). */
async function rest(
  path: string,
  { token, method = "GET", body, schema }: { token: string | null; method?: string; body?: unknown; schema?: "portal" },
) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token ?? env.anonKey}`,
      ...(schema ? { "Accept-Profile": schema, "Content-Profile": schema } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: (text ? JSON.parse(text) : null) as unknown };
}

function ballot(penatua: number, ppj: number) {
  return { penatua: candidates.slice(0, penatua), ppj: candidates.slice(0, ppj) };
}

/** psql as postgres inside the local stack's database container (local only: env.url is checked by the harness). */
function localPsql(sql: string) {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId || !/^[a-z0-9-]+$/.test(projectId)) throw new Error("No project_id in supabase/config.toml");
  execSync(`docker exec -i supabase_db_${projectId} psql -U postgres -v ON_ERROR_STOP=1 -q`, {
    input: sql,
    stdio: ["pipe", "ignore", "pipe"],
  });
}

beforeAll(async () => {
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "));
    });
  }

  for (let i = 1; i <= 12; i++) candidates.push(await newJemaat(`Uji Kandidat Integrasi ${i} ${RUN}`));
  const [v1, v2, v3, v4] = [
    await newJemaat(`Uji Pemilih Satu ${RUN}`),
    await newJemaat(`Uji Pemilih Dua ${RUN}`),
    await newJemaat(`Uji Pemilih Tiga ${RUN}`),
    await newJemaat(`Uji Pemilih Empat ${RUN}`),
  ];
  assistedJemaat = await newJemaat(`Uji Pemilih Dibantu ${RUN}`);

  const now = Date.now();
  const pemilihan = must(
    await svc
      .from("pemilihan")
      .insert({
        nama: NAMA_PEMILIHAN,
        dibuka_pada: new Date(now - 60_000).toISOString(),
        ditutup_pada: new Date(now + 3_600_000).toISOString(),
      })
      .select("id")
      .single(),
  );
  pemilihanId = pemilihan.id;
  created.pemilihan.push(pemilihanId);

  const peserta = [
    ...[v1, v2, v3, v4, assistedJemaat].map((jemaatId, i) => ({
      pemilihan_id: pemilihanId,
      jemaat_id: jemaatId!,
      nama_tampilan: `Bpk. Pemilih Integrasi ${i + 1}`,
      dapat_memilih: true,
      dapat_dipilih: false,
    })),
    ...candidates.map((jemaatId, i) => ({
      pemilihan_id: pemilihanId,
      jemaat_id: jemaatId,
      // Alternating honorifics; sorted by the number either way.
      nama_tampilan: `${i % 2 ? "Ibu" : "Bpk."} Kandidat Integrasi ${String(i + 1).padStart(2, "0")}`,
      dapat_memilih: false,
      dapat_dipilih: true,
    })),
  ];
  must(await svc.from("pemilihan_peserta").insert(peserta).select("jemaat_id"));
  must(await svc.from("pemilihan").update({ status: "dibuka" }).eq("id", pemilihanId).select("id"));

  voter1Jemaat = v1!;
  voter1 = await account("v1", v1!);
  voter2 = await account("v2", v2!);
  voter3 = await account("v3", v3!);
  voter4 = await account("v4", v4!);
  panitia = await account("panitia", null, ["panitia_pemilihan"]);
  superAdmin = await seeded("superadmin@gkp.test");
  viewer = await seeded("viewer@gkp.test");
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
      delete from public.pemilihan_suara where pemilihan_id in (${list});
      delete from public.pemilihan_partisipasi where pemilihan_id in (${list});
      delete from public.pemilihan where id in (${list});
      alter table public.pemilihan_suara enable trigger pemilihan_final;
      alter table public.pemilihan_partisipasi enable trigger pemilihan_final;
      alter table public.pemilihan enable trigger pemilihan_guard;
      commit;
    `);
  }
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  if (created.jemaat.length) await svc.from("jemaat").delete().in("id", created.jemaat);
});

describe("the secret ballot over Supabase REST", () => {
  it("no account, not even super_admin or the service role, reads or writes suara or partisipasi directly", async () => {
    const tokens: [string, string][] = [
      ["super_admin", superAdmin.token],
      ["panitia", panitia.token],
      ["viewer", viewer.token],
      ["voter", voter1.token],
      ["service role", env.serviceKey],
    ];
    for (const [label, token] of tokens) {
      for (const table of ["pemilihan_suara", "pemilihan_partisipasi"]) {
        const read = await rest(`${table}?select=*`, { token });
        expect([401, 403], `${label} GET ${table}`).toContain(read.status);
        expect(read.json, `${label} GET ${table}`).toMatchObject({ code: "42501" });

        const write = await rest(table, {
          token,
          method: "POST",
          body:
            table === "pemilihan_suara"
              ? { pemilihan_id: pemilihanId, kontes: "penatua", kandidat_jemaat_id: candidates[0] }
              : { pemilihan_id: pemilihanId, jemaat_id: candidates[0], metode: "mandiri" },
        });
        expect(write.json, `${label} POST ${table}`).toMatchObject({ code: "42501" });
      }
    }
  });

  it("a vote leaves no trace (xmin/xmax) on the voter's or the candidates' rows that staff can read", async () => {
    const people = [voter1Jemaat, ...candidates];
    const snapshot = async () => ({
      jemaat: (await rest(`jemaat?select=id,xmin,xmax&id=in.(${people.join(",")})&order=id`, { token: viewer.token })).json,
      peserta: (
        await rest(`pemilihan_peserta?select=jemaat_id,xmin,xmax&pemilihan_id=eq.${pemilihanId}&order=jemaat_id`, {
          token: panitia.token,
        })
      ).json,
      profile: (await rest(`profiles?select=id,xmin,xmax&id=eq.${voter1.id}`, { token: superAdmin.token })).json,
      election: (await rest(`pemilihan?select=id,xmin,xmax&id=eq.${pemilihanId}`, { token: panitia.token })).json,
    });

    const before = await snapshot();
    // The columns really are readable, so "unchanged" below means something.
    expect(before.jemaat).toHaveLength(13);
    expect((before.jemaat as { xmax: string }[])[0]).toHaveProperty("xmax");
    expect(before.peserta).toHaveLength(17);

    const vote = await rest("rpc/berikan_suara", {
      token: voter1.token,
      method: "POST",
      schema: "portal",
      body: { pemilihan_id: pemilihanId, ...ballot(10, 5) },
    });
    expect(vote.status).toBe(200);

    const after = await snapshot();
    expect(after.jemaat).toEqual(before.jemaat);
    expect(after.peserta).toEqual(before.peserta);
    expect(after.profile).toEqual(before.profile);
    // The election row, shared by every voter, is the one row the vote locks
    // (so closing waits for votes in flight): proof that a lock would show.
    expect(after.election).not.toEqual(before.election);
  });

  it("five simultaneous votes from one account: exactly one counts", async () => {
    const calls = await Promise.all(
      Array.from({ length: 5 }, () =>
        rest("rpc/berikan_suara", {
          token: voter2.token,
          method: "POST",
          schema: "portal",
          body: { pemilihan_id: pemilihanId, ...ballot(12, 6) },
        }),
      ),
    );
    expect(calls.filter((call) => call.status === 200)).toHaveLength(1);
    for (const refused of calls.filter((call) => call.status !== 200)) {
      expect(refused.status).toBe(400);
      expect(refused.json).toMatchObject({ code: "PM003", message: "Anda sudah memberikan suara." });
    }

    const turnout = await rest("rpc/hasil_partisipasi", { token: panitia.token, method: "POST", body: { p_pemilihan_id: pemilihanId } });
    expect(turnout.json).toMatchObject([{ total_pemilih: 5, sudah_memilih: 2, mandiri: 2, dibantu: 0 }]);
    const tally = (await rest("rpc/hasil_suara", { token: panitia.token, method: "POST", body: { p_pemilihan_id: pemilihanId } }))
      .json as { kontes: string; jumlah_suara: number }[];
    const total = (kontes: string) => tally.filter((row) => row.kontes === kontes).reduce((sum, row) => sum + row.jumlah_suara, 0);
    expect(total("penatua")).toBe(10 + 12);
    expect(total("ppj")).toBe(5 + 6);
  });

  it("errors carry a stable code and an HTTP 400, never the choices", async () => {
    const tooFew = await rest("rpc/berikan_suara", {
      token: voter4.token,
      method: "POST",
      schema: "portal",
      body: { pemilihan_id: pemilihanId, ...ballot(9, 5) },
    });
    expect(tooFew.status).toBe(400);
    expect(tooFew.json).toMatchObject({ code: "PM004" });
    for (const id of candidates) expect(tooFew.text).not.toContain(id);
  });
});

describe("lib/pemilihan", () => {
  it("loadKontes reads the limits from the database", async () => {
    expect(await loadKontes(voter4.session.supabase)).toEqual([
      { kode: "penatua", nama: "Penatua (Majelis Jemaat)", minPilih: 10, maxPilih: 30 },
      { kode: "ppj", nama: "PPJ (Pengawas Perbendaharaan Jemaat)", minPilih: 5, maxPilih: 15 },
    ]);
  });

  it("loadKandidat lists the candidates by name, ignoring the honorific", async () => {
    const list = await loadKandidat(voter4.session.supabase, pemilihanId);
    expect(list.map((k) => k.namaTampilan)).toEqual(
      candidates.map((_, i) => `${i % 2 ? "Ibu" : "Bpk."} Kandidat Integrasi ${String(i + 1).padStart(2, "0")}`),
    );
    expect(list.map((k) => k.jemaatId)).toEqual(candidates);
  });

  it("berikanSuara records the vote and logs the election, never a choice", async () => {
    actAs(voter3.session);
    const context = { supabase: voter3.session.supabase, user: { id: voter3.id, email: voter3.email } };
    const result = await berikanSuara(context, { pemilihanId, ...ballot(11, 5) });
    expect(result).toMatchObject({ ok: true, data: { waktu: expect.any(String) } });

    const logs = must(
      await svc.from("activity_logs").select("module, activity, user_email, ip_address").eq("user_id", voter3.id),
    );
    expect(logs).toEqual([
      {
        module: "pemilihan",
        activity: `Memberikan suara pada pemilihan "${NAMA_PEMILIHAN}"`,
        user_email: voter3.email,
        ip_address: "203.0.113.42",
      },
    ]);

    expect(await berikanSuara(context, { pemilihanId, ...ballot(11, 5) })).toEqual({
      ok: false,
      reason: "sudah_memilih",
      message: "Anda sudah memberikan suara.",
    });
    const [mine] = await loadPemilihanAktifSaya(voter3.session.supabase);
    expect(mine).toMatchObject({ nama: NAMA_PEMILIHAN, sudahMemilih: true, metode: "mandiri", hasilTersedia: false });
    expect(mine!.waktuMemilih).toBe(result.ok ? result.data.waktu : null);
  });

  it("berikanSuara maps every refusal to its reason, before or in the database", async () => {
    const context = { supabase: voter4.session.supabase, user: { id: voter4.id, email: voter4.email } };
    expect(await berikanSuara(context, { pemilihanId, ...ballot(10, 4) })).toEqual({
      ok: false,
      reason: "jumlah_pilihan",
      message: "Pilih minimal 5 calon PPJ (Pengawas Perbendaharaan Jemaat). Saat ini 4 dipilih.",
    });
    expect(await berikanSuara(context, { pemilihanId, penatua: [...ballot(9, 0).penatua, candidates[0]], ppj: ballot(0, 5).ppj })).toMatchObject({
      ok: false,
      reason: "pilihan_ganda",
    });
    expect(
      await berikanSuara(context, { pemilihanId, penatua: [...ballot(9, 0).penatua, voter4.id], ppj: ballot(0, 5).ppj }),
    ).toMatchObject({ ok: false, reason: "kandidat_tidak_valid" });
    expect(await berikanSuara(context, { pemilihanId, penatua: ["bukan-uuid"], ppj: [] })).toEqual({
      ok: false,
      reason: "tidak_valid",
      message: "Data yang dikirim tidak valid.",
    });
    expect(await berikanSuara(context, { pemilihanId: "x", penatua: [], ppj: [] })).toMatchObject({ ok: false, reason: "tidak_ditemukan" });
    expect(must(await svc.from("activity_logs").select("id").eq("user_id", voter4.id))).toEqual([]);
  });

  it("berikanSuaraDibantu needs pemilihan_bantu:create, records the paper ballot, and logs the voter and form number only", async () => {
    const viewerUser = { id: viewer.id, email: viewer.email, permissions: ["warta:read" as const] };
    expect(
      await berikanSuaraDibantu(
        { supabase: viewer.session.supabase, user: viewerUser },
        { pemilihanId, jemaatId: assistedJemaat, nomorFormulir: "F-INT-1", ...ballot(10, 5) },
      ),
    ).toMatchObject({ ok: false, reason: "akses" });
    // The database refuses it on its own as well.
    const direct = await viewer.session.supabase.rpc("berikan_suara_dibantu", {
      p_pemilihan_id: pemilihanId,
      p_jemaat_id: assistedJemaat,
      p_nomor_formulir: "F-INT-1",
      p_penatua: ballot(10, 5).penatua,
      p_ppj: ballot(10, 5).ppj,
    });
    expect(direct.error).toMatchObject({ code: "42501" });

    actAs(panitia.session);
    const context = {
      supabase: panitia.session.supabase,
      user: { id: panitia.id, email: panitia.email, permissions: ["pemilihan_bantu:create" as const] },
    };
    expect(
      await berikanSuaraDibantu(context, { pemilihanId, jemaatId: assistedJemaat, nomorFormulir: "   ", ...ballot(10, 5) }),
    ).toEqual({ ok: false, reason: "formulir_tidak_valid", message: "Nomor formulir wajib diisi." });

    const result = await berikanSuaraDibantu(context, {
      pemilihanId,
      jemaatId: assistedJemaat,
      nomorFormulir: " F-INT-1 ",
      ...ballot(10, 5),
    });
    expect(result).toMatchObject({ ok: true, data: { namaPemilih: "Bpk. Pemilih Integrasi 5" } });
    expect(must(await svc.from("activity_logs").select("module, activity").eq("user_id", panitia.id))).toEqual([
      { module: "pemilihan", activity: "Membantu pemilih memberikan suara: Bpk. Pemilih Integrasi 5 (formulir F-INT-1)" },
    ]);

    expect(
      await berikanSuaraDibantu(context, { pemilihanId, jemaatId: assistedJemaat, nomorFormulir: "F-INT-2", ...ballot(10, 5) }),
    ).toEqual({ ok: false, reason: "sudah_memilih", message: "Pemilih ini sudah memberikan suara." });
  });

  it("the results: turnout and the live tally for the panitia, nothing yet in the portal", async () => {
    expect(await loadHasilPartisipasi(panitia.session.supabase, pemilihanId)).toEqual({
      totalPemilih: 5,
      sudahMemilih: 4,
      persen: 80,
      mandiri: 3,
      dibantu: 1,
      dibantuPerPanitia: [{ userId: panitia.id, nama: panitia.email, jumlah: 1 }],
    });

    const tally = await loadHasilSuara(panitia.session.supabase, pemilihanId);
    expect(tally).toHaveLength(24);
    // Ballots: 10|5, 12|6, 11|5, 10|5 (assisted).
    expect(tally[0]).toMatchObject({ kontes: "penatua", jemaatId: candidates[0], jumlahSuara: 4, peringkat: 1 });
    expect(tally.find((row) => row.kontes === "penatua" && row.jemaatId === candidates[10])).toMatchObject({ jumlahSuara: 2, peringkat: 11 });
    expect(tally.find((row) => row.kontes === "ppj" && row.jemaatId === candidates[5])).toMatchObject({ jumlahSuara: 1, peringkat: 6 });

    expect(await loadHasilPemilihan(voter1.session.supabase, pemilihanId)).toEqual([]);
    await expect(loadHasilSuara(viewer.session.supabase, pemilihanId)).rejects.toBeInstanceOf(PemilihanError);
    await expect(loadHasilSuara(viewer.session.supabase, pemilihanId)).rejects.toMatchObject({ reason: "akses" });
  });

  it("with tampilkan_hasil_saat_berjalan on, the portal shows the same tally", async () => {
    must(await svc.from("pemilihan").update({ tampilkan_hasil_saat_berjalan: true }).eq("id", pemilihanId).select("id"));
    const portal = await loadHasilPemilihan(voter1.session.supabase, pemilihanId);
    const panitiaView = await loadHasilSuara(panitia.session.supabase, pemilihanId);
    expect(portal).toEqual(
      panitiaView.map((row) => {
        const withoutId = { ...row };
        delete withoutId.jemaatId;
        return withoutId;
      }),
    );
    expect((await loadPemilihanAktifSaya(voter1.session.supabase))[0]).toMatchObject({ hasilTersedia: true });
  });
});

describe("nothing records a choice", () => {
  it("no activity_logs row of this run and no server console line names a candidate", async () => {
    const userIds = [voter1, voter2, voter3, voter4, panitia].map((a) => a.id);
    const rows = must(await svc.from("activity_logs").select("activity").in("user_id", userIds));
    expect(rows.length).toBeGreaterThan(0);
    for (const { activity } of rows) {
      expect(activity).not.toMatch(CANDIDATE_MARKER);
      for (const id of candidates) expect(activity).not.toContain(id);
    }
    for (const line of consoleOutput) {
      expect(line).not.toMatch(CANDIDATE_MARKER);
      for (const id of candidates) expect(line).not.toContain(id);
    }
  });
});
