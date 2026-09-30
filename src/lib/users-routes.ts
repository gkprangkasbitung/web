import "server-only";

import { z } from "zod";

import { SUPER_ADMIN_ROLE } from "@/lib/access";
import { quote } from "@/lib/activity-log";
import { ApiError, dbError, mutation, rpcError } from "@/lib/api-mutation";
import { listPeopleForPicker } from "@/lib/jemaat-routes";
import { inviteRedirectUrl, siteOrigin } from "@/lib/site-url";
import { deleteAuthUser, inviteUser } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText } from "@/lib/validation";

const NOT_FOUND = "Pengguna tidak ditemukan.";
const JEMAAT_TAKEN = "Jemaat ini sudah terhubung ke akun lain.";
const LAST_SUPER_ADMIN = "Harus ada minimal satu super_admin.";

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  /** Display name: full name, else email. */
  nama: string;
  roleIds: string[];
  /** Role names joined, or null for "Tanpa role"; the Role facet's value. */
  roleNames: string | null;
  jemaatId: string | null;
  jemaatNama: string | null;
};

export type UserPersonOption = {
  id: string;
  nama: string;
  labels: string[];
  /** Email of the account this jemaat is already linked to, if any. */
  linkedEmail: string | null;
  linkedUserId: string | null;
};

export type UsersOverview = {
  users: UserRow[];
  roles: { id: string; name: string }[];
  people: UserPersonOption[];
};

/** brief §9.11: a bounded list, loaded in full and paginated on the client. */
export async function loadUsersOverview(
  supabase: ServerSupabase,
): Promise<{ data: UsersOverview | null; error: string | null }> {
  const [profilesRes, userRolesRes, rolesRes, people] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, jemaat_id").order("email"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("roles").select("id, name").order("name"),
    listPeopleForPicker(supabase),
  ]);
  const failed = profilesRes.error ?? userRolesRes.error ?? rolesRes.error;
  if (failed || !profilesRes.data || !userRolesRes.data || !rolesRes.data) {
    return { data: null, error: failed?.message ?? "unknown" };
  }

  const roleNames = new Map(rolesRes.data.map((r) => [r.id, r.name]));
  const rolesByUser = new Map<string, string[]>();
  for (const ur of userRolesRes.data) {
    const list = rolesByUser.get(ur.user_id) ?? [];
    list.push(ur.role_id);
    rolesByUser.set(ur.user_id, list);
  }
  const jemaatNames = new Map(people.map((p) => [p.id, p.nama]));
  const linkedBy = new Map(
    profilesRes.data.filter((p) => p.jemaat_id).map((p) => [p.jemaat_id!, { id: p.id, email: p.email ?? "" }]),
  );

  const users = profilesRes.data.map((p): UserRow => {
    const roleIds = (rolesByUser.get(p.id) ?? []).sort((a, b) =>
      (roleNames.get(a) ?? "").localeCompare(roleNames.get(b) ?? ""),
    );
    const names = roleIds.map((id) => roleNames.get(id)).filter((name): name is string => Boolean(name));
    const fullName = p.full_name?.trim() || null;
    const email = p.email ?? "";
    return {
      id: p.id,
      email,
      fullName,
      nama: fullName ?? email,
      roleIds,
      roleNames: names.length > 0 ? names.join(", ") : null,
      jemaatId: p.jemaat_id,
      jemaatNama: p.jemaat_id ? (jemaatNames.get(p.jemaat_id) ?? null) : null,
    };
  });

  return {
    data: {
      users,
      roles: rolesRes.data,
      people: people.map((p) => {
        const linked = linkedBy.get(p.id);
        return { id: p.id, nama: p.nama, labels: p.labels, linkedEmail: linked?.email ?? null, linkedUserId: linked?.id ?? null };
      }),
    },
    error: null,
  };
}

const optionalId = z
  .uuid({ error: "Data yang dikirim tidak valid." })
  .nullish()
  .transform((value) => value ?? null);

