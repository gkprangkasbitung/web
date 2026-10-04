import { LogOutIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PortalBrand } from "@/components/portal/portal-brand";
import { portalLinkClass } from "@/components/portal/portal-split-layout";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { isStaff } from "@/lib/auth/portal";
import { displayName, requireJemaat } from "@/lib/auth/session";
import { loadMyJemaat } from "@/lib/jemaat-portal";
import { createClient } from "@/lib/supabase/server";

import { logoutJemaat } from "./actions";

export const metadata: Metadata = { title: "Portal Jemaat" };

/**
 * Portal Jemaat landing (stage 11f): a greeting while the portal is built.
 * Only accounts linked to a jemaat get here, and it reads only that
 * account's own jemaat name.
 */
export default async function JemaatPage() {
  const user = await requireJemaat();
  const jemaat = await loadMyJemaat(await createClient());
  const nama = jemaat?.nama ?? displayName(user);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:h-[76px] sm:px-8 lg:px-[120px]">
        <PortalBrand className="text-[15px] sm:text-[17px]" />
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <form action={logoutJemaat}>
            <Button type="submit" variant="outline">
              <LogOutIcon aria-hidden="true" />
              Keluar
            </Button>
          </form>
        </div>
      </header>

      <main id="konten" className="flex flex-1 flex-col items-start gap-4 px-4 py-12 sm:px-8 lg:px-[120px] lg:py-20">
        <span className="text-sm tracking-[0.14em] text-primary uppercase">Portal Jemaat</span>
        <h1 className="font-serif text-[40px] leading-tight font-normal tracking-[-0.02em] sm:text-[52px]">
          Selamat datang, {nama}
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Portal Jemaat sedang disiapkan. Nantinya Anda bisa melihat profil, data keluarga, dan jadwal pelayanan Anda di
          sini.
        </p>
        <p className="text-sm text-muted-foreground">Masuk sebagai {user.email}</p>
        {isStaff(user) && (
          <Link href="/admin" className={`${portalLinkClass} text-sm`}>
            Buka halaman admin
          </Link>
        )}
      </main>
    </div>
  );
}
