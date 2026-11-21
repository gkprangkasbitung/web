/**
 * Portal Jemaat navigation (brief §17.3), client-safe (no `server-only`): one
 * list shared by the desktop sidebar, the mobile bottom nav (its 4 items),
 * and the Akun page's "Lainnya" links for the rest. Komisi and Akun come
 * from §17.3's page list; Persembahan is included only while the site
 * setting is on (brief §17.1), so a direct visit when it's off still 404s
 * (checked again on that page itself, not only hidden here).
 */

export type JemaatNavIcon = "beranda" | "pelayanan" | "profil" | "komisi" | "persembahan" | "akun";

export type JemaatNavItem = {
  href: string;
  label: string;
  icon: JemaatNavIcon;
  /** In the mobile bottom nav (exactly Beranda, Pelayanan, Profil, Akun). */
  bottom: boolean;
};

const ALL_ITEMS: readonly JemaatNavItem[] = [
  { href: "/jemaat", label: "Beranda", icon: "beranda", bottom: true },
  { href: "/jemaat/pelayanan", label: "Pelayanan", icon: "pelayanan", bottom: true },
  { href: "/jemaat/profil", label: "Profil", icon: "profil", bottom: true },
  { href: "/jemaat/komisi", label: "Komisi", icon: "komisi", bottom: false },
  { href: "/jemaat/persembahan", label: "Persembahan", icon: "persembahan", bottom: false },
  { href: "/jemaat/akun", label: "Akun", icon: "akun", bottom: true },
] as const;

/** The pages open to this account right now. */
export function jemaatNav(tampilkanPersembahan: boolean): JemaatNavItem[] {
  return ALL_ITEMS.filter((item) => item.href !== "/jemaat/persembahan" || tampilkanPersembahan);
}

/** `true` for `/jemaat` itself, and for an item's href or anything under it. */
export function isActiveJemaatNav(pathname: string, href: string): boolean {
  if (href === "/jemaat") return pathname === "/jemaat";
  return pathname === href || pathname.startsWith(`${href}/`);
}
