/**
 * Stage 11f against the local stack: the two portals and the access split.
 * Jemaat sign-in was switched from an email code to email + password
 * (follow-up): `/portal/masuk` is now structurally the same as `/login`.
 *
 * Covers: a jemaat account without a role is refused every /admin page
 * (→ /portal?error=akses) and admin route (403), and reads nothing over
 * Supabase REST with its own token; a staff account without a jemaat link
 * is refused /jemaat; staff + jemaat opens both; `next` can't leave the
 * portal's area (/portal/masuk?next=https://… or /admin → /jemaat,
 * /login?next=//evil.com → /admin, §13 #15); a wrong password and an
 * account that isn't a jemaat answer the same way; the admin login refuses
 * an account without a role; the Login/Logout log lines name the portal;
 * the proxy sends each area to its own login page; and an "Akun Jemaat"
 * invite end to end through Mailpit lands on "Atur Password", then /jemaat.
 */
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Stage 13b's /jemaat Beranda reads the public warta/kegiatan loaders,
// which call connection() to mark themselves request-time; outside a real
// Next request (renderToStaticMarkup here) it throws, so it's a no-op.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  actAs,
  call,
  createTestUser,
  env,
  latestMail,
  serviceClient,
  setRequestHeaders,
  signIn,
  type Session,
} from "./harness";

const { portalLogin } = await import("@/app/portal/masuk/actions");
type PortalLoginState = Awaited<ReturnType<typeof portalLogin>>;
const { login } = await import("@/app/login/actions");
const { logout } = await import("@/app/admin/actions");
const { logoutJemaat } = await import("@/app/jemaat/actions");
const { setPassword } = await import("@/app/auth/set-password/actions");
const callbackRoute = await import("@/app/auth/callback/route");
const usersRoute = await import("@/app/api/admin/users/route");
const tempatRoute = await import("@/app/api/admin/tempat/route");
const profileRoute = await import("@/app/api/account/profile/route");
const { getAuthenticatedUser } = await import("@/lib/auth/session");
const { updateSession } = await import("@/lib/supabase/proxy");

const RUN = Date.now().toString(36);
const PASSWORD = "rahasia-portal-123";
// A fresh client IP per run, so the per-IP limits don't carry over between runs.
const RUN_IP = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const NO_ACCESS = "/portal?error=akses";

const svc = serviceClient();
const createdUsers: string[] = [];
const createdJemaat: string[] = [];
let superadmin: Session;

type Account = { id: string; email: string; jemaatId: string | null; jemaatNama: string | null };

async function newJemaat(label: string): Promise<{ id: string; nama: string }> {
  const nama = `Uji Portal ${label} ${RUN}`;
  const { data, error } = await svc.from("jemaat").insert({ nama }).select("id").single();
  if (error) throw error;
  createdJemaat.push(data.id);
  return { id: data.id, nama };
}

