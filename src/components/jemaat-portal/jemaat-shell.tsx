"use client";

import { cn } from "cn";
import {
  CalendarCheckIcon,
  HandCoinsIcon,
  HouseIcon,
  LogOutIcon,
  type LucideIcon,
  UserCogIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutJemaat } from "@/app/jemaat/actions";
import { PortalBrand } from "@/components/portal/portal-brand";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { isActiveJemaatNav, type JemaatNavItem } from "@/lib/jemaat-portal-nav";

const ICONS: Record<JemaatNavItem["icon"], LucideIcon> = {
  beranda: HouseIcon,
  pelayanan: CalendarCheckIcon,
  profil: UserRoundIcon,
  komisi: UsersIcon,
  persembahan: HandCoinsIcon,
  akun: UserCogIcon,
};

function NavLink({ item, pathname, variant }: { item: JemaatNavItem; pathname: string; variant: "sidebar" | "bottom" }) {
  const Icon = ICONS[item.icon];
  const active = isActiveJemaatNav(pathname, item.href);

  if (variant === "bottom") {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      {item.label}
    </Link>
  );
}

/**
 * The Portal Jemaat shell (brief §17.3): same design tokens as the public
 * site (serif brand mark, --primary accent, card surfaces), not the admin
 * CMS look. Desktop gets a simple left sidebar; phones get a bottom
 * navigation bar with exactly 4 destinations (Beranda, Pelayanan, Profil,
 * Akun) — Komisi and Persembahan stay one tap away from Akun's "Lainnya"
 * list, so the bar itself never grows past what fits a thumb.
 *
 * Every control is at least 48px tall (`min-h-12`) and text stays 16px
 * (`text-base`, never shrinking to `md:text-sm`), because many jemaat are
 * older and on a phone.
 */
export function JemaatShell({
  items,
  nama,
  akun,
  isStaffToo,
  children,
}: {
  items: JemaatNavItem[];
  nama: string;
  /** Username, or the email of an email account; never the internal email (§18.7). */
  akun: string;
  isStaffToo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bottomItems = items.filter((item) => item.bottom);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#konten"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50"
      >
        Langsung ke konten
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <PortalBrand className="text-[15px]" />
        </div>
        <nav aria-label="Navigasi Portal Jemaat" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} variant="sidebar" />
          ))}
        </nav>
        <div className="shrink-0 border-t border-border p-4">
          <p className="truncate text-sm font-medium">{nama}</p>
          <p className="truncate text-sm text-muted-foreground">{akun}</p>
          {isStaffToo && (
            <Link
              href="/admin"
              className="mt-2 block w-fit rounded-md text-sm text-primary underline underline-offset-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Buka halaman admin
            </Link>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <ThemeSwitcher />
            <form action={logoutJemaat}>
              <Button type="submit" variant="outline" size="sm">
                <LogOutIcon aria-hidden="true" />
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
          <PortalBrand className="text-[15px]" />
          <ThemeSwitcher />
        </header>

        <main id="konten" tabIndex={-1} className="flex-1 px-4 py-6 pb-28 outline-none sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t border-border bg-card px-2 py-1 lg:hidden"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        {bottomItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
