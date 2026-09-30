import type { KegiatanItem } from "@/lib/public/site-content";

import { PublicImage } from "./public-image";

/** Beranda's "Kegiatan mendatang" grid (docs/design/beranda.html). Placeholder until stage 11b/14.4. */
export function ActivityGrid({ items }: { items: KegiatanItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <PublicImage photo={item.photo} ratio="video" fallbackLabel={`Foto kegiatan: ${item.judul}`} className="rounded-none" />
          <div className="flex flex-col gap-1 p-5">
            <span className="text-xs font-semibold text-primary">{item.tanggal}</span>
            <span className="font-serif text-lg">{item.judul}</span>
            {item.tempat && <span className="text-sm text-muted-foreground">{item.tempat}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