/** A throwaway account with the given roles, optionally linked to a new jemaat. */
async function account(label: string, roles: string[], withJemaat: boolean): Promise<Account> {
  const email = `portal-${label}-${RUN}@test.local`;
  const id = await createTestUser(email, PASSWORD, roles);
  createdUsers.push(id);
  if (!withJemaat) return { id, email, jemaatId: null, jemaatNama: null };
  const jemaat = await newJemaat(label);
  const { error } = await svc.from("profiles").update({ jemaat_id: jemaat.id }).eq("id", id);
  if (error) throw error;
  return { id, email, jemaatId: jemaat.id, jemaatNama: jemaat.nama };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Runs something that should redirect; returns the target path. */
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

async function logCount(activity: string, userId: string): Promise<number> {
  const { count, error } = await svc
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("activity", activity)
    .eq("user_id", userId)
    .eq("module", "auth");
  if (error) throw error;
  return count ?? 0;
}

async function accessToken(session: Session): Promise<string> {
  return (await session.supabase.auth.getSession()).data.session!.access_token;
}

const adminLayout = async () => (await import("@/app/admin/layout")).default({ children: null });
const dashboard = async () => (await import("@/app/admin/page")).default({ searchParams: Promise.resolve({}) });
const profilSaya = async () => (await import("@/app/admin/akun/page")).default();
const penggunaPage = async () => (await import("@/app/admin/users/page")).default();
const jemaatPage = async () => (await import("@/app/jemaat/(portal)/page")).default();
// Stage 13b moved "Buka halaman admin" from the page into the shared shell
// the layout renders. The shell itself is a client component ("use client",
// usePathname), which isn't safely render-tested outside Next's app router
// (no provider here) — its own conditional rendering is a component test
// (jemaat-shell.test.tsx); here it's enough to check the layout wires the
// right `isStaffToo` onto the still-unrendered element.
const jemaatLayout = async () => (await import("@/app/jemaat/(portal)/layout")).default({ children: null });

beforeAll(async () => {
  superadmin = await signIn("superadmin@gkp.test");
  setRequestHeaders({ "x-forwarded-for": RUN_IP });
});

afterAll(async () => {
  setRequestHeaders({});
  for (const id of createdUsers) await svc.auth.admin.deleteUser(id);
  for (const id of createdJemaat) await svc.from("jemaat").delete().eq("id", id);
});

describe("access split", () => {
  it("a jemaat account without a role: /admin → /portal?error=akses, admin routes → 403, REST reads nothing", async () => {
    const jemaat = await account("jemaat-saja", [], true);
    const session = await signIn(jemaat.email, PASSWORD);
    actAs(session);

    for (const render of [adminLayout, dashboard, profilSaya, penggunaPage]) {
      expect(await redirectOf(render)).toBe(NO_ACCESS);
    }

    const responses = [
      await call(tempatRoute.POST, { method: "POST", body: { nama: `Uji ${RUN}` } }),
      await call(profileRoute.PATCH, { method: "PATCH", body: { fullName: "Uji" } }),
      await call(usersRoute.POST, { method: "POST", body: { email: `x-${RUN}@test.local` } }),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(responses[1]!.body.error).toBe("Akun ini tidak memiliki akses pengurus.");

    // Supabase REST with the account's own token: RLS gives it nothing.
    const headers = { apikey: env.anonKey, Authorization: `Bearer ${await accessToken(session)}` };
    for (const table of ["jemaat", "keluarga", "sarana_dana_transactions", "sarana_dana_balances", "peribadahan_items"]) {
      const response = await fetch(`${env.url}/rest/v1/${table}?select=*`, { headers });
      expect(response.status, table).toBe(200);
      expect(await response.json(), table).toEqual([]);
    }
    const report = await fetch(`${env.url}/rest/v1/rpc/sarana_dana_report`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_start: "2026-01-01", p_end: "2026-01-07" }),
    });
    expect(report.ok).toBe(false);
    // The seed has jemaat, so the empty answer above is RLS, not an empty table.
    expect((await svc.from("jemaat").select("id", { count: "exact", head: true })).count).toBeGreaterThan(0);

    // Its own portal works, and greets it with its own jemaat's name.
    const html = renderToStaticMarkup(await jemaatPage());
    expect(html).toContain(`Selamat datang, ${jemaat.jemaatNama}`);
    expect((await jemaatLayout()).props.isStaffToo).toBe(false);
  });

  it("a staff account without a jemaat link is sent from /jemaat to /portal?error=akses", async () => {
    const staff = await account("staff-saja", ["viewer"], false);
    actAs(await signIn(staff.email, PASSWORD));
    expect(await redirectOf(jemaatPage)).toBe(NO_ACCESS);
    await expect(adminLayout()).resolves.toBeTruthy();
  });

  it("a staff account that is also a jemaat opens both", async () => {
    const both = await account("keduanya", ["viewer"], true);
    actAs(await signIn(both.email, PASSWORD));
    await expect(adminLayout()).resolves.toBeTruthy();
    await expect(dashboard()).resolves.toBeTruthy();
    const html = renderToStaticMarkup(await jemaatPage());
    expect(html).toContain(`Selamat datang, ${both.jemaatNama}`);
    expect((await jemaatLayout()).props.isStaffToo).toBe(true);
  });

  it("the proxy sends /admin and /jemaat without a session to their own login page, with next", async () => {
    const admin = await updateSession(new NextRequest("http://127.0.0.1:3000/admin/warta?x=1"));
    expect(admin.status).toBe(307);
    const adminTarget = new URL(admin.headers.get("location")!);
    expect(adminTarget.pathname).toBe("/login");
    expect(adminTarget.searchParams.get("next")).toBe("/admin/warta?x=1");

    const jemaat = await updateSession(new NextRequest("http://127.0.0.1:3000/jemaat"));
    expect(jemaat.status).toBe(307);
    const jemaatTarget = new URL(jemaat.headers.get("location")!);
    expect(jemaatTarget.pathname).toBe("/portal/masuk");
    expect(jemaatTarget.searchParams.get("next")).toBe("/jemaat");

    expect((await updateSession(new NextRequest("http://127.0.0.1:3000/portal"))).status).toBe(200);
  });
});

