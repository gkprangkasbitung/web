import Link from "next/link";

import { KategoriBadge } from "@/components/kegiatan/kategori-badge";
import type { KegiatanItem } from "@/lib/public/site-content";

import { PublicImage } from "./public-image";

/** Beranda's "Kegiatan mendatang" grid (docs/design/beranda.html, brief §14.4). */
export function ActivityGrid({ items }: { items: KegiatanItem[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/kegiatan/${item.slug}`}
          className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card"
        >
          <PublicImage photo={item.photo} ratio="video" fallbackLabel={`Foto kegiatan: ${item.judul}`} className="rounded-none" />
          <div className="flex flex-col gap-2 p-6">
            <KategoriBadge nama={item.kategoriNama} warna={item.kategoriWarna} className="self-start" />
            <span className="font-serif text-2xl leading-tight">{item.judul}</span>
            <span className="text-sm font-medium text-primary">{item.tanggal}</span>
            {item.tempat && <span className="text-sm text-muted-foreground">{item.tempat}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
