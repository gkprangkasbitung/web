import Link from "next/link";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import { BrandMark } from "./brand-mark";
import { PublicMobileNav, PublicNav } from "./public-nav";

/**
 * One header for every public page, built from the same markup at every
 * width so the breakpoint switch needs no extra logic:
 * - from `md` up, the dark green "brand" band from the mockups;
 * - below `md`, the light bordered bar (docs/design/beranda-mobile.html
 *   collapses the header to it regardless of which page it's for).
 * `/warta*` used to keep the light bar at every width (warta-detail.html);
 * it now shares the brand band with the other pages.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card text-foreground md:border-brand-border md:bg-brand md:text-brand-foreground">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 md:px-8">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2 truncate rounded-lg text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandMark />
          GKP Rangkasbitung
        </Link>
        <PublicNav variant="brand" />
        <ThemeSwitcher className="md:border-brand-border md:bg-transparent md:text-brand-foreground md:hover:bg-brand-border" />
        <PublicMobileNav />
      </div>
    </header>
  );
}
