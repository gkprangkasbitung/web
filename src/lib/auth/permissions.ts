/**
 * Permission vocabulary (brief §4). Every church-content module is guarded
 * by the `warta` resource, which the existing RLS policies rely on.
 * `announcements` and `content` exist in the database but no screen uses them.
 * The site content modules (brief §14) have their own `situs` resource, plus
 * `situs_rekening:update` for the bank-account details.
 */
export type Resource = "warta" | "users" | "roles" | "activity_log" | "situs" | "situs_rekening";
export type Action = "create" | "read" | "update" | "delete";
export type PermissionKey = `${string}:${string}`;

export type Permitted = { permissions: readonly PermissionKey[] };

export function permissionKey(resource: string, action: string): PermissionKey {
  return `${resource}:${action}`;
}

export function can(user: Permitted | null | undefined, resource: Resource, action: Action): boolean {
  return Boolean(user?.permissions.includes(permissionKey(resource, action)));
}
