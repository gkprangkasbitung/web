import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicContainer } from "@/components/public/public-shell";
import { WartaPublicView } from "@/components/public/warta-public-view";
import { formatDateLong } from "@/lib/dates";
import { loadPublicWarta } from "@/lib/public-site";

type Props = { params: Promise<{ slug: string }> };

/** Title = judul kebaktian, description = tema (or the date without one). A draft or unknown slug 404s here too. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const warta = await loadPublicWarta(slug);
  if (!warta) notFound();
  return {
    title: warta.judulKebaktian,
    description: warta.temaKebaktian?.trim() || formatDateLong(warta.tanggalKebaktian),
  };
}

/** Brief §8: published warta only; anything else is a 404. Rendered per request (see `public-site.ts`). */
export default async function WartaPage({ params }: Props) {
  const { slug } = await params;
  const warta = await loadPublicWarta(slug);
  if (!warta) notFound();

  return (
    <PublicContainer>
      <WartaPublicView warta={warta} />
    </PublicContainer>
  );
}
