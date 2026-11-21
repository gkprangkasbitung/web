import type { Metadata } from "next";
import Link from "next/link";

import { logoutJemaat } from "@/app/jemaat/actions";
import { jemaatButtonClass } from "@/components/jemaat-portal/control-classes";
import { HapusAkunButton } from "@/components/jemaat-portal/hapus-akun-button";
import { Button } from "@/components/ui/button";
import { requireJemaat } from "@/lib/auth/session";
import { jemaatNav } from "@/lib/jemaat-portal-nav";
import { loadPengaturanPortal } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Akun Saya" };

/**
 * Akun Saya (brief §17.3, §17.4): email, Keluar, "Hapus akun login", and a
 * "Lainnya" list for the pages that don't fit the mobile bottom nav's 4
 * slots (Komisi, and Persembahan while its setting is on) — the one place
 * a phone can still reach them in two taps.
 */
export default async function AkunPage() {
  const user = await requireJemaat();
  const supabase = await createClient();
  const tampilkanPersembahan = await loadPengaturanPortal(supabase)
    .then((setting) => setting.tampilkanPersembahan)
    .catch((error: unknown) => {
      console.error("[/jemaat/akun] pengaturan_portal failed:", error);
      return false;
    });
  const lainnya = jemaatNav(tampilkanPersembahan).filter((item) => !item.bottom);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-serif text-3xl font-normal tracking-tight">Akun Saya</h1>

      <section aria-labelledby="akun" className="flex flex-col gap-4">
        <h2 id="akun" className="font-serif text-xl font-normal">
          Akun
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-base font-medium">{user.email}</span>
          </div>
          <form action={logoutJemaat}>
            <Button type="submit" variant="outline" className={`${jemaatButtonClass} w-fit`}>
              Keluar
            </Button>
          </form>
        </div>
      </section>

      {lainnya.length > 0 && (
        <section aria-labelledby="lainnya" className="flex flex-col gap-4">
          <h2 id="lainnya" className="font-serif text-xl font-normal">
            Lainnya
          </h2>
          <ul className="flex flex-col gap-2">
            {lainnya.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center rounded-xl border border-border bg-card px-4 text-base font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="hapus-akun" className="flex flex-col gap-4">
        <h2 id="hapus-akun" className="font-serif text-xl font-normal text-destructive">
          Hapus Akun Login
        </h2>
        <p className="text-sm text-muted-foreground">
          Menghapus akun login tidak menghapus data Anda sebagai jemaat di gereja — hanya akun untuk masuk ke Portal
          Jemaat ini.
        </p>
        <HapusAkunButton email={user.email} />
      </section>
    </div>
  );
}
