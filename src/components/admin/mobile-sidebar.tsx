"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/nav";

import type { AccountSummary } from "./account-menu";
import { SidebarContent } from "./sidebar-content";

export function MobileSidebar({ items, account }: { items: NavItem[]; account: AccountSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Buka menu" className="lg:hidden" />}>
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] gap-0 bg-sidebar p-0 sm:max-w-[280px]">
        <SheetTitle className="sr-only">Menu admin</SheetTitle>
        <SheetDescription className="sr-only">Navigasi panel admin GKP Rangkasbitung</SheetDescription>
        <SidebarContent items={items} account={account} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
