/**
 * Stage 14d (brief §18.7): Portal Jemaat username accounts, against the real
 * local GoTrue and Postgres. Creating accounts (one and a batch, with a
 * clash), username login (right, wrong, unknown, identical answers), the
 * lockout, the forced password change across every /jemaat route, the
 * reset permissions, and that no temporary password reaches a log.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

import { actAs, call, createTestUser, env, serviceClient, setRequestHeaders, signIn, type Session } from "./harness";

const { portalLogin } = await import("@/app/portal/masuk/actions");
type PortalLoginState = Awaited<ReturnType<typeof portalLogin>>;
const { gantiPasswordSementara } = await import("@/app/jemaat/ganti-password/actions");
const { hapusAkunLogin, logoutJemaat } = await import("@/app/jemaat/actions");
const usernameRoute = await import("@/app/api/admin/users/username/route");
const resetRoute = await import("@/app/api/admin/users/[id]/reset-password/route");
const { getAuthenticatedUser } = await import("@/lib/auth/session");
const { updateSession } = await import("@/lib/supabase/proxy");
const { USERNAME_KATA_TERLARANG, usulkanUsername } = await import("@/lib/portal-username");

const RUN = Date.now().toString(36);
const PASSWORD = "rahasia-uji-123";
const DOMAIN = "masuk.gkp.test";
const STARTED = new Date();
const USERNAME_TAB: PortalLoginState = { error: null, cara: "username", username: "", email: "" };

const svc = serviceClient();
const createdJemaat: string[] = [];
const createdUsers: string[] = [];
/** Every temporary password handed out in this file: none may reach a log. */
const issuedPasswords: string[] = [];
const consoleOutput: string[] = [];

let superadmin: Session;
let viewer: Session;
let editor: Session;
let admin: Session;
let panitia: Session;
let staffJemaatId: string;

