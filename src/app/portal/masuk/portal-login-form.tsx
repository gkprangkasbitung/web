"use client";

import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { PortalAlert } from "@/components/portal/portal-alert";
import { portalButtonClass, portalInputClass, portalLinkClass } from "@/components/portal/portal-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { portalLogin, type PortalLoginState } from "./actions";

const INITIAL: PortalLoginState = { error: null, email: "" };

/** Email + password (brief §15), the same shape as the admin's `/login` form. */
export function PortalLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(portalLogin, INITIAL);
  const [showPassword, setShowPassword] = useState(false);
  const invalid = Boolean(state.error);
  const errorId = "portal-login-error";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-7">
      <input type="hidden" name="next" value={next} />
      <PortalAlert id={errorId} tone="error">
        {state.error}
      </PortalAlert>
      <div className="flex flex-col gap-2">
        <Label htmlFor="portal-email">Email</Label>
        <Input
          id="portal-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="nama@email.com"
          defaultValue={state.email}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          className={portalInputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="portal-password">Password</Label>
        <div className="relative">
          <Input
            id="portal-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            className={`${portalInputClass} pr-13`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={showPassword}
            aria-controls="portal-password"
            className="absolute top-1/2 right-1.5 size-10 -translate-y-1/2 rounded-lg text-muted-foreground"
          >
            {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
          </Button>
        </div>
      </div>
      <Button type="submit" disabled={pending} className={portalButtonClass}>
        {pending && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
        Masuk
      </Button>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Belum punya akun, atau lupa password?{" "}
        <Link href="/kontak" className={portalLinkClass}>
          Hubungi sekretariat
        </Link>
        .
      </p>
    </form>
  );
}