const inviteSchema = z.object({
  email: z
    .string({ error: "Email wajib diisi." })
    .trim()
    .min(1, "Email wajib diisi.")
    .max(254, "Email terlalu panjang.")
    .toLowerCase()
    .pipe(z.email({ error: "Format email tidak valid." })),
  fullName: optionalText(100),
  roleId: optionalId,
  jemaatId: optionalId,
});

async function roleName(supabase: ServerSupabase, roleId: string): Promise<string | null> {
  const { data, error } = await supabase.from("roles").select("name").eq("id", roleId).maybeSingle();
  if (error) throw dbError(error);
  return data?.name ?? null;
}

async function jemaatName(supabase: ServerSupabase, jemaatId: string): Promise<string | null> {
  const { data, error } = await supabase.from("jemaat").select("nama").eq("id", jemaatId).maybeSingle();
  if (error) throw dbError(error);
  return data?.nama ?? null;
}

/** Friendly text for a failed set_user_access, for the 207 message. */
function accessStepMessage(error: { code: string; message: string }): string {
  if (error.code === "23505") return JEMAAT_TAKEN;
  const mapped = rpcError(error);
  if (mapped instanceof ApiError) return mapped.message;
  console.error("[users] set_user_access after invite:", error);
  return "terjadi kesalahan di server.";
}

/** POST /api/admin/users: "Undang Pengguna" (brief §9.11, §6). */
export const inviteUserRoute = mutation({
  permission: ["users", "create"],
  schema: inviteSchema,
  status: 201,
  async run({ input, supabase }) {
    const origin = siteOrigin();
    if (!origin) throw new Error("SITE_URL is missing or invalid; invites need the site's public origin.");

    // Checks that can fail predictably run before the email goes out, so they
    // are a 400 instead of a 207 after the invite. The RPC checks them again.
    if (input.roleId && !(await roleName(supabase, input.roleId))) {
      throw new ApiError(400, "Role tidak ditemukan.");
    }
    if (input.jemaatId) {
      if (!(await jemaatName(supabase, input.jemaatId))) throw new ApiError(400, "Jemaat tidak ditemukan.");
      const linked = await supabase.from("profiles").select("id").eq("jemaat_id", input.jemaatId).maybeSingle();
      if (linked.error) throw dbError(linked.error);
      if (linked.data) throw new ApiError(400, JEMAAT_TAKEN);
    }

    const invited = await inviteUser({ email: input.email, fullName: input.fullName, redirectTo: inviteRedirectUrl(origin) });
    if (!invited.ok) {
      if (invited.reason === "exists") throw new ApiError(400, "Email ini sudah terdaftar sebagai pengguna.");
      if (invited.reason === "rate_limited") {
        throw new ApiError(400, "Terlalu banyak email undangan dikirim. Coba lagi beberapa saat lagi.");
      }
      throw new Error(`[invite] ${invited.message}`);
    }

    let partial: string | undefined;
    if (input.roleId || input.jemaatId) {
      const { error } = await supabase.rpc("set_user_access", {
        p_user_id: invited.userId,
        ...(input.roleId ? { p_role_id: input.roleId } : {}),
        ...(input.jemaatId ? { p_jemaat_id: input.jemaatId } : {}),
      });
      if (error) partial = `Pengguna diundang, tapi gagal set role/jemaat: ${accessStepMessage(error)}`;
    }

    return {
      data: { id: invited.userId },
      log: { module: "users", activity: `Mengundang pengguna ${quote(input.email)}` },
      revalidate: ["/admin/users"],
      partial,
    };
  },
});

const accessSchema = z.object({
  // Left out: roles stay as they are (your own row, where the role can't change).
  roleId: z.uuid({ error: "Data yang dikirim tidak valid." }).nullable().optional(),
  jemaatId: optionalId,
});

/**
 * PATCH /api/admin/users/[id]: the Edit dialog's Role + Jemaat, saved
 * together through set_user_access (one transaction). Without `roleId`, only
 * the jemaat link changes (link_user_jemaat).
 */
