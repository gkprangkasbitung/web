import { ImageIcon } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import { cn } from "cn";

import type { PublicPhoto } from "@/lib/public/site-content";

const RATIO_CLASS = {
  video: "aspect-video",
  portrait: "aspect-[4/5]",
  square: "aspect-square",
} as const;

/**
 * A photo with a required, informative fallback (brief §9c instruction B):
 * every module that would supply a real photo (Profil Gereja, Pelayanan
 * icons excluded, Majelis, Kegiatan) returns `null` until stage 11a/11b/14,
 * so this always renders the placeholder box for now. Never loads an
 * external domain — `photo.url` is only ever same-origin Supabase Storage,
 * wired up in stage 14 alongside `next.config.ts`'s `images.remotePatterns`.
 */
export function PublicImage({
  photo,
  ratio = "video",
  fallbackLabel,
  className,
  style,
}: {
  photo: PublicPhoto;
  ratio?: keyof typeof RATIO_CLASS;
  fallbackLabel: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (!photo) {
    return (
      <div
        role="img"
        aria-label={fallbackLabel}
        style={style}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-muted p-4 text-center text-sm text-muted-foreground",
          RATIO_CLASS[ratio],
          className,
        )}
      >
        <ImageIcon aria-hidden="true" className="size-6" />
        <span>{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <div style={style} className={cn("relative overflow-hidden rounded-2xl", RATIO_CLASS[ratio], className)}>
      <Image src={photo.url} alt={photo.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
    </div>
  );
}
