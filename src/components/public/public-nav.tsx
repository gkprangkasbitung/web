"use client";

import { cn } from "cn";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** The public header's links, in brief §8's order. */
export const PUBLIC_NAV = [
  { href: "/", label: "Beranda" },
  { href: "/tentang-kami", label: "Tentang Kami" },
  { href: "/jadwal-ibadah", label: "Jadwal Ibadah" },
  { href: "/warta", label: "Warta" },
  { href: "/kontak", label: "Kontak" },
] as const;

export function isActivePublicPath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type NavVariant = "brand" | "plain";

/** The last link (Kontak) is always the mockups' pill CTA on the dark "brand" header. */
function NavLinks({
  vertical = false,
  variant = "plain",
  onNavigate,
}: {
  vertical?: boolean;
  variant?: NavVariant;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex items-center gap-1"}>
      {PUBLIC_NAV.map(({ href, label }, index) => {
        const active = isActivePublicPath(pathname, href);
        const isCta = variant === "brand" && index === PUBLIC_NAV.length - 1 && !vertical;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-9 items-center rounded-full px-3 text-sm font-medium outline-none transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                isCta
                  ? "bg-brand-foreground px-4 font-semibold text-brand hover:opacity-90"
                  : variant === "brand"
                    ? cn("rounded-lg", active ? "text-brand-foreground" : "text-brand-muted hover:text-brand-foreground")
                    : cn(
                        "rounded-lg",
                        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      ),
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Inline links from `md` up. */
export function PublicNav({ variant = "plain" }: { variant?: NavVariant }) {
  return (
    <nav aria-label="Navigasi utama" className="hidden md:block">
      <NavLinks variant={variant} />
    </nav>
  );
}

/** Below `md` the five links don't fit next to the brand at 360px: a slide-over menu (docs/design/beranda-mobile.html). */
export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Buka menu" className="md:hidden" />}>
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-70 gap-4 p-4 pt-14 sm:max-w-70">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Navigasi situs GKP Rangkasbitung</SheetDescription>
        <nav aria-label="Navigasi utama">
          <NavLinks vertical onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