export const updateUserAccess = mutation({
  permission: ["users", "update"],
  params: idParams,
  schema: accessSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }) {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("email, jemaat_id").eq("id", params.id).maybeSingle(),
      supabase.from("user_roles").select("role_id").eq("user_id", params.id),
    ]);
    if (profileRes.error) throw dbError(profileRes.error, { notFound: NOT_FOUND });
    if (rolesRes.error) throw dbError(rolesRes.error);
    if (!profileRes.data) throw new ApiError(404, NOT_FOUND);

    const jemaatArg = input.jemaatId ? { p_jemaat_id: input.jemaatId } : {};
    const { error } =
      input.roleId === undefined
        ? await supabase.rpc("link_user_jemaat", { p_user_id: params.id, ...jemaatArg })
        : await supabase.rpc("set_user_access", {
            p_user_id: params.id,
            ...(input.roleId ? { p_role_id: input.roleId } : {}),
            ...jemaatArg,
          });
    if (error) throw error.code === "23505" ? new ApiError(400, JEMAAT_TAKEN) : rpcError(error);

    const before = rolesRes.data.map((r) => r.role_id);
    const roleChanged =
      input.roleId !== undefined &&
      !(before.length === (input.roleId ? 1 : 0) && (!input.roleId || before[0] === input.roleId));
    const jemaatChanged = profileRes.data.jemaat_id !== input.jemaatId;

    const email = quote(profileRes.data.email ?? "");
    const roleText = input.roleId ? quote((await roleName(supabase, input.roleId)) ?? "") : '"Tidak ada"';
    const jemaatText = input.jemaatId ? quote((await jemaatName(supabase, input.jemaatId)) ?? "") : '"Tidak ada"';

    let activity = `Mengubah akses pengguna ${email}`;
    if (roleChanged && jemaatChanged) activity = `Mengubah akses pengguna ${email}: role ${roleText}, jemaat ${jemaatText}`;
    else if (roleChanged) activity = `Mengubah role pengguna ${email} menjadi ${roleText}`;
    else if (jemaatChanged) {
      activity = input.jemaatId
        ? `Menautkan pengguna ${email} ke jemaat ${jemaatText}`
        : `Melepas tautan jemaat dari pengguna ${email}`;
    }

    return {
      data: { id: params.id, jemaatId: input.jemaatId },
      log: { module: "users", activity },
      revalidate: ["/admin/users"],
    };
  },
});

/** DELETE /api/admin/users/[id]: deletes the auth user (brief §9.11). */
export const deleteUserRoute = mutation({
  permission: ["users", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, user, supabase }) {
    // brief §9.11, §13 #12: refused on the server, not only hidden in the UI.
    if (params.id === user.id) throw new ApiError(403, "Tidak bisa menghapus akun sendiri.");

    const profile = await supabase.from("profiles").select("email").eq("id", params.id).maybeSingle();
    if (profile.error) throw dbError(profile.error, { notFound: NOT_FOUND });
    if (!profile.data) throw new ApiError(404, NOT_FOUND);

    // A friendly message for the common case; the 0028 trigger is the real guard.
    const superAdminRole = await supabase.from("roles").select("id").eq("name", SUPER_ADMIN_ROLE).maybeSingle();
    if (superAdminRole.error) throw dbError(superAdminRole.error);
    if (superAdminRole.data) {
      const holders = await supabase.from("user_roles").select("user_id").eq("role_id", superAdminRole.data.id);
      if (holders.error) throw dbError(holders.error);
      const ids = new Set(holders.data.map((row) => row.user_id));
      if (ids.has(params.id) && ids.size <= 1) throw new ApiError(403, LAST_SUPER_ADMIN);
    }

    const deleted = await deleteAuthUser(params.id);
    if (!deleted.ok) {
      if (/not found/i.test(deleted.message)) throw new ApiError(404, NOT_FOUND);
      throw new Error(`[delete user] ${deleted.message}`);
    }

    return {
      data: { id: params.id },
      log: { module: "users", activity: `Menghapus pengguna ${quote(profile.data.email ?? "")}` },
      revalidate: ["/admin/users"],
    };
  },
});
