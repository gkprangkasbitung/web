"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { error: null, email: "" });
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          aria-invalid={invalid || undefined}
          aria-describedby="login-error"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={invalid || undefined}
          aria-describedby="login-error"
          required
        />
      </div>
      <FormError id="login-error" message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        Masuk
      </Button>
    </form>
  );
}
