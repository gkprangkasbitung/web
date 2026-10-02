import "server-only";

import type { AuthUser } from "@/lib/auth/session";
import { can, type Action, type Resource } from "@/lib/auth/permissions";
import type { ServerSupabase } from "@/lib/supabase/server";

export type NavIcon =
  | "dashboard"
  | "warta"
  | "peribadahan"
  | "litbang"
  | "sarana-dana"
  | "tempat"
  | "wilayah"
  | "jemaat"
  | "keluarga"
  | "label-jemaat"
  | "users"
  | "roles"
  | "log"
  | "profil-gereja"
  | "pelayanan"
  | "majelis"
  | "kegiatan"
  | "pendeta"
  | "komisi";

export type NavLink = { label: string; href: string };
/** `group`: consecutive entries with the same group render under one heading. */
export type NavItem = NavLink & { icon: NavIcon; group?: string; children?: NavLink[] };

type Entry = NavLink & {
  icon: NavIcon;
  group?: string;
  permission?: [Resource, Action];
  children?: "peribadahan" | "sarana-dana";
};

// Sidebar order and guards (brief §9.1). Dashboard is open to every signed-in user.
const ENTRIES: Entry[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Warta", href: "/admin/warta", icon: "warta", permission: ["warta", "read"] },
  {
    label: "Peribadahan",
    href: "/admin/peribadahan",
    icon: "peribadahan",
    permission: ["warta", "read"],
    children: "peribadahan",
  },
  { label: "Litbang", href: "/admin/litbang", icon: "litbang", permission: ["warta", "read"] },
  {
    label: "Sarana & Dana",
    href: "/admin/sarana-dana",
    icon: "sarana-dana",
    permission: ["warta", "read"],
    children: "sarana-dana",
  },
  { label: "Tempat", href: "/admin/tempat", icon: "tempat", permission: ["warta", "read"] },
  { label: "Wilayah", href: "/admin/wilayah", icon: "wilayah", permission: ["warta", "read"] },
  { label: "Data Jemaat", href: "/admin/jemaat", icon: "jemaat", permission: ["warta", "read"] },
  { label: "Keluarga", href: "/admin/keluarga", icon: "keluarga", permission: ["warta", "read"] },
  { label: "Label Jemaat", href: "/admin/label-jemaat", icon: "label-jemaat", permission: ["warta", "read"] },
  // Brief §14: the "Konten Situs" group, after Label Jemaat.
  {
    label: "Profil Gereja",
    href: "/admin/profil-gereja",
    icon: "profil-gereja",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  {
    label: "Pelayanan",
    href: "/admin/pelayanan",
    icon: "pelayanan",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  {
    label: "Majelis",
    href: "/admin/majelis",
    icon: "majelis",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  {
    label: "Kegiatan",
    href: "/admin/kegiatan",
    icon: "kegiatan",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  {
    label: "Pendeta",
    href: "/admin/pendeta",
    icon: "pendeta",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  {
    label: "Komisi",
    href: "/admin/komisi",
    icon: "komisi",
    group: "Konten Situs",
    permission: ["situs", "read"],
  },
  { label: "Pengguna", href: "/admin/users", icon: "users", permission: ["users", "read"] },
  { label: "Roles & Permissions", href: "/admin/roles", icon: "roles", permission: ["roles", "read"] },
  { label: "Log Aktivitas", href: "/admin/log-aktivitas", icon: "log", permission: ["activity_log", "read"] },
];

/** The sidebar entries this user may see, with Peribadahan and Sarana & Dana sub-entries. */
export async function getAdminNav(user: AuthUser, supabase: ServerSupabase): Promise<NavItem[]> {
  const visible = ENTRIES.filter((entry) => !entry.permission || can(user, ...entry.permission));
  const needsChildren = visible.some((entry) => entry.children);

  const [categories, items] = needsChildren
    ? await Promise.all([
        supabase.from("peribadahan_categories").select("key, name").order("sort_order"),
        // sarana_dana_items has no sort_order; name order matches the seeded order.
        supabase.from("sarana_dana_items").select("key, name").order("name"),
      ])
    : [null, null];
  if (categories?.error) console.error("[nav] peribadahan_categories:", categories.error.message);
  if (items?.error) console.error("[nav] sarana_dana_items:", items.error.message);

  return visible.map(({ label, href, icon, group, children }) => {
    const item = group ? { label, href, icon, group } : { label, href, icon };
    if (children === "peribadahan") {
      return {
        ...item,
        children: (categories?.data ?? []).map((c) => ({ label: c.name, href: `/admin/peribadahan/${c.key}` })),
      };
    }
    if (children === "sarana-dana") {
      return {
        ...item,
        children: (items?.data ?? []).map((i) => ({ label: i.name, href: `/admin/sarana-dana/${i.key}` })),
      };
    }
    return item;
  });
}
