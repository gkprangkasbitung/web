import Link from "next/link";

import type { KomisiCardItem } from "@/lib/public/site-content";

import { PublicImage } from "./public-image";

/** `/komisi`: a grid of cards (brief §14.8), same card shape as ActivityGrid. */
export function KomisiGrid({ items }: { items: KomisiCardItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/komisi/${item.slug}`}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PublicImage photo={item.photo} ratio="video" fallbackLabel={`Foto ${item.nama}`} className="rounded-none" />
          <div className="flex flex-col gap-1 p-5">
            <span className="font-serif text-lg group-hover:underline group-hover:underline-offset-4">{item.nama}</span>
            {item.deskripsi && <span className="text-sm text-muted-foreground">{item.deskripsi}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