/** The email tab's initial state (stage 14d made username the default tab). */
const EMAIL_TAB = { error: null, cara: "email", username: "", email: "" } as const satisfies PortalLoginState;

describe("Portal Jemaat sign-in with email + password", () => {
  it("?next=https://example.com ends on /jemaat, and logs Login ke Portal Jemaat", async () => {
    const jemaat = await account("next-luar", [], true);
    actAs(null);
    const target = await redirectOf(() =>
      portalLogin(EMAIL_TAB, form({ cara: "email", email: jemaat.email, password: PASSWORD, next: "https://example.com" })),
    );
    expect(target).toBe("/jemaat");
    expect(await logCount("Login ke Portal Jemaat", jemaat.id)).toBe(1);
    expect((await getAuthenticatedUser())?.id).toBe(jemaat.id);

    // Keluar: back to /portal, logged with the portal's name.
    expect(await redirectOf(() => logoutJemaat())).toBe("/portal");
    expect(await logCount("Logout dari Portal Jemaat", jemaat.id)).toBe(1);
  });

  it("?next=/admin ends on /jemaat too", async () => {
    const jemaat = await account("next-admin", [], true);
    actAs(null);
    const target = await redirectOf(() =>
      portalLogin(EMAIL_TAB, form({ cara: "email", email: jemaat.email, password: PASSWORD, next: "/admin" })),
    );
    expect(target).toBe("/jemaat");
  });

  it("a wrong password and an account that isn't a jemaat answer differently (that one check only), but neither opens a session", async () => {
    const jemaat = await account("salah-password", [], true);
    actAs(null);
    const wrong = await portalLogin(EMAIL_TAB, form({ cara: "email", email: jemaat.email, password: "bukan-ini" }));
    expect(wrong.error).toBe("Email atau password salah.");
    expect(await getAuthenticatedUser()).toBeNull();

    const staff = await account("staff-password", ["viewer"], false);
    const notJemaat = await portalLogin(EMAIL_TAB, form({ cara: "email", email: staff.email, password: PASSWORD }));
    expect(notJemaat.error).toBe("Akun ini belum terhubung ke data jemaat. Hubungi sekretariat untuk aktivasi Portal Jemaat.");
    expect(await getAuthenticatedUser()).toBeNull();
    expect(await logCount("Login ke Portal Jemaat", staff.id)).toBe(0);
  });

  it("refuses a missing password without calling Supabase", async () => {
    actAs(null);
    const result = await portalLogin(EMAIL_TAB, form({ cara: "email", email: `x-${RUN}@test.local`, password: "" }));
    expect(result.error).toBe("Email dan password wajib diisi.");
  });
});

describe("admin login", () => {
  it("/login?next=//evil.com ends on /admin (§13 #15), and logs Login ke Portal Pengurus", async () => {
    const staff = await account("admin-login", ["viewer"], false);
    actAs(null);
    const target = await redirectOf(() =>
      login({ error: null, email: "" }, form({ email: staff.email, password: PASSWORD, next: "//evil.com" })),
    );
    expect(target).toBe("/admin");
    expect(await logCount("Login ke Portal Pengurus", staff.id)).toBe(1);

    expect(await redirectOf(() => logout())).toBe("/portal");
    expect(await logCount("Logout dari Portal Pengurus", staff.id)).toBe(1);
  });

  it("keeps an /admin next, but never a /jemaat one", async () => {
    const staff = await account("admin-next", ["viewer", "editor"], true);
    actAs(null);
    expect(
      await redirectOf(() =>
        login({ error: null, email: "" }, form({ email: staff.email, password: PASSWORD, next: "/admin/warta" })),
      ),
    ).toBe("/admin/warta");
    actAs(null);
    expect(
      await redirectOf(() =>
        login({ error: null, email: "" }, form({ email: staff.email, password: PASSWORD, next: "/jemaat" })),
      ),
    ).toBe("/admin");
  });

  it("refuses an account without a role, even with the right password, and signs it out", async () => {
    const jemaat = await account("admin-tolak", [], true);
    actAs(null);
    const result = await login({ error: null, email: "" }, form({ email: jemaat.email, password: PASSWORD }));
    expect(result.error).toBe("Akun ini tidak memiliki akses pengurus.");
    expect(await getAuthenticatedUser()).toBeNull();
    expect(await logCount("Login ke Portal Pengurus", jemaat.id)).toBe(0);
  });
});

