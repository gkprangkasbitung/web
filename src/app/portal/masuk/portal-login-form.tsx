"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { PortalAlert } from "@/components/portal/portal-alert";
import {
  PortalFormHeading,
  portalButtonClass,
  portalInputClass,
  portalLinkClass,
} from "@/components/portal/portal-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SENT_NOTICE } from "@/lib/auth/portal-copy";

import { portalLogin, type PortalLoginState } from "./actions";

const INITIAL: PortalLoginState = { step: "email", email: "", error: null, notice: null, cooldown: 0, nonce: 0 };

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Seconds left of the server's cooldown, counted from when that answer arrived. */
function useCountdown(seconds: number, nonce: number): number {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const deadline = Date.now() + seconds * 1000;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    if (seconds <= 0) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [seconds, nonce]);
  return remaining;
}

/**
 * Two steps (stage 11f): email → "Kirim kode masuk", then the 6-digit code →
 * "Masuk". Every step is a submit to the portalLogin Server Action, so it
 * also works without JavaScript; the countdown is the only client logic.
 */
export function PortalLoginForm({ next, linkExpired }: { next: string; linkExpired: boolean }) {
  const [state, formAction, pending] = useActionState(portalLogin, INITIAL);
  const remaining = useCountdown(state.cooldown, state.nonce);
  const errorId = "portal-login-error";

  if (state.step === "email") {
    return (
      <form action={formAction} noValidate className="flex flex-col gap-7">
        <PortalFormHeading title="Masuk Portal Jemaat">
          <p>Masukkan email yang terdaftar di gereja.</p>
        </PortalFormHeading>
        {linkExpired && !state.error && state.nonce === 0 && (
          <PortalAlert tone="info">
            Tautan aktivasi tidak valid atau sudah kedaluwarsa. Masuk dengan kode lewat email di bawah ini, atau minta
            undangan baru ke sekretariat.
          </PortalAlert>
        )}
        <PortalAlert id={errorId} tone="error">
          {state.error}
        </PortalAlert>
        <div className="flex flex-col gap-2">
          <Label htmlFor="portal-email">Email</Label>
          <Input
            id="portal-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="nama@email.com"
            defaultValue={state.email}
            required
            aria-invalid={Boolean(state.error) || undefined}
            aria-describedby={errorId}
            className={portalInputClass}
          />
        </div>
        <Button type="submit" name="intent" value="send" disabled={pending} className={portalButtonClass}>
          {pending && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
          Kirim kode masuk
        </Button>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/kontak" className={portalLinkClass}>
            Hubungi sekretariat
          </Link>{" "}
          untuk aktivasi Portal Jemaat.
        </p>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-7">
      <input type="hidden" name="email" value={state.email} />
      <input type="hidden" name="next" value={next} />
      <PortalFormHeading title="Cek email Anda">
        <p>
          {SENT_NOTICE} Periksa kotak masuk <b className="font-semibold break-all text-foreground">{state.email}</b>.
          Kode berlaku 10 menit.
        </p>
      </PortalFormHeading>
      <PortalAlert id={errorId} tone="error">
        {state.error}
      </PortalAlert>
      <div className="flex flex-col gap-2">
        <Label htmlFor="portal-code">Kode masuk</Label>
        <Input
          // Remount on every answer, so a wrong code is cleared for the next try.
          key={state.nonce}
          id="portal-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          autoFocus
          required
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby={errorId}
          className="h-16 rounded-xl px-5 text-center font-mono text-3xl tracking-[0.5em] md:text-3xl"
        />
      </div>
      {/* First submit button: the one Enter in the code field triggers. */}
      <Button type="submit" name="intent" value="verify" disabled={pending} className={portalButtonClass}>
        {pending && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
        Masuk
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <Button
          type="submit"
          name="intent"
          value="change-email"
          variant="link"
          disabled={pending}
          className="h-auto p-0 font-medium"
        >
          Ganti email
        </Button>
        {remaining > 0 ? (
          <span className="text-muted-foreground tabular-nums">Kirim ulang dalam {formatCountdown(remaining)}</span>
        ) : (
          <Button
            type="submit"
            name="intent"
            value="send"
            variant="link"
            disabled={pending}
            className="h-auto p-0 font-medium"
          >
            Kirim ulang kode
          </Button>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Tidak menemukan email? Periksa folder Spam atau Promosi.
      </p>
    </form>
  );
}
