import type { KegiatanItem } from "@/lib/public/site-content";

import { PublicImage } from "./public-image";

/** Beranda's "Kegiatan mendatang" grid (docs/design/beranda.html, brief §14.4). */
export function ActivityGrid({ items }: { items: KegiatanItem[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card">
          <PublicImage photo={item.photo} ratio="video" fallbackLabel={`Foto kegiatan: ${item.judul}`} className="rounded-none" />
          <div className="flex flex-col gap-2 p-6">
            <span className="text-[13px] font-semibold text-primary">{item.tanggal}</span>
            <span className="font-serif text-2xl leading-tight">{item.judul}</span>
            {item.tempat && <span className="text-sm text-muted-foreground">{item.tempat}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