describe('"Akun Jemaat" invite (§9.11, stage 11f)', () => {
  it("needs a jemaat", async () => {
    actAs(superadmin);
    const response = await call(usersRoute.POST, {
      method: "POST",
      body: { kind: "jemaat", email: `portal-undang-tanpa-${RUN}@test.local` },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Jemaat wajib dipilih untuk Akun Jemaat.");
  });

  it("end to end through Mailpit: the link lands on Atur Password, and setting one lands on /jemaat with no role", async () => {
    const jemaat = await newJemaat("undangan");
    const email = `portal-undang-${RUN}@test.local`;
    actAs(superadmin);
    const response = await call(usersRoute.POST, {
      method: "POST",
      body: { kind: "jemaat", email, jemaatId: jemaat.id, fullName: "diabaikan", roleId: null },
    });
    expect(response.status).toBe(201);
    const userId = (response.body.data as unknown as { id: string }).id;
    createdUsers.push(userId);

    const profile = await svc.from("profiles").select("jemaat_id, full_name").eq("id", userId).single();
    expect(profile.data).toEqual({ jemaat_id: jemaat.id, full_name: jemaat.nama });
    expect((await svc.from("user_roles").select("role_id").eq("user_id", userId)).data).toEqual([]);
    const log = await svc
      .from("activity_logs")
      .select("id")
      .eq("module", "users")
      .eq("activity", `Mengundang akun jemaat "${email}" untuk "${jemaat.nama}"`);
    expect(log.data).toHaveLength(1);

    const mail = await latestMail(email);
    expect(mail?.subject).toBe("Aktivasi Portal Jemaat GKP Rangkasbitung");
    const href = mail!.html.match(/href="([^"]+)"/)![1]!.replaceAll("&amp;", "&");
    expect(href).toMatch(
      /^http:\/\/127\.0\.0\.1:3000\/auth\/callback\?next=\/auth\/set-password&portal=jemaat&token_hash=[^&]+&type=invite$/,
    );

    // Following the link in a fresh browser: lands on Atur Password, same as a Pengurus invite.
    actAs(null);
    const callback = await callbackRoute.GET(new NextRequest(href));
    expect(new URL(callback.headers.get("location")!).pathname).toBe("/auth/set-password");
    expect((await getAuthenticatedUser())?.id).toBe(userId);

    // Setting the password lands on /jemaat (homePath), not /admin (no role).
    const target = await redirectOf(() =>
      setPassword({ error: null }, form({ password: "kata-sandi-jemaat-1", confirm: "kata-sandi-jemaat-1" })),
    );
    expect(target).toBe("/jemaat");
    expect(renderToStaticMarkup(await jemaatPage())).toContain(`Selamat datang, ${jemaat.nama}`);
    expect(await redirectOf(adminLayout)).toBe(NO_ACCESS);
    expect(await logCount("Mengatur password awal", userId)).toBe(1);

    // Keluar, then the password just set signs in like any other jemaat account.
    await logoutJemaat().catch(() => {});
    actAs(null);
    const signedIn = await redirectOf(() =>
      portalLogin(EMAIL_TAB, form({ cara: "email", email, password: "kata-sandi-jemaat-1" })),
    );
    expect(signedIn).toBe("/jemaat");
  });

  it("an expired or reused jemaat invite link goes to /portal/masuk, not the admin login", async () => {
    actAs(null);
    const callback = await callbackRoute.GET(
      new NextRequest(
        "http://127.0.0.1:3000/auth/callback?next=/auth/set-password&portal=jemaat&token_hash=bukan-token&type=invite",
      ),
    );
    const target = new URL(callback.headers.get("location")!);
    expect(target.pathname + target.search).toBe("/portal/masuk?error=tautan");
  });

  it("an expired or reused Pengurus invite link still goes to /login (no jemaat hint)", async () => {
    actAs(null);
    const callback = await callbackRoute.GET(
      new NextRequest("http://127.0.0.1:3000/auth/callback?next=/auth/set-password&token_hash=bukan-token&type=invite"),
    );
    const target = new URL(callback.headers.get("location")!);
    expect(target.pathname + target.search).toBe("/login");
  });
});
