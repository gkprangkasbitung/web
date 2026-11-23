"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { PortalAlert } from "@/components/portal/portal-alert";
import { portalButtonClass, portalInputClass } from "@/components/portal/portal-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { gantiPasswordSementara, type GantiPasswordState } from "./actions";

export function GantiPasswordForm() {
  const [state, formAction, pending] = useActionState<GantiPasswordState, FormData>(gantiPasswordSementara, {
    error: null,
  });
  const invalid = Boolean(state.error);
  const errorId = "ganti-password-error";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-7">
      <PortalAlert id={errorId} tone="error">
        {state.error}
      </PortalAlert>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoCapitalize="none"
          minLength={8}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={`password-hint ${errorId}`}
          className={portalInputClass}
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          Minimal 8 karakter, berbeda dari password sementara.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Ulangi password baru</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          autoCapitalize="none"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          className={portalInputClass}
        />
      </div>
      <Button type="submit" disabled={pending} className={portalButtonClass}>
        {pending && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
        Simpan Password
      </Button>
    </form>
  );
}
