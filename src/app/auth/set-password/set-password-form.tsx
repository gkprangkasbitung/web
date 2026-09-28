"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setPassword, type SetPasswordState } from "./actions";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(setPassword, { error: null });
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          aria-invalid={invalid || undefined}
          aria-describedby="password-hint set-password-error"
          required
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          Minimal 8 karakter.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Konfirmasi password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={invalid || undefined}
          aria-describedby="set-password-error"
          required
        />
      </div>
      <FormError id="set-password-error" message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        Simpan Password
      </Button>
    </form>
  );
}
