"use client";

import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ACTION_ORDER, VISIBLE_RESOURCES, isPrivilegedResource, permissionLabel, type PermissionOption } from "@/lib/access";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { RoleCard } from "@/lib/roles-routes";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * The permission editor (brief §12.3): roles × resource:action checkboxes,
 * saved atomically per role. Only resources the UI shows appear; the
 * super_admin role's roles:* / users:* boxes are locked (the database
 * refuses removing them too).
 */
export function PermissionMatrix({ roles, permissions }: { roles: RoleCard[]; permissions: PermissionOption[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmRole, setConfirmRole] = useState<RoleCard | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const byKey = new Map(permissions.map((p) => [`${p.resource}:${p.action}`, p]));
  const resources = VISIBLE_RESOURCES.filter((resource) => permissions.some((p) => p.resource === resource));
  const privilegedIds = new Set(permissions.filter((p) => isPrivilegedResource(p.resource)).map((p) => p.id));

  const valueOf = (role: RoleCard) => drafts[role.id] ?? role.permissionIds;
  const isDirty = (role: RoleCard) => drafts[role.id] !== undefined && !sameSet(drafts[role.id]!, role.permissionIds);
  const isLocked = (role: RoleCard, permission: PermissionOption) =>
    role.isSuperAdmin && isPrivilegedResource(permission.resource);

  function toggle(role: RoleCard, permissionId: string, checked: boolean) {
    const current = valueOf(role);
    const next = checked ? [...new Set([...current, permissionId])] : current.filter((id) => id !== permissionId);
    setDrafts((all) => ({ ...all, [role.id]: next }));
  }

  function reset(role: RoleCard) {
    setDrafts((all) => {
      const next = { ...all };
      delete next[role.id];
      return next;
    });
  }

  async function save(role: RoleCard) {
    setSaving(role.id);
    try {
      await apiFetch(`/api/admin/roles/${role.id}`, { method: "PATCH", body: { permissionIds: valueOf(role) } });
      toast.success(`Permission role ${role.name} disimpan`);
      reset(role);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    } finally {
      setSaving(null);
    }
  }

  function requestSave(role: RoleCard) {
    const before = new Set(role.permissionIds);
    const grantsPrivileged = valueOf(role).some((id) => privilegedIds.has(id) && !before.has(id));
    if (grantsPrivileged) {
      setConfirmRole(role);
      setConfirmOpen(true);
    } else save(role).catch(() => {});
  }

  return (
    <section aria-labelledby="permission-matrix-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="permission-matrix-title" className="text-lg font-semibold">
          Atur Permission
        </h2>
        <p className="text-sm text-muted-foreground">
          Centang permission untuk setiap role, lalu klik &quot;Simpan&quot; di baris role tersebut.
        </p>
      </div>

      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>Permission roles dan users setara akses super admin</AlertTitle>
        <AlertDescription>
          Pemegang permission roles:* atau users:* bisa mengubah role dan permission siapa pun, termasuk memberi dirinya
          akses penuh. Berikan hanya kepada orang yang benar-benar dipercaya.
        </AlertDescription>
      </Alert>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-4xl border-collapse text-sm">
          <caption className="sr-only">Permission per role</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                Role
              </th>
              {resources.map((resource) => (
                <th
                  key={resource}
                  scope="colgroup"
                  colSpan={ACTION_ORDER.length}
                  className="border-l px-3 py-2 text-center font-mono text-xs font-medium"
                >
                  {resource}
                </th>
              ))}
              <th scope="col" rowSpan={2} className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
            <tr className="border-b">
              {resources.map((resource) => (
                <Fragment key={resource}>
                  {ACTION_ORDER.map((action, index) => (
                    <th
                      key={action}
                      scope="col"
                      className={`px-2 py-2 text-center text-xs font-normal text-muted-foreground ${index === 0 ? "border-l" : ""}`}
                    >
                      {action}
                    </th>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const value = new Set(valueOf(role));
              const dirty = isDirty(role);
              const busy = saving === role.id;
              return (
                <tr key={role.id} className="border-b last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                    {role.name}
                  </th>
                  {resources.map((resource) => (
                    <Fragment key={resource}>
                      {ACTION_ORDER.map((action, index) => {
                        const permission = byKey.get(`${resource}:${action}`);
                        const cellClass = `px-2 py-2 text-center ${index === 0 ? "border-l" : ""}`;
                        if (!permission) {
                          return (
                            <td key={action} className={`${cellClass} text-muted-foreground`}>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">Tidak tersedia</span>
                            </td>
                          );
                        }
                        const locked = isLocked(role, permission);
                        return (
                          <td key={action} className={cellClass}>
                            <span className="inline-flex" title={locked ? "Terkunci untuk super_admin" : undefined}>
                              <Checkbox
                                aria-label={`${role.name}: ${permissionLabel(permission)}${locked ? " (terkunci)" : ""}`}
                                checked={value.has(permission.id)}
                                onCheckedChange={(checked) => toggle(role, permission.id, checked)}
                                disabled={locked || busy}
                              />
                            </span>
                          </td>
                        );
                      })}
                    </Fragment>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {dirty && (
                        <Button variant="outline" onClick={() => reset(role)} disabled={busy}>
                          Batal
                        </Button>
                      )}
                      <Button
                       
                        onClick={() => requestSave(role)}
                        disabled={!dirty || busy}
                        focusableWhenDisabled
                        aria-label={`Simpan permission ${role.name}`}
                      >
                        {busy && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                        Simpan
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Permission roles:* dan users:* milik super_admin terkunci, supaya selalu ada akun yang bisa mengelola pengguna
        dan role.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Beri akses setara super admin ke role ${confirmRole?.name ?? ""}?`}
        description="Role ini akan mendapat permission roles atau users. Pemegangnya bisa mengubah role dan permission siapa pun, termasuk dirinya sendiri."
        confirmLabel="Simpan"
        onConfirm={() => (confirmRole ? save(confirmRole) : undefined)}
      />
    </section>
  );
}
