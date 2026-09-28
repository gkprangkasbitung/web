import type { AccountSummary } from "@/components/admin/account-menu";
import { MobileSidebar } from "@/components/admin/mobile-sidebar";
import { SidebarContent } from "@/components/admin/sidebar-content";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { displayName, requireUser } from "@/lib/auth/session";
import { getAdminNav } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = await getAdminNav(user, await createClient());
  const account: AccountSummary = {
    name: displayName(user),
    email: user.email,
    roleNames: user.roles.map((role) => role.name),
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#konten"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50"
      >
        Langsung ke konten
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <SidebarContent items={items} account={account} />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-8">
          <MobileSidebar items={items} account={account} />
          <span className="truncate text-sm font-semibold lg:hidden">GKP Rangkasbitung</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </header>
        <main id="konten" tabIndex={-1} className="flex-1 p-4 outline-none md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
