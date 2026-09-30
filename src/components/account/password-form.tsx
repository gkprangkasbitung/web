"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";

const MIN = 8;

/**
 * "Ganti Password" (brief §9.14): new password and confirmation, at least 8
 * characters and matching, plus the current password (approved in stage 10).
 * After a change the server signs out every other session.
 */
export function PasswordForm() {
  const id = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword) return setError("Password saat ini wajib diisi.");
    if (password.length < MIN) return setError("Password minimal 8 karakter.");
    if (password !== confirm) return setError("Konfirmasi password tidak sama.");

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/account/password", { method: "POST", body: { currentPassword, password, confirm } });
      toast.success("Password diganti. Sesi di perangkat lain sudah dikeluarkan.");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  const invalid = error !== null || undefined;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-current`}>Password saat ini</Label>
        <Input
          id={`${id}-current`}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={pending}
          aria-invalid={invalid}
          aria-describedby={`${id}-error`}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-password`}>Password baru</Label>
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          minLength={MIN}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint ${id}-error`}
          required
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Minimal 8 karakter.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-confirm`}>Konfirmasi password baru</Label>
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={pending}
          aria-invalid={invalid}
          aria-describedby={`${id}-error`}
          required
        />
      </div>
      <FormError id={`${id}-error`} message={error} />
      <div>
        <Button type="submit" disabled={pending} focusableWhenDisabled>
          {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
          Ganti Password
        </Button>
      </div>
    </form>
  );
}
