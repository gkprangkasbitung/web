import { ArrowLeftIcon, ArrowRightIcon, LockIcon, MailIcon, ShieldCheckIcon, UserIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalAlert } from "@/components/portal/portal-alert";
import { PortalBrand } from "@/components/portal/portal-brand";
import { portalLinkClass } from "@/components/portal/portal-split-layout";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { homePath, isJemaat, isStaff } from "@/lib/auth/portal";
import { getAuthenticatedUser } from "@/lib/auth/session";

import { logoutFromPortal } from "./actions";

export const metadata: Metadata = { title: "Portal" };

const cardClass =
  "group flex flex-col gap-3 rounded-[20px] p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-[340px] sm:gap-[18px] sm:rounded-[22px] sm:p-9";
const cardButtonClass =
  "mt-1.5 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-medium sm:mt-auto sm:h-13 sm:text-base";

/**
 * Pick a portal (docs/design/portal-pilih.html and portal-pilih-mobile.html,
 * stage 11f). The choice only picks a login page; access is decided on the
 * server from the account's roles and jemaat link. A signed-in visitor goes
 * straight to their portal, except right after being refused a page
 * (?error=akses), when the notice explains it first.
 */
export default async function PortalPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [{ error }, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  const refused = error === "akses";
  const home = user ? homePath(user) : null;
  if (home && !refused) redirect(home);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:h-[76px] sm:px-8 lg:px-[120px]">
        <PortalBrand className="text-[15px] sm:text-[17px] [&>span]:hidden sm:[&>span]:flex" />
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="hidden items-center gap-2 rounded-md text-[15px] text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Kembali ke website
          </Link>
          <ThemeSwitcher />
          <Link
            href="/"
            aria-label="Kembali ke website"
            className="flex size-11 items-center justify-center rounded-md text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:hidden"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 pt-8 pb-6 sm:items-center sm:justify-center sm:gap-12 sm:px-8 sm:py-16 lg:px-[120px]">
        <div className="flex flex-col gap-2 sm:items-center sm:gap-3.5 sm:text-center">
          <span className="hidden text-sm tracking-[0.14em] text-primary uppercase sm:block">Portal</span>
          <h1 className="font-serif text-[40px] leading-tight font-normal tracking-[-0.02em] sm:text-[60px]">
            Masuk ke portal
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">Pilih sesuai keperluan Anda.</p>
        </div>

        {user && (refused || !home) && (
          <div className="flex w-full max-w-[984px] flex-col gap-3">
            <PortalAlert tone={refused ? "error" : "info"}>
              {refused
                ? `Akun ${user.email} tidak memiliki akses ke halaman yang tadi Anda buka.`
                : `Akun ${user.email} belum memiliki akses ke portal mana pun. Hubungi sekretariat untuk aktivasi.`}
            </PortalAlert>
            <div className="flex flex-wrap gap-2">
              {isJemaat(user) && (
                <Link href="/jemaat" className={buttonVariants({ variant: "outline" })}>
                  Buka Portal Jemaat
                </Link>
              )}
              {isStaff(user) && (
                <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                  Buka Admin
                </Link>
              )}
              <form action={logoutFromPortal}>
                <Button type="submit" variant="ghost">
                  Keluar dan masuk dengan akun lain
                </Button>
              </form>
            </div>
          </div>
        )}
        {!user && refused && (
          <PortalAlert tone="error" className="w-full max-w-[984px]">
            Anda tidak memiliki akses ke halaman yang tadi Anda buka. Masuk dengan akun yang sesuai.
          </PortalAlert>
        )}

        <div className="grid w-full max-w-[984px] gap-6 sm:grid-cols-2">
          <Link href="/portal/masuk" className={`${cardClass} bg-brand text-brand-foreground hover:opacity-95`}>
            <span className="hidden size-14 items-center justify-center rounded-2xl bg-brand-foreground/10 sm:flex">
              <UserIcon aria-hidden="true" className="size-[26px]" strokeWidth={1.6} />
            </span>
            <span className="font-serif text-[28px] leading-[1.1] sm:text-4xl">Portal Jemaat</span>
            <span className="text-[15px] leading-[1.55] text-brand-foreground/85 sm:hidden">
              Profil, data keluarga, dan jadwal pelayanan Anda. Masuk dengan kode lewat email.
            </span>
            <span className="hidden text-base leading-relaxed text-brand-foreground/85 sm:block">
              Lihat profil dan data keluarga, jadwal pelayanan Anda, serta informasi jemaat.
            </span>
            <span className="hidden items-center gap-2 text-sm text-brand-muted sm:flex">
              <MailIcon aria-hidden="true" className="size-4" />
              Masuk dengan kode lewat email, tanpa password
            </span>
            <span className={`${cardButtonClass} bg-brand-foreground text-brand`}>
              Masuk sebagai Jemaat
              <ArrowRightIcon aria-hidden="true" className="hidden size-4 sm:block" />
            </span>
          </Link>

          <Link href="/login" className={`${cardClass} border border-border bg-card text-card-foreground hover:bg-card/90`}>
            <span className="hidden size-14 items-center justify-center rounded-2xl bg-badge-accent text-badge-accent-foreground sm:flex">
              <ShieldCheckIcon aria-hidden="true" className="size-[26px]" strokeWidth={1.6} />
            </span>
            <span className="font-serif text-[28px] leading-[1.1] sm:text-4xl">Pengurus &amp; Admin</span>
            <span className="text-[15px] leading-[1.55] text-foreground/80 sm:hidden">
              Kelola warta, jadwal, data jemaat, dan website. Khusus pengurus yang diundang.
            </span>
            <span className="hidden text-base leading-relaxed text-foreground/80 sm:block">
              Kelola warta, jadwal ibadah, data jemaat, keuangan, dan konten website.
            </span>
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <LockIcon aria-hidden="true" className="size-4" />
              Khusus pengurus yang sudah diundang
            </span>
            <span className={`${cardButtonClass} border-[1.5px] border-foreground text-foreground`}>
              Masuk sebagai Pengurus
              <ArrowRightIcon aria-hidden="true" className="hidden size-4 sm:block" />
            </span>
          </Link>
        </div>

        <p className="mt-auto text-center text-sm leading-relaxed text-muted-foreground sm:mt-0 sm:text-[15px]">
          Belum punya akun Portal Jemaat?
          <br className="sm:hidden" />{" "}
          <Link href="/kontak" className={portalLinkClass}>
            Hubungi sekretariat
          </Link>{" "}
          untuk aktivasi.
        </p>
      </main>
    </div>
  );
}
