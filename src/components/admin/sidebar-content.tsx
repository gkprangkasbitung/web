"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/nav";

import { AccountMenu, type AccountSummary } from "./account-menu";
import { SidebarNav } from "./sidebar-nav";

/** Brand, menu, and account menu; shared by the desktop sidebar and the mobile slide-over. */
export function SidebarContent({
  items,
  account,
  onNavigate,
}: {
  items: NavItem[];
  account: AccountSummary;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
          >
            G
          </span>
          <span className="text-sm font-semibold">GKP Rangkasbitung</span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <SidebarNav items={items} onNavigate={onNavigate} />
      </div>
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <AccountMenu account={account} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
