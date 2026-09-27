"use client";

import {
  BookOpenIcon,
  CalendarDaysIcon,
  HistoryIcon,
  HouseIcon,
  LayoutDashboardIcon,
  MapIcon,
  MapPinIcon,
  NewspaperIcon,
  ShieldCheckIcon,
  TagsIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import type { NavIcon, NavItem } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  warta: NewspaperIcon,
  peribadahan: CalendarDaysIcon,
  litbang: BookOpenIcon,
  "sarana-dana": WalletIcon,
  tempat: MapPinIcon,
  wilayah: MapIcon,
  jemaat: UsersIcon,
  keluarga: HouseIcon,
  "label-jemaat": TagsIcon,
  users: UserCogIcon,
  roles: ShieldCheckIcon,
  log: HistoryIcon,
};

function matches(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu admin" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const activeChild = item.children?.find((child) => matches(pathname, child.href));
        // An active sub-entry does not also mark its parent (brief §9.1).
        const active = !activeChild && matches(pathname, item.href);

        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>

            {item.children && item.children.length > 0 && (
              <ul className="my-0.5 ml-[18px] flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
                {item.children.map((child) => {
                  const childActive = child === activeChild;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                          childActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
