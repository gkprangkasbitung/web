/**
 * Stage 10 against the local stack: Pengguna, Roles & Permissions, Log
 * Aktivitas, and Profil Saya (brief §9.11-9.14, §12.3, §13 #1, #12, #14).
 *
 * Covers: 401/403 on every route and the forbidden redirect on every page;
 * the invite flow (redirectTo from SITE_URL even with forged headers, the
 * email link, friendly errors, 207 when role/jemaat fails); one jemaat per
 * account; own-account refusals; the last super_admin; a role change taking
 * effect on the very next request; a deleted user's old cookie rejected;
 * activity_logs refusing update/delete over REST; the log's WIB date range
 * and search; and the password change with the current password.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  actAs,
  call,
  CLIENT_IP,
  createTestUser,
  env,
  latestMail,
  serviceClient,
  setRequestHeaders,
  signIn,
  type Session,
} from "./harness";

// Wraps the real invite so the test can read the redirectTo it was given.
vi.mock("@/lib/supabase/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/admin")>();
  return { ...actual, inviteUser: vi.fn(actual.inviteUser) };
});

const admin = await import("@/lib/supabase/admin");
const usersRoute = await import("@/app/api/admin/users/route");
const userRoute = await import("@/app/api/admin/users/[id]/route");
const rolesRoute = await import("@/app/api/admin/roles/route");
const roleRoute = await import("@/app/api/admin/roles/[id]/route");
const profileRoute = await import("@/app/api/account/profile/route");
const passwordRoute = await import("@/app/api/account/password/route");
const tempatRoute = await import("@/app/api/admin/tempat/route");
const { getAuthenticatedUser } = await import("@/lib/auth/session");
const { loadActivityLogPage } = await import("@/lib/activity-log-routes");
const { parseTableSearchParams } = await import("@/components/data-table/search-params");
const { ACTIVITY_LOG_TABLE_CONFIG } = await import("@/lib/activity-log-table");
const { createClient } = await import("@/lib/supabase/server");

const RUN = Date.now().toString(36);
const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
const TEST_PASSWORD = "rahasia-uji-123";

const svc = serviceClient();
let superadmin: Session;
let viewer: Session;
let adminRole: Session;
const createdUsers: string[] = [];
const createdRoles: string[] = [];
const createdTempat: string[] = [];

type Body = { data?: Record<string, unknown>; error?: string };
const body = (response: { body: unknown }) => response.body as Body;

async function roleId(name: string): Promise<string> {
  const { data, error } = await svc.from("roles").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function logCount(activity: string): Promise<number> {
  const { count, error } = await svc
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("activity", activity)
    .eq("ip_address", CLIENT_IP);
  if (error) throw error;
  return count ?? 0;
}

async function freeJemaatId(skip: string[] = []): Promise<string> {
  const [jemaat, linked] = await Promise.all([
    svc.from("jemaat").select("id").order("nama"),
    svc.from("profiles").select("jemaat_id").not("jemaat_id", "is", null),
  ]);
  const taken = new Set([...(linked.data ?? []).map((p) => p.jemaat_id), ...skip]);
  const free = (jemaat.data ?? []).find((j) => !taken.has(j.id));
  if (!free) throw new Error("No unlinked jemaat in the seed.");
  return free.id;
}

async function userByEmail(email: string) {
  const { data } = await svc.from("profiles").select("id, jemaat_id, full_name").eq("email", email).maybeSingle();
  return data;
}

async function rolesOf(userId: string): Promise<string[]> {
  const { data } = await svc.from("user_roles").select("roles(name)").eq("user_id", userId);
  return (data ?? []).map((r) => (r as unknown as { roles: { name: string } }).roles.name).sort();
}

async function testUser(label: string, roles: string[]) {
  const email = `uji-${label}-${RUN}@test.local`;
  const id = await createTestUser(email, TEST_PASSWORD, roles);
  createdUsers.push(id);
  return { id, email, session: await signIn(email, TEST_PASSWORD) };
}

async function customRole(name: string, permissions: [string, string][]): Promise<string> {
  const { data, error } = await svc.from("roles").insert({ name: `${name}_${RUN}` }).select("id").single();
  if (error) throw error;
  createdRoles.push(data.id);
  const perms = await svc.from("permissions").select("id, resource, action");
  const grants = (perms.data ?? [])
    .filter((p) => permissions.some(([r, a]) => p.resource === r && p.action === a))
    .map((p) => ({ role_id: data.id, permission_id: p.id }));
  const insert = await svc.from("role_permissions").insert(grants);
  if (insert.error) throw insert.error;
  return data.id;
}

beforeAll(async () => {
  [superadmin, viewer, adminRole] = await Promise.all([
    signIn("superadmin@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("admin@gkp.test"),
  ]);
});

afterAll(async () => {
  setRequestHeaders({});
  for (const id of createdTempat) await svc.from("tempat").delete().eq("id", id);
  for (const id of createdUsers) await svc.auth.admin.deleteUser(id);
  for (const id of createdRoles) await svc.from("roles").delete().eq("id", id);
});

describe("access (§13 #1)", () => {
  it("answers 401 to every route without a session", async () => {
    actAs(null);
    const responses = [
      await call(usersRoute.POST, { method: "POST", body: { email: "x@test.local" } }),
      await call(userRoute.PATCH, { method: "PATCH", body: {}, params: { id: MISSING_ID } }),
      await call(userRoute.DELETE, { method: "DELETE", params: { id: MISSING_ID } }),
      await call(rolesRoute.POST, { method: "POST", body: { name: "x" } }),
      await call(roleRoute.PATCH, { method: "PATCH", body: { permissionIds: [] }, params: { id: MISSING_ID } }),
      await call(roleRoute.DELETE, { method: "DELETE", params: { id: MISSING_ID } }),
      await call(profileRoute.PATCH, { method: "PATCH", body: { fullName: "x" } }),
      await call(passwordRoute.POST, { method: "POST", body: { currentPassword: "x", password: "y", confirm: "y" } }),
    ];
    for (const response of responses) expect(response.status).toBe(401);
  });

  it("answers 403 to a viewer on Pengguna and Roles, and to admin (roles:read only) on every write", async () => {
    const viewerRole = await roleId("viewer");
    for (const session of [viewer, adminRole]) {
      actAs(session);
      const responses = [
        await call(usersRoute.POST, { method: "POST", body: { email: `tolak-${RUN}@test.local` } }),
        await call(userRoute.PATCH, { method: "PATCH", body: { roleId: null, jemaatId: null }, params: { id: MISSING_ID } }),
        await call(userRoute.DELETE, { method: "DELETE", params: { id: MISSING_ID } }),
        await call(rolesRoute.POST, { method: "POST", body: { name: `tolak_${RUN}` } }),
        await call(roleRoute.PATCH, { method: "PATCH", body: { permissionIds: [] }, params: { id: viewerRole } }),
        await call(roleRoute.DELETE, { method: "DELETE", params: { id: viewerRole } }),
      ];
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(body(response).error).toBe("Kamu tidak punya akses untuk tindakan ini.");
      }
    }
    expect(await userByEmail(`tolak-${RUN}@test.local`)).toBeNull();
    expect((await svc.from("roles").select("id").eq("name", `tolak_${RUN}`)).data).toEqual([]);
  });

  it("redirects a viewer opening Pengguna, Roles, or Log Aktivitas to /admin?error=forbidden", async () => {
    actAs(viewer);
    const users = (await import("@/app/admin/users/page")).default;
    const roles = (await import("@/app/admin/roles/page")).default;
    const log = (await import("@/app/admin/log-aktivitas/page")).default;
    for (const render of [() => users(), () => roles(), () => log({ searchParams: Promise.resolve({}) })]) {
      await expect(render()).rejects.toMatchObject({ digest: expect.stringContaining("/admin?error=forbidden") });
    }
  });
});

describe("Pengguna", () => {
  const inviteEmail = `undang-${RUN}@test.local`;

  it("invites with redirectTo from SITE_URL even with a forged Host, and sets role + jemaat", async () => {
    actAs(superadmin);
    setRequestHeaders({ host: "evil.example", "x-forwarded-host": "evil.example", origin: "https://evil.example" });
    const jemaatId = await freeJemaatId();
    const editor = await roleId("editor");

    const response = await call(usersRoute.POST, {
      method: "POST",
      body: { email: `  ${inviteEmail.toUpperCase()} `, fullName: "Uji Undangan", roleId: editor, jemaatId },
      headers: { host: "evil.example", "x-forwarded-host": "evil.example", origin: "https://evil.example" },
    });
    setRequestHeaders({});
    expect(response.status).toBe(201);

    const inviteMock = vi.mocked(admin.inviteUser);
    expect(inviteMock).toHaveBeenLastCalledWith({
      email: inviteEmail,
      fullName: "Uji Undangan",
      redirectTo: "http://127.0.0.1:3000/auth/callback?next=/auth/set-password",
    });

    const profile = await userByEmail(inviteEmail);
    expect(profile).toMatchObject({ jemaat_id: jemaatId, full_name: "Uji Undangan" });
    createdUsers.push(profile!.id);
    expect(await rolesOf(profile!.id)).toEqual(["editor"]);
    expect(await logCount(`Mengundang pengguna "${inviteEmail}"`)).toBe(1);

    // The email's link is built from the Site URL (supabase/templates/invite.html).
    let mail = null;
    for (let attempt = 0; attempt < 20 && !mail; attempt++) {
      mail = await latestMail(inviteEmail);
      if (!mail) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(mail?.subject).toBe("Undangan ke admin GKP Rangkasbitung");
    const href = /href="([^"]+)"/.exec(mail!.html)?.[1]?.replaceAll("&amp;", "&") ?? "";
    expect(href).toMatch(/^http:\/\/127\.0\.0\.1:3000\/auth\/callback\?next=\/auth\/set-password&token_hash=[^&]+&type=invite$/);
    expect(href).not.toContain("evil.example");
  });

  it("refuses an email that is already registered, and a jemaat already linked, without sending anything", async () => {
    actAs(superadmin);
    const exists = await call(usersRoute.POST, { method: "POST", body: { email: "editor@gkp.test" } });
    expect(exists.status).toBe(400);
    expect(body(exists).error).toBe("Email ini sudah terdaftar sebagai pengguna.");

    const linked = (await userByEmail(inviteEmail))!.jemaat_id!;
    const calls = vi.mocked(admin.inviteUser).mock.calls.length;
    const taken = await call(usersRoute.POST, { method: "POST", body: { email: `dua-${RUN}@test.local`, jemaatId: linked } });
    expect(taken.status).toBe(400);
    expect(body(taken).error).toBe("Jemaat ini sudah terhubung ke akun lain.");
    expect(vi.mocked(admin.inviteUser).mock.calls.length).toBe(calls);
    expect(await userByEmail(`dua-${RUN}@test.local`)).toBeNull();

    const invalid = await call(usersRoute.POST, { method: "POST", body: { email: "bukan-email" } });
    expect(invalid.status).toBe(400);
    expect(body(invalid).error).toBe("Format email tidak valid.");
  });

  it("answers 207 when the invite went out but the role step failed", async () => {
    // users:create and the reads, but no users:update, so set_user_access is refused.
    const roleIdPengundang = await customRole("uji_pengundang", [
      ["users", "create"],
      ["users", "read"],
      ["roles", "read"],
    ]);
    const pengundang = await testUser("pengundang", []);
    await svc.from("user_roles").insert({ user_id: pengundang.id, role_id: roleIdPengundang });

    actAs(pengundang.session);
    const email = `parsial-${RUN}@test.local`;
    const response = await call(usersRoute.POST, { method: "POST", body: { email, roleId: await roleId("viewer") } });
    expect(response.status).toBe(207);
    expect(body(response).error).toBe("Pengguna diundang, tapi gagal set role/jemaat: Kamu tidak punya akses untuk tindakan ini.");
    const profile = await userByEmail(email);
    expect(profile).not.toBeNull();
    createdUsers.push(profile!.id);
    expect(await rolesOf(profile!.id)).toEqual([]);
    expect(await logCount(`Mengundang pengguna "${email}"`)).toBe(1);
  });

  it("edits role and jemaat together, keeps one jemaat per account, and logs the change", async () => {
    actAs(superadmin);
    const invited = (await userByEmail(inviteEmail))!;
    const other = await testUser("tautan", ["viewer"]);
    const otherJemaat = await freeJemaatId([invited.jemaat_id!]);
    expect((await call(userRoute.PATCH, { method: "PATCH", body: { roleId: await roleId("viewer"), jemaatId: otherJemaat }, params: { id: other.id } })).status).toBe(200);

    const taken = await call(userRoute.PATCH, {
      method: "PATCH",
      body: { roleId: await roleId("admin"), jemaatId: otherJemaat },
      params: { id: invited.id },
    });
    expect(taken.status).toBe(400);
    expect(body(taken).error).toBe("Jemaat ini sudah terhubung ke akun lain.");
    expect(await rolesOf(invited.id)).toEqual(["editor"]);

    const saved = await call(userRoute.PATCH, {
      method: "PATCH",
      body: { roleId: await roleId("admin"), jemaatId: null },
      params: { id: invited.id },
    });
    expect(saved.status).toBe(200);
    expect(await rolesOf(invited.id)).toEqual(["admin"]);
    expect((await userByEmail(inviteEmail))!.jemaat_id).toBeNull();
    expect(await logCount(`Mengubah akses pengguna "${inviteEmail}": role "admin", jemaat "Tidak ada"`)).toBe(1);

    expect((await call(userRoute.PATCH, { method: "PATCH", body: { roleId: null, jemaatId: null }, params: { id: MISSING_ID } })).status).toBe(404);
    expect((await call(userRoute.PATCH, { method: "PATCH", body: {}, params: { id: "bukan-uuid" } })).status).toBe(404);
  });

  it("refuses changing your own role, but lets you change only your own jemaat link", async () => {
    const me = await testUser("sendiri", ["super_admin"]);
    actAs(me.session);
    const refused = await call(userRoute.PATCH, {
      method: "PATCH",
      body: { roleId: await roleId("admin"), jemaatId: null },
      params: { id: me.id },
    });
    expect(refused.status).toBe(403);
    expect(body(refused).error).toBe("Tidak bisa mengubah role akun sendiri.");

    const jemaatId = await freeJemaatId();
    const linked = await call(userRoute.PATCH, { method: "PATCH", body: { jemaatId }, params: { id: me.id } });
    expect(linked.status).toBe(200);
    expect(await rolesOf(me.id)).toEqual(["super_admin"]);
    expect((await userByEmail(me.email))!.jemaat_id).toBe(jemaatId);
    await svc.from("profiles").update({ jemaat_id: null }).eq("id", me.id);
  });

  it("nobody can delete their own account (§13 #12)", async () => {
    actAs(superadmin);
    const { id } = (await getAuthenticatedUser())!;
    const response = await call(userRoute.DELETE, { method: "DELETE", params: { id } });
    expect(response.status).toBe(403);
    expect(body(response).error).toBe("Tidak bisa menghapus akun sendiri.");
    expect(await userByEmail("superadmin@gkp.test")).not.toBeNull();
  });

  it("the last super_admin cannot be demoted or deleted", async () => {
    const holders = await svc.from("user_roles").select("user_id").eq("role_id", await roleId("super_admin"));
    // Throwaway super_admins from other tests are removed first, so the seeded one is the last.
    for (const row of holders.data ?? []) {
      if (createdUsers.includes(row.user_id)) await svc.auth.admin.deleteUser(row.user_id);
    }
    const manager = await testUser("pengelola", []);
    await svc.from("user_roles").insert({
      user_id: manager.id,
      role_id: await customRole("uji_pengelola", [
        ["users", "create"],
        ["users", "read"],
        ["users", "update"],
        ["users", "delete"],
        ["roles", "read"],
      ]),
    });
    const seeded = (await userByEmail("superadmin@gkp.test"))!.id;

    actAs(manager.session);
    const demote = await call(userRoute.PATCH, {
      method: "PATCH",
      body: { roleId: await roleId("admin"), jemaatId: null },
      params: { id: seeded },
    });
    expect(demote.status).toBe(403);
    expect(body(demote).error).toBe("Harus ada minimal satu super_admin.");

    const remove = await call(userRoute.DELETE, { method: "DELETE", params: { id: seeded } });
    expect(remove.status).toBe(403);
    expect(body(remove).error).toBe("Harus ada minimal satu super_admin.");
    expect(await rolesOf(seeded)).toEqual(["super_admin"]);
  });

  it("a role change applies on the very next request with the same cookie", async () => {
    const target = await testUser("ganti", ["viewer"]);
    const add = () => call(tempatRoute.POST, { method: "POST", body: { nama: `Uji Tempat ${RUN} ${Math.random()}` } });

    actAs(target.session);
    expect((await add()).status).toBe(403);

    actAs(superadmin);
    expect((await call(userRoute.PATCH, { method: "PATCH", body: { roleId: await roleId("editor"), jemaatId: null }, params: { id: target.id } })).status).toBe(200);

    actAs(target.session);
    const allowed = await add();
    expect(allowed.status).toBe(201);
    createdTempat.push(body(allowed).data!.id as string);

    actAs(superadmin);
    expect((await call(userRoute.PATCH, { method: "PATCH", body: { roleId: await roleId("viewer"), jemaatId: null }, params: { id: target.id } })).status).toBe(200);
    actAs(target.session);
    expect((await add()).status).toBe(403);
  });

  it("a deleted user's old cookie is rejected on the next request", async () => {
    const target = await testUser("hapus", ["editor"]);
    const accessToken = (await target.session.supabase.auth.getSession()).data.session!.access_token;

    actAs(superadmin);
    const response = await call(userRoute.DELETE, { method: "DELETE", params: { id: target.id } });
    expect(response.status).toBe(200);
    expect(await logCount(`Menghapus pengguna "${target.email}"`)).toBe(1);
    expect(await userByEmail(target.email)).toBeNull();

    actAs(target.session);
    expect(await getAuthenticatedUser()).toBeNull();
    const add = await call(tempatRoute.POST, { method: "POST", body: { nama: `Uji ${RUN} hapus` } });
    expect(add.status).toBe(401);
    await expect((await import("@/app/admin/akun/page")).default()).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });

    // Direct REST with the still-unexpired access token: no permissions, no log rows.
    const rest = { apikey: env.anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const tempat = await fetch(`${env.url}/rest/v1/tempat`, {
      method: "POST",
      headers: rest,
      body: JSON.stringify({ nama: `Uji ${RUN} rest` }),
    });
    expect(tempat.ok).toBe(false);
    const log = await fetch(`${env.url}/rest/v1/activity_logs`, {
      method: "POST",
      headers: rest,
      body: JSON.stringify({ user_id: target.id, module: "akun", activity: `Uji ${RUN} hantu` }),
    });
    expect(log.ok).toBe(false);
  });
});

describe("Roles & Permissions", () => {
  it("adds a role (unique case-insensitively), edits it, saves permissions without touching hidden grants, and deletes it", async () => {
    actAs(superadmin);
    const name = `uji_role_${RUN}`;
    const created = await call(rolesRoute.POST, { method: "POST", body: { name, description: "Contoh" } });
    expect(created.status).toBe(201);
    const id = body(created).data!.id as string;
    createdRoles.push(id);

    const dup = await call(rolesRoute.POST, { method: "POST", body: { name: name.toUpperCase() } });
    expect(dup.status).toBe(400);
    expect(body(dup).error).toBe("Nama role sudah digunakan.");
    expect((await call(rolesRoute.POST, { method: "POST", body: { name: "  " } })).status).toBe(400);

    const renamed = await call(roleRoute.PATCH, { method: "PATCH", body: { name: `${name}_baru`, description: null }, params: { id } });
    expect(renamed.status).toBe(200);
    expect(await logCount(`Mengubah nama role "${name}" menjadi "${name}_baru"`)).toBe(1);

    const perms = (await svc.from("permissions").select("id, resource, action")).data!;
    const pid = (r: string, a: string) => perms.find((p) => p.resource === r && p.action === a)!.id;
    await svc.from("role_permissions").insert({ role_id: id, permission_id: pid("content", "read") });

    const saved = await call(roleRoute.PATCH, {
      method: "PATCH",
      body: { permissionIds: [pid("warta", "read"), pid("warta", "update")] },
      params: { id },
    });
    expect(saved.status).toBe(200);
    const grants = await svc.from("role_permissions").select("permission_id").eq("role_id", id);
    expect(grants.data!.map((g) => g.permission_id).sort()).toEqual(
      [pid("content", "read"), pid("warta", "read"), pid("warta", "update")].sort(),
    );
    expect(await logCount(`Mengubah permission role "${name}_baru" (+warta:read, +warta:update)`)).toBe(1);

    const hidden = await call(roleRoute.PATCH, { method: "PATCH", body: { permissionIds: [pid("announcements", "read")] }, params: { id } });
    expect(hidden.status).toBe(400);
    expect(body(hidden).error).toBe("Permission tidak dikenal.");

    const removed = await call(roleRoute.DELETE, { method: "DELETE", params: { id } });
    expect(removed.status).toBe(200);
    expect(await logCount(`Menghapus role "${name}_baru"`)).toBe(1);
  });

  it("protects the super_admin role: no delete, no rename, no dropping roles:* / users:*", async () => {
    actAs(superadmin);
    const id = await roleId("super_admin");
    const perms = (await svc.from("permissions").select("id, resource, action")).data!;
    const visibleWithoutUsersDelete = perms
      .filter((p) => ["warta", "users", "roles", "activity_log"].includes(p.resource))
      .filter((p) => !(p.resource === "users" && p.action === "delete"))
      .map((p) => p.id);

    const del = await call(roleRoute.DELETE, { method: "DELETE", params: { id } });
    expect(del.status).toBe(403);
    // The superadmin holds this role, so the self-lockout guard (0021) answers first.
    expect(body(del).error).toBe("Tidak bisa mencabut akses roles atau users milik akun sendiri.");

    const rename = await call(roleRoute.PATCH, { method: "PATCH", body: { name: "super_admin_lama", description: null }, params: { id } });
    expect(rename.status).toBe(403);
    expect(body(rename).error).toBe("Nama role super_admin tidak bisa diubah.");

    // Another holder of roles:update (not a super_admin) gets the super_admin guard's message.
    const editorOfRoles = await testUser("peran", []);
    await svc.from("user_roles").insert({
      user_id: editorOfRoles.id,
      role_id: await customRole("uji_peran", [["roles", "read"], ["roles", "update"], ["roles", "delete"]]),
    });
    actAs(editorOfRoles.session);
    const strip = await call(roleRoute.PATCH, { method: "PATCH", body: { permissionIds: visibleWithoutUsersDelete }, params: { id } });
    expect(strip.status).toBe(403);
    expect(body(strip).error).toBe("Permission roles dan users milik super_admin tidak bisa dicabut.");
    const del2 = await call(roleRoute.DELETE, { method: "DELETE", params: { id } });
    expect(body(del2).error).toBe("Role super_admin tidak bisa dihapus.");
    expect((await svc.from("roles").select("name").eq("id", id).single()).data!.name).toBe("super_admin");
  });
});

describe("Log Aktivitas", () => {
  it("refuses update and delete over Supabase REST, even for super_admin", async () => {
    for (const session of [superadmin, viewer]) {
      const update = await session.supabase.from("activity_logs").update({ activity: "diubah" }).eq("module", "auth");
      expect(update.error?.code).toBe("42501");
      const del = await session.supabase.from("activity_logs").delete().eq("module", "auth");
      expect(del.error?.code).toBe("42501");
    }
  });

  it("includes an entry at 23:30 WIB on the end date, excludes 00:30 the next day, and escapes the search", async () => {
    const tag = `Uji log ${RUN}`;
    const insert = await svc.from("activity_logs").insert([
      { module: "roles", activity: `${tag} akhir A%B`, user_email: "uji-log@test.local", created_at: "2031-03-10T16:30:00Z" },
      { module: "roles", activity: `${tag} besok AXB`, user_email: "uji-log@test.local", created_at: "2031-03-10T17:30:00Z" },
      { module: "warta", activity: `${tag} awal`, user_email: "uji-log@test.local", created_at: "2031-03-09T17:00:00Z" },
    ]);
    expect(insert.error).toBeNull();

    actAs(superadmin);
    const supabase = await createClient();
    const load = async (params: Record<string, string>) => {
      const state = parseTableSearchParams(params, ACTIVITY_LOG_TABLE_CONFIG);
      const { data, error } = await loadActivityLogPage(supabase, state);
      expect(error).toBeNull();
      return data!;
    };

    const range = await load({ q: tag, created_at: "2031-03-10~2031-03-10" });
    expect(range.rows.map((r) => r.activity).sort()).toEqual([`${tag} akhir A%B`, `${tag} awal`]);

    const literal = await load({ q: `${tag} akhir A%B` });
    expect(literal.rows.map((r) => r.activity)).toEqual([`${tag} akhir A%B`]);

    const byModule = await load({ q: tag, module: "warta" });
    expect(byModule.rows.map((r) => r.activity)).toEqual([`${tag} awal`]);
    const unknownModule = await load({ q: tag, module: "bukan_modul" });
    expect(unknownModule.total).toBe(3);

    const injection = await load({ q: "x),activity.eq.y,(module.eq.z" });
    expect(injection.total).toBe(0);

    const past = await load({ q: tag, page: "999" });
    expect(past.pageIndex).toBe(0);
    expect(past.total).toBe(3);

    const clamped = parseTableSearchParams({ size: "1000", sort: "ip_address.asc" }, ACTIVITY_LOG_TABLE_CONFIG);
    expect(clamped.pagination.pageSize).toBe(10);
    expect(clamped.sorting).toEqual([]);
  });
});

describe("Profil Saya", () => {
  it("saves the full name, an empty value as null, and logs under akun", async () => {
    const me = await testUser("profil", []);
    actAs(me.session);
    expect((await call(profileRoute.PATCH, { method: "PATCH", body: { fullName: "  Nama Uji  " } })).status).toBe(200);
    expect((await userByEmail(me.email))!.full_name).toBe("Nama Uji");
    expect((await call(profileRoute.PATCH, { method: "PATCH", body: { fullName: "   " } })).status).toBe(200);
    expect((await userByEmail(me.email))!.full_name).toBeNull();

    const logs = await svc.from("activity_logs").select("module, activity, user_email").eq("user_email", me.email).order("created_at");
    expect(logs.data).toEqual([
      { module: "akun", activity: 'Mengubah nama lengkap menjadi "Nama Uji"', user_email: me.email },
      { module: "akun", activity: "Mengosongkan nama lengkap", user_email: me.email },
    ]);
  });

  it("changes the password only with the right current password, then signs out other sessions", async () => {
    const me = await testUser("sandi", []);
    const otherDevice = await signIn(me.email, TEST_PASSWORD);
    actAs(me.session);

    const wrong = await call(passwordRoute.POST, { method: "POST", body: { currentPassword: "salah-salah", password: "baru-12345", confirm: "baru-12345" } });
    expect(wrong.status).toBe(400);
    expect(body(wrong).error).toBe("Password saat ini salah.");
    const short = await call(passwordRoute.POST, { method: "POST", body: { currentPassword: TEST_PASSWORD, password: "pendek", confirm: "pendek" } });
    expect(body(short).error).toBe("Password minimal 8 karakter.");
    const mismatch = await call(passwordRoute.POST, { method: "POST", body: { currentPassword: TEST_PASSWORD, password: "baru-12345", confirm: "baru-54321" } });
    expect(body(mismatch).error).toBe("Konfirmasi password tidak sama.");
    const same = await call(passwordRoute.POST, { method: "POST", body: { currentPassword: TEST_PASSWORD, password: TEST_PASSWORD, confirm: TEST_PASSWORD } });
    expect(body(same).error).toBe("Password baru harus berbeda dari password saat ini.");

    const changed = await call(passwordRoute.POST, { method: "POST", body: { currentPassword: TEST_PASSWORD, password: "baru-12345", confirm: "baru-12345" } });
    expect(changed.status).toBe(200);
    expect(await logCount("Mengganti password")).toBeGreaterThan(0);

    // This session still works; the other device's session was revoked.
    expect(await getAuthenticatedUser()).not.toBeNull();
    actAs(otherDevice);
    expect(await getAuthenticatedUser()).toBeNull();

    await expect(signIn(me.email, TEST_PASSWORD)).rejects.toThrow();
    await expect(signIn(me.email, "baru-12345")).resolves.toBeDefined();
  });
});
