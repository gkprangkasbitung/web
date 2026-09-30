import "server-only";

import { z } from "zod";

import {
  SUPER_ADMIN_ROLE,
  comparePermissions,
  isVisibleResource,
  permissionLabel,
  type PermissionOption,
} from "@/lib/access";
import { quote } from "@/lib/activity-log";
import { ApiError, dbError, escapeLike, guardError, mutation, rpcError, type MutationSuccess } from "@/lib/api-mutation";
import type { ServerSupabase } from "@/lib/supabase/server";
import { idParams, optionalText, requiredText } from "@/lib/validation";

const NOT_FOUND = "Role tidak ditemukan.";
const NAME_TAKEN = "Nama role sudah digunakan.";

export type RoleCard = {
  id: string;
  name: string;
  description: string | null;
  isSuperAdmin: boolean;
  /** Visible-resource permissions only (brief §12.9), in display order. */
  permissionIds: string[];
};

export type RolesOverview = {
  roles: RoleCard[];
  /** Every permission of a visible resource, in display order. */
  permissions: PermissionOption[];
};

export async function loadRolesOverview(
  supabase: ServerSupabase,
): Promise<{ data: RolesOverview | null; error: string | null }> {
  const [rolesRes, permissionsRes, grantsRes] = await Promise.all([
    supabase.from("roles").select("id, name, description").order("name"),
    supabase.from("permissions").select("id, resource, action"),
    supabase.from("role_permissions").select("role_id, permission_id"),
  ]);
  const failed = rolesRes.error ?? permissionsRes.error ?? grantsRes.error;
  if (failed || !rolesRes.data || !permissionsRes.data || !grantsRes.data) {
    return { data: null, error: failed?.message ?? "unknown" };
  }

  const permissions = permissionsRes.data.filter((p) => isVisibleResource(p.resource)).sort(comparePermissions);
  const order = new Map(permissions.map((p, index) => [p.id, index]));
  const grants = new Map<string, string[]>();
  for (const g of grantsRes.data) {
    if (!order.has(g.permission_id)) continue;
    const list = grants.get(g.role_id) ?? [];
    list.push(g.permission_id);
    grants.set(g.role_id, list);
  }

  return {
    data: {
      permissions,
      roles: rolesRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSuperAdmin: r.name === SUPER_ADMIN_ROLE,
        permissionIds: (grants.get(r.id) ?? []).sort((a, b) => order.get(a)! - order.get(b)!),
      })),
    },
    error: null,
  };
}

const infoSchema = z.object({
  name: requiredText("Nama Role wajib diisi.", 50),
  description: optionalText(200),
});

/** Case-insensitive name check with LIKE wildcards escaped (the DB index is the real guard). */
async function assertNameFree(supabase: ServerSupabase, name: string, exceptId?: string) {
  let query = supabase.from("roles").select("id").ilike("name", escapeLike(name));
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.limit(1);
  if (error) throw dbError(error);
  if (data.length > 0) throw new ApiError(400, NAME_TAKEN);
}

/** POST /api/admin/roles: "Tambah Role" (brief §9.12). */
export const createRole = mutation({
  permission: ["roles", "create"],
  schema: infoSchema,
  status: 201,
  async run({ input, supabase }) {
    await assertNameFree(supabase, input.name);
    const { data, error } = await supabase
      .from("roles")
      .insert({ name: input.name, description: input.description })
      .select("id, name, description")
      .single();
    if (error) throw dbError(error, { unique: NAME_TAKEN });
    return {
      data,
      log: { module: "roles", activity: `Menambah role ${quote(data.name)}` },
      revalidate: ["/admin/roles"],
    };
  },
});

const permissionsSchema = z.object({
  permissionIds: z.array(z.uuid({ error: "Data yang dikirim tidak valid." })).max(100),
});

