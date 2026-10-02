import type { Metadata } from "next";
import Link from "next/link";

import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { formatDateLong } from "@/lib/dates";
import { loadPublicWartaList } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Warta",
  description: "Warta jemaat GKP Rangkasbitung yang sudah diterbitkan.",
};

/** Brief §8: published warta only, newest tanggal kebaktian first. */
export default async function WartaListPage() {
  const result = await loadPublicWartaList();
  if (result.error !== null) throw new Error("Failed to load the warta list.");

  return (
    <>
      <PublicPageTitleBand
        breadcrumb="Beranda / Warta"
        title="Warta"
        description="Warta jemaat mingguan GKP Rangkasbitung."
      />

      <PublicContainer narrow>
      {result.data.length === 0 ? (
        <p className="text-muted-foreground">Belum ada warta yang diterbitkan.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {result.data.map((warta) => (
            <li key={warta.slug}>
              <Link
                href={`/warta/${warta.slug}`}
                className="group flex flex-col gap-1 rounded-lg py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <time dateTime={warta.tanggalKebaktian} className="text-sm text-muted-foreground">
                  {formatDateLong(warta.tanggalKebaktian)}
                </time>
                <span className="text-lg font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">
                  {warta.judulKebaktian}
                </span>
                {warta.temaKebaktian && <span className="text-muted-foreground">{warta.temaKebaktian}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      </PublicContainer>
    </>
  );
}
