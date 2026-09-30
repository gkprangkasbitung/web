import { MapIcon } from "lucide-react";

/** Stands in for the Google Maps embed (brief §D, §11 "peta ... tahap 11 akan mengisinya"). */
export function MapPlaceholder({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Peta lokasi — akan ditambahkan pada tahap 11"
      className={`flex min-h-80 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-muted p-6 text-center text-sm text-muted-foreground ${className ?? ""}`}
    >
      <MapIcon aria-hidden="true" className="size-6" />
      <span>Peta lokasi — akan ditambahkan pada tahap 11</span>
    </div>
  );
}
