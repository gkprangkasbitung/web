"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { permissionLabel } from "@/lib/access";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { RoleCard, RolesOverview } from "@/lib/roles-routes";

import { PermissionMatrix } from "./permission-matrix";
import { RoleFormDialog, type RoleFormValues } from "./role-form-dialog";

export function RolesManager({
  overview,
  canCreate,
  canUpdate,
  canDelete,
}: {
  overview: RolesOverview;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const labels = new Map(overview.permissions.map((p) => [p.id, permissionLabel(p)]));

  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  // The row stays set while the dialog closes, so its title doesn't flash empty.
  const [deleteRole, setDeleteRole] = useState<RoleCard | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editRole = overview.roles.find((role) => role.id === editId) ?? null;

  function openForm(role: RoleCard | null) {
    setEditId(role?.id ?? null);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }

  async function submitForm(values: RoleFormValues) {
    const url = editRole ? `/api/admin/roles/${editRole.id}` : "/api/admin/roles";
    await apiFetch(url, {
      method: editRole ? "PATCH" : "POST",
      body: { name: values.name, description: values.description },
    }).catch((error: unknown) => {
      throw new Error(errorMessage(error));
    });
    toast.success(editRole ? "Role disimpan" : "Role ditambahkan");
    setFormOpen(false);
    router.refresh();
  }

  async function remove(role: RoleCard) {
    try {
      await apiFetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      toast.success(`Role ${role.name} dihapus`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Roles & Permissions"
        description="Role menentukan menu dan tindakan yang boleh dipakai setiap pengguna."
        actions={
          canCreate ? (
            <Button onClick={() => openForm(null)}>
              <PlusIcon aria-hidden />
              Tambah Role
            </Button>
          ) : undefined
        }
      />

      {overview.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada role.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Daftar role">
          {overview.roles.map((role) => (
            <li key={role.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="font-mono text-base">{role.name}</CardTitle>
                  <CardDescription>{role.description || "Tanpa deskripsi."}</CardDescription>
                  {(canUpdate || (canDelete && !role.isSuperAdmin)) && (
                    <CardAction className="flex gap-1">
                      {canUpdate && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit role ${role.name}`} onClick={() => openForm(role)}>
                          <PencilIcon aria-hidden />
                        </Button>
                      )}
                      {canDelete && !role.isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          aria-label={`Hapus role ${role.name}`}
                          onClick={() => {
                            setDeleteRole(role);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      )}
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  {role.permissionIds.length === 0 ? (
                    <Badge variant="outline">Tanpa permission</Badge>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Permission ${role.name}`}>
                      {role.permissionIds.map((id) => (
                        <li key={id}>
                          <Badge variant="accent" className="font-mono">
                            {labels.get(id)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canUpdate && overview.roles.length > 0 && (
        <PermissionMatrix roles={overview.roles} permissions={overview.permissions} />
      )}

      <RoleFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={editRole ? "edit" : "create"}
        initial={editRole ? { name: editRole.name, description: editRole.description ?? "" } : undefined}
        nameLocked={editRole?.isSuperAdmin ?? false}
        onSubmit={submitForm}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus role ${deleteRole?.name ?? ""}?`}
        description="Pengguna dengan role ini akan kehilangan seluruh permission-nya. Tindakan ini tidak bisa dibatalkan."
        onConfirm={() => (deleteRole ? remove(deleteRole) : undefined)}
      />
    </div>
  );
}
