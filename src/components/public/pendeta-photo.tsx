import Image from "next/image";

import { InitialsAvatar } from "@/components/shared/initials-avatar";
import type { PendetaItem } from "@/lib/public/site-content";

/**
 * A pendeta's photo, falling back to an initials avatar (not `PublicImage`'s
 * dashed placeholder box) when there is none, per brief §14.7.
 */
export function PendetaPhoto({ item, className }: { item: Pick<PendetaItem, "nama" | "photo">; className?: string }) {
  if (item.photo) {
    return (
      <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
        <Image src={item.photo.url} alt={item.photo.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center rounded-2xl bg-muted ${className ?? ""}`}>
      <InitialsAvatar name={item.nama} className="size-16 text-xl" />
    </div>
  );
}