/** Picks the branch by the presence of `permissionIds`, so errors keep the field's own message. */
const updateSchema = z.unknown().transform((body, ctx) => {
  const isPermissions = typeof body === "object" && body !== null && "permissionIds" in body;
  const result = isPermissions ? permissionsSchema.safeParse(body) : infoSchema.safeParse(body);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    return z.NEVER;
  }
  return result.data;
});

type RoleUpdateResult =
  | { id: string; permissionIds: string[] }
  | { id: string; name: string; description: string | null };

/**
 * PATCH /api/admin/roles/[id]: either the permission editor's save for one
 * role (`{ permissionIds }`, brief §12.3, atomic via set_role_ui_permissions)
 * or the Edit dialog (`{ name, description }`).
 */
export const updateRole = mutation({
  permission: ["roles", "update"],
  params: idParams,
  schema: updateSchema,
  notFound: NOT_FOUND,
  async run({ input, params, supabase }): Promise<MutationSuccess<RoleUpdateResult>> {
    const current = await supabase.from("roles").select("id, name").eq("id", params.id).maybeSingle();
    if (current.error) throw dbError(current.error, { notFound: NOT_FOUND });
    if (!current.data) throw new ApiError(404, NOT_FOUND);

    if ("permissionIds" in input) {
      const [permissionsRes, beforeRes] = await Promise.all([
        supabase.from("permissions").select("id, resource, action"),
        supabase.from("role_permissions").select("permission_id").eq("role_id", params.id),
      ]);
      if (permissionsRes.error) throw dbError(permissionsRes.error);
      if (beforeRes.error) throw dbError(beforeRes.error);

      const ids = [...new Set(input.permissionIds)];
      const { error } = await supabase.rpc("set_role_ui_permissions", { p_role_id: params.id, p_permission_ids: ids });
      if (error) throw rpcError(error);

      const labels = new Map(
        permissionsRes.data.filter((p) => isVisibleResource(p.resource)).map((p) => [p.id, permissionLabel(p)]),
      );
      const before = new Set(beforeRes.data.map((g) => g.permission_id).filter((id) => labels.has(id)));
      const after = new Set(ids);
      const added = [...after].filter((id) => !before.has(id)).map((id) => `+${labels.get(id)}`);
      const removed = [...before].filter((id) => !after.has(id)).map((id) => `−${labels.get(id)}`);
      const changes = [...added, ...removed];

      return {
        data: { id: params.id, permissionIds: ids },
        log: {
          module: "roles",
          activity: `Mengubah permission role ${quote(current.data.name)}${changes.length ? ` (${changes.join(", ")})` : ""}`,
        },
        revalidate: [{ path: "/admin", type: "layout" }],
      };
    }

    if (input.name.toLocaleLowerCase("id") !== current.data.name.toLocaleLowerCase("id")) {
      await assertNameFree(supabase, input.name, params.id);
    }
    const { data, error } = await supabase
      .from("roles")
      .update({ name: input.name, description: input.description })
      .eq("id", params.id)
      .select("id, name, description")
      .maybeSingle();
    if (error) throw guardError(error, { unique: NAME_TAKEN, notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);

    const activity =
      data.name === current.data.name
        ? `Mengubah role ${quote(data.name)}`
        : `Mengubah nama role ${quote(current.data.name)} menjadi ${quote(data.name)}`;
    return { data, log: { module: "roles", activity }, revalidate: [{ path: "/admin", type: "layout" }] };
  },
});

/** DELETE /api/admin/roles/[id] (brief §9.12). */
export const deleteRole = mutation({
  permission: ["roles", "delete"],
  params: idParams,
  notFound: NOT_FOUND,
  async run({ params, supabase }) {
    const { data, error } = await supabase
      .from("roles")
      .delete()
      .eq("id", params.id)
      .select("id, name")
      .maybeSingle();
    if (error) throw guardError(error, { notFound: NOT_FOUND });
    if (!data) throw new ApiError(404, NOT_FOUND);
    return {
      data,
      log: { module: "roles", activity: `Menghapus role ${quote(data.name)}` },
      revalidate: [{ path: "/admin", type: "layout" }],
    };
  },
});
