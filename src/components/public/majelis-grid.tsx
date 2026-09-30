import type { MajelisItem } from "@/lib/public/site-content";

import { PublicImage } from "./public-image";

/** Tentang Kami's "Majelis Jemaat" grid (docs/design/tentang-kami.html). Placeholder until stage 11b (§14.3). */
export function MajelisGrid({ items }: { items: MajelisItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col items-center gap-3 text-center">
          <PublicImage photo={item.photo} ratio="portrait" fallbackLabel={`Foto ${item.nama}`} className="w-full" />
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">{item.nama}</span>
            <span className="text-sm text-muted-foreground">{item.jabatan}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
