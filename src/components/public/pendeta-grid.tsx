import type { PendetaItem } from "@/lib/public/site-content";

import { PendetaPhoto } from "./pendeta-photo";

/** Tentang Kami's "Pendeta Jemaat" (brief §14.7): the currently serving pastor(s), large cards. */
export function PendetaFeatured({ items }: { items: PendetaItem[] }) {
  return (
    <div className="flex flex-col gap-8">
      {items.map((item) => (
        <div key={item.id} className="grid gap-6 rounded-2xl border border-border bg-card p-6 md:grid-cols-[minmax(0,240px)_1fr] md:items-center md:p-8">
          <PendetaPhoto item={item} className="aspect-[4/5] w-full" />
          <div className="flex flex-col gap-2">
            <span className="text-xl font-semibold">{item.nama}</span>
            <span className="text-sm text-muted-foreground">{item.peran}</span>
            <span className="text-sm font-medium text-primary">Melayani sejak {item.tahunMulai}</span>
            {item.keterangan && <p className="mt-2 leading-relaxed text-muted-foreground whitespace-pre-line">{item.keterangan}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tentang Kami's "Pendeta yang pernah melayani" (brief §14.7): a grid of smaller cards. */
export function PendetaPastGrid({ items }: { items: PendetaItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col items-center gap-3 text-center">
          <PendetaPhoto item={item} className="aspect-[4/5] w-full" />
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">{item.nama}</span>
            <span className="text-sm text-muted-foreground">{item.peran}</span>
            <span className="text-sm text-muted-foreground">
              {item.tahunMulai}–{item.tahunSelesai}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
