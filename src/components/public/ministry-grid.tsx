import { HeartHandshakeIcon, SparklesIcon, type LucideIcon } from "lucide-react";

import type { PelayananItem } from "@/lib/public/site-content";

/** The fixed icon list brief §14.2 mentions choosing from; grows as real icons are needed. */
const ICONS: Record<string, LucideIcon> = {
  HeartHandshake: HeartHandshakeIcon,
};

/** Beranda's "Pelayanan" grid (docs/design/beranda.html). Every item is a placeholder until stage 11b. */
export function MinistryGrid({ items }: { items: PelayananItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? SparklesIcon;
        return (
          <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="font-serif text-xl">{item.nama}</span>
            {item.deskripsi && <span className="text-sm text-muted-foreground">{item.deskripsi}</span>}
          </div>
        );
      })}
    </div>
  );
}
