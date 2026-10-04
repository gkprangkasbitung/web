"use client";

import { cn } from "cn";
import { ChevronDownIcon, MenuIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  isActivePublicPath,
  isDropdownActive,
  PORTAL_LINK,
  visiblePublicNav,
  type PublicNavEntry,
} from "@/lib/public/nav";

type NavVariant = "brand" | "plain";

const NAV_ITEMS = visiblePublicNav();

function linkClass(variant: NavVariant, active: boolean): string {
  return cn(
    "flex h-9 items-center rounded-lg px-3 text-sm font-medium outline-none transition-colors",
    "focus-visible:ring-3 focus-visible:ring-ring/50",
    variant === "brand"
      ? active
        ? "text-brand-foreground"
        : "text-brand-muted hover:text-brand-foreground"
      : active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

/** The pill button at the far right of the header, in both variants (docs/design/beranda.html's CTA treatment). */
function PortalPill({ variant, className }: { variant: NavVariant; className?: string }) {
  return (
    <Link
      href={PORTAL_LINK.href}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        variant === "brand" ? "bg-brand-foreground text-brand hover:opacity-90" : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      <UserIcon aria-hidden="true" className="size-4" />
      {PORTAL_LINK.label}
    </Link>
  );
}

/**
 * "Tentang Kami" has its own page, so it's a link straight to it plus a
 * separate chevron-only disclosure button for its submenu (brief: "Link
 * 'Tentang Kami' tetap bisa diakses langsung"). "Informasi Jemaat" has no
 * page of its own: the whole label becomes the disclosure button, same as
 * any other nav item but with a chevron and `aria-expanded`. Either way, the
 * popover (Base UI) already gives the accessible disclosure pattern the
 * brief asks for: a real `<button>` with `aria-expanded`, opened by click or
 * Enter/Space, Escape closes it and returns focus to the button, and an
 * outside click closes it too — so none of that needs reimplementing here.
 */
function DropdownNavItem({
  entry,
  variant,
  pathname,
}: {
  entry: Extract<PublicNavEntry, { kind: "dropdown" }>;
  variant: NavVariant;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const active = isDropdownActive(pathname, entry);
  const hasOwnPage = entry.href !== undefined;

  return (
    <li className="flex items-center">
      {hasOwnPage && (
        <Link href={entry.href!} aria-current={active ? "page" : undefined} className={linkClass(variant, active)}>
          {entry.label}
        </Link>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={hasOwnPage ? `Submenu ${entry.label}` : undefined}
          aria-current={!hasOwnPage && active ? "page" : undefined}
          className={
            hasOwnPage
              ? cn(
                  "-ml-1 flex size-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  variant === "brand"
                    ? "text-brand-muted hover:bg-brand-border hover:text-brand-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              : cn(linkClass(variant, active), "gap-1")
          }
        >
          {!hasOwnPage && entry.label}
          <ChevronDownIcon aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={10} className="w-60 gap-1 p-1.5">
          <ul className="flex flex-col">
            {entry.items.map((item) => {
              const itemActive = isActivePublicPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={itemActive ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-md px-2.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                      itemActive ? "font-medium text-foreground" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** Inline links from `lg` up (below that, the items no longer fit: see PublicMobileNav). */
export function PublicNav({ variant = "plain" }: { variant?: NavVariant }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="hidden items-center gap-1 lg:flex">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((entry) => {
          if (entry.kind === "dropdown") {
            return <DropdownNavItem key={entry.label} entry={entry} variant={variant} pathname={pathname} />;
          }
          const active = isActivePublicPath(pathname, entry.href);
          return (
            <li key={entry.href}>
              <Link href={entry.href} aria-current={active ? "page" : undefined} className={linkClass(variant, active)}>
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <PortalPill variant={variant} className="ml-2" />
    </nav>
  );
}

/**
 * One accordion row in the mobile panel. "Tentang Kami" (its own page) keeps
 * a direct link plus a small chevron toggle; "Informasi Jemaat" (no page of
 * its own) is one full-width row that's purely the toggle.
 */
function MobileDropdownItem({
  entry,
  pathname,
  onNavigate,
}: {
  entry: Extract<PublicNavEntry, { kind: "dropdown" }>;
  pathname: string;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(() => isDropdownActive(pathname, entry));
  const panelId = useId();
  const active = isDropdownActive(pathname, entry);
  const hasOwnPage = entry.href !== undefined;

  return (
    <li className="flex flex-col">
      <div className="flex items-center">
        {hasOwnPage && (
          <Link
            href={entry.href!}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 flex-1 items-center rounded-lg px-3 text-base font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-accent text-foreground",
            )}
          >
            {entry.label}
          </Link>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={hasOwnPage ? `Submenu ${entry.label}` : undefined}
          aria-current={!hasOwnPage && active ? "page" : undefined}
          onClick={() => setExpanded((value) => !value)}
          className={
            hasOwnPage
              ? "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              : cn(
                  "flex h-11 flex-1 items-center justify-between gap-2 rounded-lg px-3 text-base font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-accent text-foreground",
                )
          }
        >
          {!hasOwnPage && entry.label}
          <ChevronDownIcon aria-hidden="true" className={cn("size-5 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
      {expanded && (
        <ul id={panelId} className="my-1 ml-3 flex flex-col gap-0.5 border-l border-border pl-3">
          {entry.items.map((item) => {
            const itemActive = isActivePublicPath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={itemActive ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center rounded-lg px-3 text-base outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                    itemActive ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Below `lg` the menu no longer fits next to the brand (docs/design/beranda-mobile.html):
 * a slide-over (Base UI Dialog underneath `Sheet`), which already traps
 * focus, closes on Escape with focus back on the trigger, and locks body
 * scroll while open.
 */
export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Buka menu" className="lg:hidden" />}>
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-80 gap-0 p-4 pt-14 sm:max-w-80">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Navigasi situs GKP Rangkasbitung</SheetDescription>
        <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((entry) => {
              if (entry.kind === "dropdown") {
                return <MobileDropdownItem key={entry.label} entry={entry} pathname={pathname} onNavigate={close} />;
              }
              const active = isActivePublicPath(pathname, entry.href);
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center rounded-lg px-3 text-base font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && "bg-accent text-foreground",
                    )}
                  >
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <SheetFooter className="p-0 pt-4">
          <Link
            href={PORTAL_LINK.href}
            onClick={close}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <UserIcon aria-hidden="true" className="size-4" />
            {PORTAL_LINK.label}
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
