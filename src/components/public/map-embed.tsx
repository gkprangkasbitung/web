import { ArrowUpRightIcon } from "lucide-react";

import { cn } from "cn";

/**
 * The church's location as an embedded Google map (Beranda's "Kunjungi
 * kami", Kontak), shown directly with no click needed. `src` comes from
 * lib/public/maps-embed.ts. Below it, a link opens the full Google Maps
 * (Profil Gereja's URL when set, otherwise the embed's own search) for
 * directions; the iframe itself isn't keyboard-friendly.
 */
export function MapEmbed({ src, mapsUrl, className }: { src: string; mapsUrl: string | null; className?: string }) {
  const openUrl = mapsUrl ?? src.replace("&output=embed", "");

  return (
    <figure className={cn("flex min-h-80 flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <iframe
        src={src}
        title="Peta lokasi GKP Rangkasbitung"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="min-h-64 w-full flex-1 border-0 bg-muted"
      />
      <figcaption className="border-t border-border px-5 py-3.5">
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Buka di Google Maps
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
          <span className="sr-only"> (tab baru)</span>
        </a>
      </figcaption>
    </figure>
  );
}
