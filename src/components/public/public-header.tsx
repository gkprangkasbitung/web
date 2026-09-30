"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import { BrandMark } from "./brand-mark";
import { PublicMobileNav, PublicNav } from "./public-nav";

/**
 * The header has two looks, both built from the same markup so the
 * breakpoint switch needs no extra logic:
 * - "brand": the dark green band from beranda/tentang-kami/jadwal-ibadah/
 *   kontak's mockups, desktop only (≥ md).
 * - "plain": the light bordered bar from warta-detail's mockup, used for
 *   `/warta*` at every width, and for every page below `md` (matching
 *   beranda-mobile.html, which collapses the header to this same light bar
 *   regardless of which page it's for).
 * The variant is derived from the route here, since it's purely
 * presentational and needs `usePathname` — the only reason this file (and
 * only this file) is a client component.
 */
export function PublicHeader() {
  const pathname = usePathname();
  const isBrand = !pathname.startsWith("/warta");

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-border bg-card text-foreground",
        isBrand && "md:border-brand-border md:bg-brand md:text-brand-foreground",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 md:px-8">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2 truncate rounded-lg text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandMark />
          GKP Rangkasbitung
        </Link>
        <PublicNav variant={isBrand ? "brand" : "plain"} />
        <ThemeSwitcher
          className={isBrand ? "md:border-brand-border md:bg-transparent md:text-brand-foreground md:hover:bg-brand-border" : undefined}
        />
        <PublicMobileNav />
      </div>
    </header>
  );
}
