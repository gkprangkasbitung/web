"use client";

import { UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchWithWarning, errorMessage } from "@/lib/api-client";
import type { UsersOverview, UserRow } from "@/lib/users-routes";

import { EditUserDialog, InviteUserDialog, type InviteInput } from "./user-dialogs";

const helper = createDataTableColumnHelper<UserRow>();

function buildColumns(currentUserId: string) {
  return [
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <InitialsAvatar name={row.original.nama} />
          <span>{row.original.nama}</span>
          {row.original.id === currentUserId && <Badge variant="outline-accent">Kamu</Badge>}
        </span>
      ),
    }),
    helper.accessor("email", { header: "Email", enableSorting: true, meta: { search: true } }),
    helper.accessor("roleNames", {
      id: "role",
      header: "Role",
      meta: { facet: { title: "Role", emptyLabel: "Tanpa role" } },
      cell: ({ getValue }) => {
        const names = getValue();
        if (!names) return <Badge variant="neutral">Tanpa role</Badge>;
        return (
          <span className="flex flex-wrap gap-1">
            {names.split(", ").map((name) => (
              <Badge key={name} variant="accent">
                {name}
              </Badge>
            ))}
          </span>
        );
      },
    }),
    helper.accessor("jemaatNama", {
      header: "Jemaat",
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
  ];
}

export function UsersManager({
  overview,
  currentUserId,
  canCreate,
  canUpdate,
  canDelete,
}: {
  overview: UsersOverview;
  currentUserId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [columns] = useState(() => buildColumns(currentUserId));
  const table = useDataTable({ data: overview.users, columns, getRowId: (row) => row.id });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  // Always the freshest row after router.refresh().
  const editRow = overview.users.find((row) => row.id === editId) ?? null;

  async function invite(input: InviteInput) {
    const { warning } = await apiFetchWithWarning("/api/admin/users", {
      method: "POST",
      body: {
        email: input.email,
        fullName: input.fullName,
        roleId: input.roleId,
        jemaatId: input.jemaatId,
      },
    }).catch((error: unknown) => {
      throw new Error(errorMessage(error));
    });
    // The invite went out either way; a 207 only means role/jemaat failed.
    if (warning) toast.warning(warning, { duration: 10_000 });
    else toast.success("Undangan terkirim");
    setInviteOpen(false);
    router.refresh();
  }

  async function saveAccess(row: UserRow, input: { roleId?: string | null; jemaatId: string | null }) {
    await apiFetch(`/api/admin/users/${row.id}`, { method: "PATCH", body: input }).catch((error: unknown) => {
      throw new Error(errorMessage(error));
    });
    toast.success("Pengguna disimpan");
    setEditOpen(false);
    router.refresh();
  }

  async function remove(row: UserRow) {
    try {
      await apiFetch(`/api/admin/users/${row.id}`, { method: "DELETE" });
      toast.success(`Akun ${row.email} dihapus`);
      router.refresh();
    } catch (removeError) {
      toast.error(errorMessage(removeError));
      throw removeError;
    }
  }

  const addAction = canCreate ? (
    <Button
      onClick={() => {
        setInviteKey((key) => key + 1);
        setInviteOpen(true);
      }}
    >
      <UserPlusIcon aria-hidden />
      Undang Pengguna
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description={`${overview.users.length} akun yang bisa masuk ke admin. Setiap akun memakai satu role.`}
        actions={addAction}
      />

      <DataTable
        table={table}
        label="Pengguna"
        noun="pengguna"
        canWrite={canUpdate}
        addAction={addAction}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: {
            onSelect: (row) => {
              setEditId(row.id);
              setEditKey((key) => key + 1);
              setEditOpen(true);
            },
          },
          delete: {
            // Not offered on your own row; the server refuses it too (brief §9.11).
            hidden: (row) => !canDelete || row.id === currentUserId,
            title: (row) => `Hapus akun ${row.email}?`,
            description: () =>
              "Akun ini tidak akan bisa login lagi. Riwayat warta yang pernah dibuat akun ini tetap tersimpan. Tindakan ini tidak bisa dibatalkan.",
            onConfirm: remove,
          },
        }}
      />

      <InviteUserDialog
        key={inviteKey}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={overview.roles}
        people={overview.people}
        onSubmit={invite}
      />

      {editRow && (
        <EditUserDialog
          key={`${editRow.id}-${editKey}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          user={editRow}
          isSelf={editRow.id === currentUserId}
          canWrite={canUpdate}
          roles={overview.roles}
          people={overview.people}
          onSubmit={(input) => saveAccess(editRow, input)}
        />
      )}
    </div>
  );
}
