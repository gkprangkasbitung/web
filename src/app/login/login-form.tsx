"use client";

import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useActionState, useState } from "react";

import { PortalAlert } from "@/components/portal/portal-alert";
import { portalButtonClass, portalInputClass } from "@/components/portal/portal-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { error: null, email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <PortalAlert id="login-error" tone="error">
        {state.error}
      </PortalAlert>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nama@email.com"
          defaultValue={state.email}
          aria-invalid={invalid || undefined}
          aria-describedby="login-error"
          required
          className={portalInputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={invalid || undefined}
            aria-describedby="login-error"
            required
            className={`${portalInputClass} pr-13`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={showPassword}
            aria-controls="password"
            className="absolute top-1/2 right-1.5 size-10 -translate-y-1/2 rounded-lg text-muted-foreground"
          >
            {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
          </Button>
        </div>
      </div>
      <Button
        type="submit"
        disabled={pending}
        className={`${portalButtonClass} bg-foreground text-background hover:bg-foreground/90`}
      >
        {pending && <Loader2Icon className="motion-safe:animate-spin" aria-hidden="true" />}
        Masuk
      </Button>
    </form>
  );
}
