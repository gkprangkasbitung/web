import Link from "next/link";

import { formatDayShort } from "@/lib/dates";
import type { KegiatanItem } from "@/lib/public/site-content";

/** `/kegiatan/[slug]`'s "Kegiatan lainnya" (docs/design/kegiatan-detail.html): compact date-badge rows. */
export function KegiatanRelatedGrid({ items }: { items: KegiatanItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/kegiatan/${item.slug}`}
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:bg-accent"
        >
          <span className="flex w-15 flex-col items-center gap-0.5 rounded-xl bg-muted/60 py-2">
            <span className="text-xs text-muted-foreground">{formatDayShort(item.tanggalMulai)}</span>
            <span className="font-serif text-2xl leading-none">{Number(item.tanggalMulai.slice(8, 10))}</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{item.judul}</span>
            <span className="text-sm text-muted-foreground">
              {item.kategoriNama}
              {item.waktuLabel ? ` · ${item.waktuLabel}` : ""}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
