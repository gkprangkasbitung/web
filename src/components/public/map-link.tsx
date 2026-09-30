import { ArrowUpRightIcon, MapIcon } from "lucide-react";

/**
 * Stands where the mockups show a map (docs/design/kontak.html): a link to
 * the church's Google Maps URL (Profil Gereja, brief §14.1). No embedded
 * iframe: a share link (maps.app.goo.gl) can't be embedded, and an embed
 * would load Google's tracking on every visit. Hidden when there is no URL.
 */
export function MapLink({ mapsUrl, className }: { mapsUrl: string; className?: string }) {
  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-badge-accent text-badge-accent-foreground">
        <MapIcon aria-hidden="true" className="size-6" />
      </span>
      <span className="flex items-center gap-1 font-medium text-primary group-hover:underline group-hover:underline-offset-4">
        Buka lokasi di Google Maps
        <ArrowUpRightIcon aria-hidden="true" className="size-4" />
      </span>
      <span className="text-sm text-muted-foreground">Terbuka di tab baru</span>
    </a>
  );
}
