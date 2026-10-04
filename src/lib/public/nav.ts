/**
 * One source of truth for the public site's menu (brief §2, §8, §14; stage
 * 11g), shared by the desktop header, the mobile slide-over, and the
 * footer's "Jemaat" column. No "use client": plain data and pure helpers,
 * safe to import from a Server Component too.
 *
 * `enabled: false` hides an entry (or one dropdown item) from every
 * consumer instead of showing a link to a page that doesn't exist yet in
 * this codebase. Everything below is enabled, since every page it points to
 * already exists (`public-nav.test.ts` checks this against the route tree).
 */

export type PublicNavLink = { href: string; label: string; enabled?: boolean };

export type PublicNavEntry =
  | ({ kind: "link" } & PublicNavLink)
  | {
      kind: "dropdown";
      label: string;
      /**
       * The dropdown's own page, when it has one ("Tentang Kami" does, so
       * its label stays a direct link too). Left out when the dropdown is
       * only a grouping label with no page of its own ("Informasi Jemaat"):
       * then the whole control is the disclosure button, and `isDropdownActive`
       * falls back to its items alone.
       */
      href?: string;
      enabled?: boolean;
      items: readonly PublicNavLink[];
    };

export const PUBLIC_NAV: readonly PublicNavEntry[] = [
  { kind: "link", href: "/", label: "Beranda" },
  {
    kind: "dropdown",
    href: "/tentang-kami",
    label: "Tentang Kami",
    items: [
      { href: "/tentang-kami", label: "Profil Gereja" },
      { href: "/pendeta-majelis", label: "Pendeta & Majelis" },
      { href: "/komisi", label: "Komisi" },
    ],
  },
  {
    kind: "dropdown",
    label: "Informasi Jemaat",
    items: [
      { href: "/jadwal-ibadah", label: "Jadwal Ibadah" },
      { href: "/kegiatan", label: "Kegiatan" },
      { href: "/warta", label: "Warta" },
    ],
  },
  { kind: "link", href: "/kontak", label: "Kontak" },
] as const;

/** The pill button at the far right of the header and the mobile panel's footer. */
export const PORTAL_LINK: PublicNavLink = { href: "/portal", label: "Portal" };

/** `PUBLIC_NAV` with disabled entries, and disabled items inside a dropdown, removed. */
export function visiblePublicNav(entries: readonly PublicNavEntry[] = PUBLIC_NAV): PublicNavEntry[] {
  const result: PublicNavEntry[] = [];
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    if (entry.kind === "dropdown") {
      const items = entry.items.filter((item) => item.enabled !== false);
      if (items.length === 0) continue;
      result.push({ ...entry, items });
    } else {
      result.push(entry);
    }
  }
  return result;
}

/** A link's `href` without its `#fragment`, for matching against `pathname`. */
function pathOf(href: string): string {
  return href.split("#")[0]!;
}

/** Whether `pathname` is `href` itself or a sub-path of it (fragments ignored). */
export function isActivePublicPath(pathname: string, href: string): boolean {
  const path = pathOf(href);
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Whether a dropdown counts as the active entry: its own page (if it has
 * one), or any of its items' pages. `/komisi/*` is one of Tentang Kami's
 * items, so it marks "Tentang Kami" active even though "Komisi" itself isn't
 * shown at the top level until the dropdown opens. A dropdown with no own
 * page ("Informasi Jemaat") is active purely on its items.
 */
export function isDropdownActive(pathname: string, entry: Extract<PublicNavEntry, { kind: "dropdown" }>): boolean {
  return (
    (entry.href !== undefined && isActivePublicPath(pathname, entry.href)) ||
    entry.items.some((item) => isActivePublicPath(pathname, item.href))
  );
}

/** Every link in the menu, dropdowns flattened to their items, Beranda left out (used by the footer). */
export function flattenPublicNav(entries: readonly PublicNavEntry[] = visiblePublicNav()): PublicNavLink[] {
  const links: PublicNavLink[] = [];
  for (const entry of entries) {
    if (entry.href === "/") continue;
    if (entry.kind === "dropdown") links.push(...entry.items);
    else links.push(entry);
  }
  return links;
}
