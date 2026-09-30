/**
 * Roles & Permissions vocabulary shared by the server and the browser (no
 * "server-only"). The database checks everything again; these only shape
 * the UI.
 */

export const SUPER_ADMIN_ROLE = "super_admin";

/**
 * Resources shown in the UI, in display order. `announcements` and `content`
 * stay in the database but never appear on screen (brief §4, §12.9).
 * `situs_rekening` has only `update` (brief §14).
 */
export const VISIBLE_RESOURCES = ["warta", "users", "roles", "activity_log", "situs", "situs_rekening"] as const;
export const ACTION_ORDER = ["create", "read", "update", "delete"] as const;

export type PermissionOption = { id: string; resource: string; action: string };

export function isVisibleResource(resource: string): boolean {
  return (VISIBLE_RESOURCES as readonly string[]).includes(resource);
}

/** roles:* and users:* amount to super admin access (brief §12.3). */
export function isPrivilegedResource(resource: string): boolean {
  return resource === "roles" || resource === "users";
}

/** Display order: resource as in VISIBLE_RESOURCES, then create/read/update/delete. */
export function comparePermissions(a: PermissionOption, b: PermissionOption): number {
  const byResource =
    (VISIBLE_RESOURCES as readonly string[]).indexOf(a.resource) - (VISIBLE_RESOURCES as readonly string[]).indexOf(b.resource);
  if (byResource !== 0) return byResource;
  return (ACTION_ORDER as readonly string[]).indexOf(a.action) - (ACTION_ORDER as readonly string[]).indexOf(b.action);
}

export function permissionLabel(permission: Pick<PermissionOption, "resource" | "action">): string {
  return `${permission.resource}:${permission.action}`;
}