/** A fresh client IP, so the per-IP limit of one test doesn't carry into another. */
function freshIp() {
  setRequestHeaders({ "x-forwarded-for": `198.19.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
}

function localPsql(sql: string): string {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId || !/^[a-z0-9-]+$/.test(projectId)) throw new Error("No project_id in supabase/config.toml");
  return execSync(`docker exec -i supabase_db_${projectId} psql -U postgres -v ON_ERROR_STOP=1 -qAt`, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function newJemaat(label: string): Promise<{ id: string; nama: string }> {
  const nama = `Bpk. Uji${label} Santoso${RUN}, S.Th.`;
  const { data, error } = await svc.from("jemaat").insert({ nama }).select("id").single();
  if (error) throw error;
  createdJemaat.push(data.id);
  return { id: data.id, nama };
}

async function staff(label: string, roles: string[]): Promise<Session> {
  const email = `un-${label}-${RUN}@test.local`;
  createdUsers.push(await createTestUser(email, PASSWORD, roles));
  return signIn(email, PASSWORD);
}

type Created = { jemaatId: string; nama: string; username: string; disesuaikan: boolean; password: string };

async function createAccounts(items: { jemaatId: string; username: string }[], as: Session = superadmin) {
  actAs(as);
  const result = await call(usernameRoute.POST, { method: "POST", body: { items } });
  const data = result.body.data as { created: Created[]; failed: unknown[] } | undefined;
  for (const row of data?.created ?? []) issuedPasswords.push(row.password);
  return { ...result, data };
}

async function profileOf(username: string) {
  const { data, error } = await svc
    .from("profiles")
    .select("id, email, username, jemaat_id, full_name, wajib_ganti_password")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (data) createdUsers.push(data.id);
  return data;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    const match = digest.match(/^NEXT_REDIRECT;[a-z]+;([^;]+);/);
    if (match) return match[1]!;
    throw error;
  }
  throw new Error("Expected a redirect");
}

function loginUsername(username: string, password: string, next = "") {
  return portalLogin(USERNAME_TAB, form({ cara: "username", username, password, next }));
}

function cookieHeader(session: Session): string {
  return [...session.jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function proxyTarget(session: Session, path: string): Promise<string | null> {
  const response = await updateSession(
    new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { cookie: cookieHeader(session) } }),
  );
  if (response.status === 200) return null;
  expect(response.status).toBe(307);
  return new URL(response.headers.get("location")!).pathname;
}

async function rest(path: string, token: string, body?: unknown, schema?: string) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      ...(schema ? { "Accept-Profile": schema, "Content-Profile": schema } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as { code?: string } | null };
}

beforeAll(async () => {
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "));
    });
  }
  superadmin = await signIn("superadmin@gkp.test");
  viewer = await staff("viewer", ["viewer"]);
  editor = await staff("editor", ["editor"]);
  admin = await staff("admin", ["admin"]);
  panitia = await staff("panitia", ["panitia_pemilihan"]);
  // A staff account that is also a jemaat: never reset from here.
  const staffJemaat = await newJemaat("Pengurus");
  const staffEmail = `un-staffjemaat-${RUN}@test.local`;
  staffJemaatId = await createTestUser(staffEmail, PASSWORD, ["viewer"]);
  createdUsers.push(staffJemaatId);
  await svc.from("profiles").update({ jemaat_id: staffJemaat.id }).eq("id", staffJemaatId);
  freshIp();
});

afterAll(async () => {
  actAs(null);
  setRequestHeaders({});
  vi.restoreAllMocks();
  for (const id of new Set(createdUsers)) await svc.auth.admin.deleteUser(id);
  // Every username account this file made, even one a failed assertion lost track of.
  localPsql(`delete from auth.users where email like '%${RUN}%@${DOMAIN}' or email like '%-${RUN}@test.local';`);
  if (createdJemaat.length > 0) await svc.from("jemaat").delete().in("id", createdJemaat);
});

describe("Buat akun username (users:create)", () => {
  it("creates one account: internal email, confirmed, linked, must change password, logged without the password", async () => {
    const jemaat = await newJemaat("Satu");
    const username = usulkanUsername(jemaat.nama, new Set())!;
    expect(username).toBe(`ujisatu.santoso${RUN}`);

    const result = await createAccounts([{ jemaatId: jemaat.id, username }]);
    expect(result.status).toBe(201);
    const row = result.data!.created[0]!;
    expect(row).toMatchObject({ jemaatId: jemaat.id, nama: jemaat.nama, username, disesuaikan: false });
    expect(row.password).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);

    const profile = await profileOf(username);
    expect(profile).toMatchObject({
      email: `${username}@${DOMAIN}`,
      jemaat_id: jemaat.id,
      full_name: jemaat.nama,
      wajib_ganti_password: true,
    });
    const { data: authUser } = await svc.auth.admin.getUserById(profile!.id);
    expect(authUser.user?.email_confirmed_at).toBeTruthy();

    const { data: logs } = await svc
      .from("activity_logs")
      .select("activity, module, user_email")
      .eq("activity", `Membuat akun username "${username}" untuk "${jemaat.nama}"`);
    expect(logs).toEqual([{ activity: expect.any(String), module: "users", user_email: "superadmin@gkp.test" }]);
  });

  it("a batch: a username already taken gets 2, the slip shows the final username", async () => {
    const first = await newJemaat("Bentrok");
    const second = await newJemaat("Bentrok");
    const username = `bentrok.${RUN}`;
    expect((await createAccounts([{ jemaatId: first.id, username }])).status).toBe(201);

    const third = await newJemaat("Lain");
    const result = await createAccounts([
      { jemaatId: second.id, username },
      { jemaatId: third.id, username: `lain.${RUN}` },
    ]);
    expect(result.status).toBe(201);
    expect(result.data!.created.map((row) => [row.username, row.disesuaikan])).toEqual([
      [`bentrok.${RUN}2`, true],
      [`lain.${RUN}`, false],
    ]);
    expect((await profileOf(`bentrok.${RUN}2`))?.jemaat_id).toBe(second.id);
    await profileOf(username);
    await profileOf(`lain.${RUN}`);
  });

  it("refuses the whole batch, creating nothing, when a jemaat already has an account", async () => {
    const linked = await newJemaat("SudahAda");
    await createAccounts([{ jemaatId: linked.id, username: `sudahada.${RUN}` }]);
    await profileOf(`sudahada.${RUN}`);
    const fresh = await newJemaat("Baru");

    const result = await createAccounts([
      { jemaatId: fresh.id, username: `baru.${RUN}` },
      { jemaatId: linked.id, username: `sudahada.dua.${RUN}` },
    ]);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain(linked.nama);
    expect(await profileOf(`baru.${RUN}`)).toBeNull();
  });

  it("refuses invalid and reserved usernames, duplicates in a batch, and accounts without users:create", async () => {
    const jemaat = await newJemaat("Tolak");
    for (const username of ["Admin", "ab", "gkp.admin", "budi..santoso"]) {
      const result = await createAccounts([{ jemaatId: jemaat.id, username }]);
      expect(result.status).toBe(400);
    }
    const other = await newJemaat("Tolak");
    const dup = await createAccounts([
      { jemaatId: jemaat.id, username: `dup.${RUN}` },
      { jemaatId: other.id, username: `dup.${RUN}` },
    ]);
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/dipakai dua kali/);

    for (const session of [viewer, editor, admin, panitia]) {
      const result = await createAccounts([{ jemaatId: jemaat.id, username: `tolak.${RUN}` }], session);
      expect(result.status).toBe(403);
    }
    expect(await profileOf(`tolak.${RUN}`)).toBeNull();
  });
});

describe("Username login at /portal/masuk", () => {
  it("the right username and temporary password: logged in, sent to /jemaat/ganti-password whatever next says", async () => {
    freshIp();
    const jemaat = await newJemaat("Masuk");
    const username = `datang.${RUN}`;
    const created = (await createAccounts([{ jemaatId: jemaat.id, username }])).data!.created[0]!;
    await profileOf(username);

    actAs(null);
    // Typed with capitals and spaces: normalized on the server.
    expect(await redirectOf(() => loginUsername(`  DATANG.${RUN} `, created.password, "/jemaat/profil"))).toBe(
      "/jemaat/ganti-password",
    );
    const user = await getAuthenticatedUser();
    expect(user?.username).toBe(username);
    expect(user?.wajibGantiPassword).toBe(true);
    await logoutJemaat().catch(() => {});
  });

  it("a wrong password and a username that doesn't exist answer identically, after the same minimum time", async () => {
    freshIp();
    const jemaat = await newJemaat("Salah");
    const username = `salah.${RUN}`;
    await createAccounts([{ jemaatId: jemaat.id, username }]);
    await profileOf(username);
    actAs(null);

    const t0 = Date.now();
    const wrong = await loginUsername(username, "bukan-password-ini");
    const t1 = Date.now();
    const unknown = await loginUsername(`tidakada.${RUN}`, "bukan-password-ini");
    const t2 = Date.now();
    const malformed = await loginUsername("Bukan..Format", "bukan-password-ini");

    expect(wrong.error).toBe("Username atau password salah.");
    expect({ ...unknown, username: "" }).toEqual({ ...wrong, username: "" });
    expect({ ...malformed, username: "" }).toEqual({ ...wrong, username: "" });
    expect(t1 - t0).toBeGreaterThanOrEqual(790);
    expect(t2 - t1).toBeGreaterThanOrEqual(790);
    expect(await getAuthenticatedUser()).toBeNull();

    // A missing field is refused before anything else.
    expect((await loginUsername("", "x")).error).toBe("Username dan password wajib diisi.");
  });

  it("locks an account after 5 wrong passwords, even for the right one, on both tabs; an unknown username locks the same way", async () => {
    freshIp();
    const jemaat = await newJemaat("Kunci");
    const username = `kunci.${RUN}`;
    const created = (await createAccounts([{ jemaatId: jemaat.id, username }])).data!.created[0]!;
    await profileOf(username);
    actAs(null);

    for (let i = 0; i < 5; i += 1) {
      expect((await loginUsername(username, `salah-${i}`)).error).toBe("Username atau password salah.");
    }
    const locked = await loginUsername(username, created.password);
    expect(locked.error).toBe("Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.");
    expect(await getAuthenticatedUser()).toBeNull();

    // The email tab with the internal address counts against the same account.
    const viaEmail = await portalLogin(
      { error: null, cara: "email", username: "", email: "" },
      form({ cara: "email", email: `${username}@${DOMAIN}`, password: created.password }),
    );
    expect(viaEmail.error).toBe("Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.");
    expect(await getAuthenticatedUser()).toBeNull();

    // Other accounts from the same IP are not locked.
    expect((await loginUsername(`lainnya.${RUN}`, "x")).error).toBe("Username atau password salah.");

    // An unknown username: same answers in the same order.
    const ghost = `hantu.${RUN}`;
    for (let i = 0; i < 5; i += 1) expect((await loginUsername(ghost, `salah-${i}`)).error).toBe("Username atau password salah.");
    expect((await loginUsername(ghost, created.password)).error).toBe(locked.error);
  });
});

describe("Forced password change (wajib_ganti_password)", () => {
  it("blocks every other /jemaat route (proxy, pages, actions, REST) until changed, then clears the flag", async () => {
    freshIp();
    const jemaat = await newJemaat("Ganti");
    const username = `ganti.${RUN}`;
    const created = (await createAccounts([{ jemaatId: jemaat.id, username }])).data!.created[0]!;
    const profile = await profileOf(username);
    const session = await signIn(`${username}@${DOMAIN}`, created.password);

    for (const path of [
      "/jemaat",
      "/jemaat/profil",
      "/jemaat/pelayanan",
      "/jemaat/komisi",
      "/jemaat/persembahan",
      "/jemaat/akun",
      "/jemaat/pemilihan/00000000-0000-4000-8000-000000000000",
      "/jemaat/tidak-ada",
    ]) {
      expect(await proxyTarget(session, path), path).toBe("/jemaat/ganti-password");
    }
    expect(await proxyTarget(session, "/jemaat/ganti-password")).toBeNull();
    // Not the admin side or public pages.
    expect(await proxyTarget(session, "/portal")).toBeNull();

    // The pages and layout redirect too (they don't rely on the proxy).
    actAs(session);
    expect(await redirectOf(async () => (await import("@/app/jemaat/(portal)/layout")).default({ children: null }))).toBe(
      "/jemaat/ganti-password",
    );
    expect(await redirectOf(async () => (await import("@/app/jemaat/(portal)/akun/page")).default())).toBe(
      "/jemaat/ganti-password",
    );
    expect(await redirectOf(async () => (await import("@/app/jemaat/(portal)/profil/actions")).submitPengajuanAction({}))).toBe(
      "/jemaat/ganti-password",
    );
    expect((await hapusAkunLogin()).error).toBe("Ganti password sementara terlebih dahulu.");

    // Over REST, every portal function refuses with PT428 (HTTP 428).
    const token = (await session.supabase.auth.getSession()).data.session!.access_token;
    for (const fn of ["profil_saya", "keluarga_saya", "pemilihan_aktif_saya"]) {
      const response = await rest(`rpc/${fn}`, token, {}, "portal");
      expect(response.status, fn).toBe(428);
      expect(response.json?.code).toBe("PT428");
    }

    // The change page itself renders, naming the username, never the internal email.
    const page = renderToStaticMarkup(await (await import("@/app/jemaat/ganti-password/page")).default());
    expect(page).toContain(username);
    expect(page).not.toContain(`@${DOMAIN}`);

    // Refusals: mismatch, too short, the temporary password itself.
    const change = (password: string, confirm = password) =>
      gantiPasswordSementara({ error: null }, form({ password, confirm }));
    expect((await change("sandi-baru-1", "sandi-baru-2")).error).toBe("Konfirmasi password tidak sama.");
    expect((await change("pendek")).error).toBe("Password minimal 8 karakter.");
    expect((await change(created.password)).error).toBe("Password baru harus berbeda dari password sementara.");

    expect(await redirectOf(() => change("sandi-baru-jemaat-1"))).toBe("/jemaat");
    const { data: after } = await svc.from("profiles").select("wajib_ganti_password").eq("id", profile!.id).single();
    expect(after?.wajib_ganti_password).toBe(false);
    const { data: log } = await svc
      .from("activity_logs")
      .select("module")
      .eq("user_id", profile!.id)
      .eq("activity", "Mengganti password sementara");
    expect(log).toEqual([{ module: "akun" }]);

    // Free to go now; /jemaat/akun shows the username, not the internal email.
    expect(await proxyTarget(session, "/jemaat")).toBeNull();
    expect(await redirectOf(async () => (await import("@/app/jemaat/ganti-password/page")).default())).toBe("/jemaat");
    const akun = renderToStaticMarkup(await (await import("@/app/jemaat/(portal)/akun/page")).default());
    expect(akun).toContain(username);
    expect(akun).not.toContain(`@${DOMAIN}`);
    const layout = (await (await import("@/app/jemaat/(portal)/layout")).default({ children: null })) as {
      props: { akun: string };
    };
    expect(layout.props.akun).toBe(username);
    expect((await rest("rpc/profil_saya", token, {}, "portal")).status).toBe(200);

    // The new password signs in straight to /jemaat; the temporary one no longer works.
    actAs(null);
    freshIp();
    expect(await redirectOf(() => loginUsername(username, "sandi-baru-jemaat-1"))).toBe("/jemaat");
    await logoutJemaat().catch(() => {});
    actAs(null);
    expect((await loginUsername(username, created.password)).error).toBe("Username atau password salah.");
  });
});

describe("Reset password (users:update, or pemilihan:update for jemaat-only accounts)", () => {
  async function reset(as: Session | null, id: string) {
    actAs(as);
    const result = await call(resetRoute.POST, { method: "POST", params: { id } });
    const data = result.body.data as { nama: string; username: string | null; password: string } | undefined;
    if (data) issuedPasswords.push(data.password);
    return { ...result, data };
  }

  it("refuses roles without the permission (403), staff targets (400), and no session (401)", async () => {
    const jemaat = await newJemaat("Reset");
    const username = `reset.${RUN}`;
    await createAccounts([{ jemaatId: jemaat.id, username }]);
    const target = (await profileOf(username))!;

    for (const session of [viewer, editor, admin]) {
      const result = await reset(session, target.id);
      expect(result.status).toBe(403);
      expect(result.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
    }
    // A jemaat-only account (no role) is not staff at all.
    const jemaatSession = await signIn(`${username}@${DOMAIN}`, issuedPasswords.at(-1)!);
    expect((await reset(jemaatSession, target.id)).status).toBe(403);
    expect((await reset(null, target.id)).status).toBe(401);

    const panitiaOnStaff = await reset(panitia, staffJemaatId);
    expect(panitiaOnStaff.status).toBe(400);
    expect(panitiaOnStaff.body.error).toBe("Password akun pengurus tidak bisa direset dari sini.");
    expect((await reset(superadmin, staffJemaatId)).status).toBe(400);
    expect((await reset(panitia, "bukan-uuid")).status).toBe(404);
  });

  it("panitia resets a username account: new temporary password once, old one dead, sessions revoked, flag on, logged without it", async () => {
    freshIp();
    const jemaat = await newJemaat("ResetOk");
    const username = `resetok.${RUN}`;
    const created = (await createAccounts([{ jemaatId: jemaat.id, username }])).data!.created[0]!;
    const target = (await profileOf(username))!;

    // The jemaat changes the temporary password and is signed in elsewhere.
    const device = await signIn(`${username}@${DOMAIN}`, created.password);
    await device.supabase.auth.updateUser({ password: "sandi-lama-jemaat" });
    await svc.from("profiles").update({ wajib_ganti_password: false }).eq("id", target.id);

    const result = await reset(panitia, target.id);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ nama: jemaat.nama, username, password: expect.stringMatching(/^[a-z2-9]{12}$/) });

    const { data: after } = await svc.from("profiles").select("wajib_ganti_password").eq("id", target.id).single();
    expect(after?.wajib_ganti_password).toBe(true);
    // The device's refresh token is gone with its session.
    const refreshed = await device.supabase.auth.refreshSession();
    expect(refreshed.error).not.toBeNull();

    actAs(null);
    freshIp();
    expect((await loginUsername(username, "sandi-lama-jemaat")).error).toBe("Username atau password salah.");
    expect(await redirectOf(() => loginUsername(username, result.data!.password))).toBe("/jemaat/ganti-password");
    await logoutJemaat().catch(() => {});

    const { data: logs } = await svc
      .from("activity_logs")
      .select("activity, module")
      .like("activity", `Mereset password akun "${username}"%`);
    expect(logs).toEqual([{ activity: `Mereset password akun "${username}" (${jemaat.nama})`, module: "users" }]);

    // super_admin may reset it too.
    expect((await reset(superadmin, target.id)).status).toBe(200);
  });
});

describe("Secrets and configuration", () => {
  it("the reserved words in TypeScript and in SQL are the same list", () => {
    const sql = localPsql("select array_to_string(private.username_kata_terlarang(), ',');").trim().split(",");
    expect([...sql].sort()).toEqual([...USERNAME_KATA_TERLARANG].sort());
  });

  it("no temporary password reached the activity log, the server console, or the Postgres and GoTrue logs", async () => {
    expect(issuedPasswords.length).toBeGreaterThanOrEqual(8);
    const { data: logs, error } = await svc
      .from("activity_logs")
      .select("activity, user_email")
      .gte("created_at", STARTED.toISOString());
    if (error) throw error;
    expect(logs.length).toBeGreaterThan(0);
    const logText = JSON.stringify(logs);
    const consoleText = consoleOutput.join("\n");
    const since = Math.floor(STARTED.getTime() / 1000) - 5;
    const dockerLogs = ["db", "auth", "rest"]
      .map((service) => {
        const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)![1];
        return execSync(`docker logs --since ${since} supabase_${service}_${projectId} 2>&1`, {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        });
      })
      .join("\n");
    expect(dockerLogs.length).toBeGreaterThan(0);
    for (const password of issuedPasswords) {
      expect(logText).not.toContain(password);
      expect(consoleText).not.toContain(password);
      expect(dockerLogs).not.toContain(password);
    }
    // Nor the passwords the jemaat chose.
    for (const chosen of ["sandi-baru-jemaat-1", "sandi-lama-jemaat"]) {
      expect(logText + consoleText + dockerLogs).not.toContain(chosen);
    }
  });
});
