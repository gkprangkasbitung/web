"use client";

import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { logout } from "@/app/admin/actions";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AccountSummary = { name: string; email: string; roleNames: string[] };

export function AccountMenu({ account, onNavigate }: { account: AccountSummary; onNavigate?: () => void }) {
  const [pending, startTransition] = useTransition();
  const roles = account.roleNames.length > 0 ? account.roleNames.join(", ") : "Tanpa role";

  function handleLogout() {
    startTransition(async () => {
      // On success the action redirects to /login; the router follows it.
      try {
        await logout();
      } catch {
        toast.error("Gagal keluar. Coba lagi.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent"
        aria-label={`Menu akun ${account.name}`}
      >
        <InitialsAvatar name={account.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{account.name}</span>
          <span className="truncate text-xs text-muted-foreground">{roles}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{account.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/admin/akun" onClick={onNavigate} />}>
          <UserIcon aria-hidden="true" />
          Profil Saya
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} disabled={pending}>
          <LogOutIcon aria-hidden="true" />
          {pending ? "Keluar…" : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
