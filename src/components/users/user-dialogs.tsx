"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserPersonOption, UserRow } from "@/lib/users-routes";

export type RoleOption = { id: string; name: string };

function RoleSelect({
  id,
  roles,
  value,
  onValueChange,
  disabled,
  describedBy,
}: {
  id: string;
  roles: readonly RoleOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange((next as string | null) ?? null)}
      disabled={disabled}
      items={[{ value: null, label: "Tidak ada" }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
    >
      <SelectTrigger id={id} className="w-full" aria-describedby={describedBy}>
        <SelectValue placeholder="Tidak ada" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>Tidak ada</SelectItem>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Jemaat already linked to another account can't be picked (brief §9.11: one account per jemaat). */
function JemaatPicker({
  id,
  people,
  value,
  onValueChange,
  userId,
  disabled,
}: {
  id: string;
  people: readonly UserPersonOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  userId: string | null;
  disabled?: boolean;
}) {
  const linked = new Map(people.map((p) => [p.id, p]));
  return (
    <>
      <PersonPicker
        id={id}
        people={people as readonly PersonOption[]}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder="Tidak ada - cari nama atau label..."
        disabledReason={(person) => {
          const row = linked.get(person.id);
          return row?.linkedUserId && row.linkedUserId !== userId ? `Terhubung ke ${row.linkedEmail}` : null;
        }}
      />
      {people.length === 0 && (
        <p className="text-xs text-muted-foreground">Belum ada data jemaat yang bisa ditautkan.</p>
      )}
    </>
  );
}

export type InviteInput = { email: string; fullName: string; roleId: string | null; jemaatId: string | null };

/** "Undang Pengguna" (brief §9.11). Remount with a new `key` to reset. */
export function InviteUserDialog({
  open,
  onOpenChange,
  roles,
  people,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly RoleOption[];
  people: readonly UserPersonOption[];
  /** Resolves when done; rejects with the message to show inline. */
  onSubmit: (input: InviteInput) => Promise<void>;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [jemaatId, setJemaatId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Email wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({ email, fullName, roleId, jemaatId });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Undang Pengguna</DialogTitle>
          <DialogDescription>Undangan dikirim lewat email. Penerima membuat password sendiri.</DialogDescription>
        </DialogHeader>
        <form id={id} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              aria-invalid={error === "Email wajib diisi." || undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-nama`}>Nama Lengkap</Label>
            <Input
              id={`${id}-nama`}
              autoComplete="off"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-role`}>Role</Label>
            <RoleSelect id={`${id}-role`} roles={roles} value={roleId} onValueChange={setRoleId} disabled={pending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-jemaat`}>Jemaat</Label>
            <JemaatPicker
              id={`${id}-jemaat`}
              people={people}
              value={jemaatId}
              onValueChange={setJemaatId}
              userId={null}
              disabled={pending}
            />
          </div>
          <FormError id={`${id}-error`} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={id} disabled={pending} focusableWhenDisabled>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Kirim Undangan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Edit" / "Lihat" (brief §9.11): Role and Jemaat, saved together. Remount with the row's id as `key`. */
export function EditUserDialog({
  open,
  onOpenChange,
  user,
  isSelf,
  canWrite,
  roles,
  people,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow;
  isSelf: boolean;
  canWrite: boolean;
  roles: readonly RoleOption[];
  people: readonly UserPersonOption[];
  /** `roleId` is left out on your own row: the role can't change there. */
  onSubmit: (input: { roleId?: string | null; jemaatId: string | null }) => Promise<void>;
}) {
  const id = useId();
  const [roleId, setRoleId] = useState<string | null>(user.roleIds.length === 1 ? user.roleIds[0]! : null);
  const [jemaatId, setJemaatId] = useState<string | null>(user.jemaatId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multipleRoles = user.roleIds.length > 1;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit(isSelf ? { jemaatId } : { roleId, jemaatId });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const roleLocked = !canWrite || isSelf || pending;
  const roleNote = isSelf
    ? "Role akun sendiri tidak bisa diubah."
    : multipleRoles
      ? `Pengguna ini punya beberapa role (${user.roleNames}). Menyimpan akan menggantinya dengan satu role yang dipilih.`
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{user.nama}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form id={id} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-role`}>Role</Label>
            {multipleRoles && isSelf ? (
              <p id={`${id}-role`} className="text-sm">
                {user.roleNames}
              </p>
            ) : (
              <RoleSelect
                id={`${id}-role`}
                roles={roles}
                value={roleId}
                onValueChange={setRoleId}
                disabled={roleLocked}
                describedBy={roleNote ? `${id}-role-note` : undefined}
              />
            )}
            {roleNote && (
              <p id={`${id}-role-note`} className="text-xs text-muted-foreground">
                {roleNote}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-jemaat`}>Jemaat</Label>
            <JemaatPicker
              id={`${id}-jemaat`}
              people={people}
              value={jemaatId}
              onValueChange={setJemaatId}
              userId={user.id}
              disabled={!canWrite || pending}
            />
          </div>
          <FormError id={`${id}-error`} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{canWrite ? "Batal" : "Tutup"}</DialogClose>
          {canWrite && (
            <Button type="submit" form={id} disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
