import { pelayananIcon } from "@/lib/pelayanan-icons";
import type { PelayananItem } from "@/lib/public/site-content";

/**
 * Beranda's "Pelayanan" grid (docs/design/beranda.html, brief §14.2). The
 * cards use the page background so they stand out on the section's white band.
 */
export function MinistryGrid({ items }: { items: PelayananItem[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = pelayananIcon(item.icon);
        return (
          <div key={item.id} className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-background p-7 md:p-8">
            <span className="flex size-12 items-center justify-center rounded-[14px] bg-brand text-brand-foreground">
              <Icon aria-hidden="true" className="size-5.5" />
            </span>
            <span className="font-serif text-2xl md:text-[1.7rem]">{item.nama}</span>
            {item.deskripsi && <span className="text-[15px] leading-relaxed text-muted-foreground">{item.deskripsi}</span>}
          </div>
        );
      })}
    </div>
  );
}
