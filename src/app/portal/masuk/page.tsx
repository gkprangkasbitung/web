import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalAlert } from "@/components/portal/portal-alert";
import { PortalFormHeading, PortalSplitLayout } from "@/components/portal/portal-split-layout";
import { isJemaat } from "@/lib/auth/portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getAuthenticatedUser } from "@/lib/auth/session";

import { CARA_MASUK, parseCaraMasuk } from "./cara-masuk";
import { PortalLoginForm } from "./portal-login-form";

export const metadata: Metadata = { title: "Masuk Portal Jemaat" };

/**
 * Portal Jemaat sign-in (docs/design/portal-login-jemaat.html): "Username &
 * password" (the default, brief §18.7: accounts made by the secretariat) or
 * "Email & password", as two tab links (?cara=email) that keep `next`.
 */
export default async function PortalMasukPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[]; cara?: string | string[] }>;
}) {
  const { next: rawNext, error, cara: rawCara } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext, "jemaat");
  const cara = parseCaraMasuk(rawCara);

  // Already signed in as a jemaat: straight on. Any other account sees the
  // form, to sign in as someone else.
  const user = await getAuthenticatedUser();
  if (user && isJemaat(user)) redirect(next);

  return (
    <PortalSplitLayout
      variant="jemaat"
      eyebrow="Portal Jemaat"
      headline="Selamat datang kembali"
      description="Masuk dengan username dan password dari sekretariat."
    >
      <PortalFormHeading title="Masuk Portal Jemaat">
        <p>
          {cara === "username"
            ? "Masukkan username dan password dari sekretariat."
            : "Masukkan email dan password akun Portal Jemaat Anda."}
        </p>
      </PortalFormHeading>
      <nav aria-label="Cara masuk" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-muted p-1">
        {CARA_MASUK.map((option) => {
          const params = new URLSearchParams();
          if (option.value === "email") params.set("cara", "email");
          if (next !== "/jemaat") params.set("next", next);
          const query = params.toString();
          const active = option.value === cara;
          return (
            <Link
              key={option.value}
              href={query ? `/portal/masuk?${query}` : "/portal/masuk"}
              aria-current={active ? "page" : undefined}
              replace
              className={`flex min-h-11 items-center justify-center rounded-full px-3 text-center text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
      {error === "tautan" && (
        <PortalAlert tone="info">
          Tautan aktivasi tidak valid atau sudah kedaluwarsa. Masuk di bawah ini, atau minta undangan baru ke
          sekretariat.
        </PortalAlert>
      )}
      <PortalLoginForm key={cara} next={next} cara={cara} />
    </PortalSplitLayout>
  );
}
