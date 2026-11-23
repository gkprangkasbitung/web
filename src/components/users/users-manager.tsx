"use client";

import { KeyRoundIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchWithWarning, errorMessage } from "@/lib/api-client";
import type { CreateAccountsResult, ResetPasswordResult } from "@/lib/username-accounts-routes";
import type { UsersOverview, UserRow } from "@/lib/users-routes";

import type { SlipAccount } from "./password-slips";
import { ResetPasswordResultDialog } from "./reset-password-dialog";
import { EditUserDialog, InviteUserDialog, type InviteInput } from "./user-dialogs";
import { CreateUsernameAccountsDialog, type CreateAccountsOutcome } from "./username-account-dialog";

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
    helper.accessor("username", {
      header: "Username",
      enableSorting: true,
      meta: { search: true },
      cell: ({ row }) =>
        row.original.username ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{row.original.username}</span>
            {row.original.wajibGantiPassword && <Badge variant="neutral">Password sementara</Badge>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    // A username account's auth email is internal, with no mailbox (§18.7): not shown.
    helper.accessor((row) => (row.username ? "" : row.email), {
      id: "email",
      header: "Email",
      enableSorting: true,
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
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
    helper.accessor("accountKind", {
      header: "Jenis Akun",
      meta: { facet: { title: "Jenis Akun" } },
      cell: ({ getValue }) => {
        const kind = getValue();
        if (kind === "Tanpa akses") return <Badge variant="neutral">Tanpa akses</Badge>;
        return (
          <span className="flex flex-wrap gap-1">
            {kind !== "Jemaat" && <Badge variant="accent">Pengurus</Badge>}
            {kind !== "Pengurus" && <Badge variant="outline-accent">Jemaat</Badge>}
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

  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetResult, setResetResult] = useState<SlipAccount | null>(null);
  const eligible = useMemo(() => overview.people.filter((person) => !person.linkedUserId), [overview.people]);
  const takenUsernames = useMemo(
    () => new Set(overview.users.flatMap((row) => (row.username ? [row.username.toLowerCase()] : []))),
    [overview.users],
  );

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
      body:
        input.kind === "jemaat"
          ? { kind: "jemaat", email: input.email, jemaatId: input.jemaatId }
          : {
              kind: "pengurus",
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

  async function createAccounts(items: { jemaatId: string; username: string }[]): Promise<CreateAccountsOutcome> {
    const { data, warning } = await apiFetchWithWarning<CreateAccountsResult>("/api/admin/users/username", {
      method: "POST",
      body: { items },
    }).catch((error: unknown) => {
      throw new Error(errorMessage(error));
    });
    if (warning) toast.warning(warning, { duration: 10_000 });
    else toast.success(data.created.length === 1 ? "Akun username dibuat" : `${data.created.length} akun username dibuat`);
    router.refresh();
    return { ...data, warning };
  }

  async function resetPassword(row: UserRow) {
    try {
      const data = await apiFetch<ResetPasswordResult>(`/api/admin/users/${row.id}/reset-password`, { method: "POST" });
      toast.success("Password direset");
      setResetResult({ nama: data.nama, username: data.username ?? row.email, password: data.password });
      router.refresh();
    } catch (resetError) {
      toast.error(errorMessage(resetError));
      throw resetError;
    }
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
      toast.success(`Akun ${row.username ?? row.email} dihapus`);
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

  const headerActions = canCreate ? (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => {
          setCreateKey((key) => key + 1);
          setCreateOpen(true);
        }}
      >
        <UsersIcon aria-hidden />
        Buat Akun Username
      </Button>
      {addAction}
    </div>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description={`${overview.users.length} akun pengurus dan jemaat. Akun pengurus memakai satu role; akun jemaat masuk ke Portal Jemaat dengan username atau email.`}
        actions={headerActions}
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
          // Jemaat-only accounts (§18.7); staff accounts keep the invite flow.
          extra: canUpdate
            ? [
                {
                  label: "Reset Password",
                  icon: KeyRoundIcon,
                  write: true,
                  hidden: (row) => row.accountKind !== "Jemaat" || row.id === currentUserId,
                  onSelect: (row) => setResetTarget(row),
                },
              ]
            : undefined,
          delete: {
            // Not offered on your own row; the server refuses it too (brief §9.11).
            hidden: (row) => !canDelete || row.id === currentUserId,
            title: (row) => `Hapus akun ${row.username ?? row.email}?`,
            description: () =>
              "Akun ini tidak akan bisa login lagi. Riwayat warta yang pernah dibuat akun ini tetap tersimpan. Tindakan ini tidak bisa dibatalkan.",
            onConfirm: remove,
          },
        }}
      />

      <CreateUsernameAccountsDialog
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={eligible}
        takenUsernames={takenUsernames}
        onSubmit={createAccounts}
      />

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(next) => !next && setResetTarget(null)}
        title={`Reset password akun ${resetTarget?.username ?? resetTarget?.email ?? ""}?`}
        description="Password lama tidak bisa dipakai lagi dan akun ini dikeluarkan dari semua perangkat. Password sementara yang baru hanya ditampilkan sekali, dan wajib diganti saat masuk."
        confirmLabel="Reset Password"
        onConfirm={() => (resetTarget ? resetPassword(resetTarget) : undefined)}
      />

      <ResetPasswordResultDialog account={resetResult} onClose={() => setResetResult(null)} />

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
