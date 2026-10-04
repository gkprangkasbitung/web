import type { Metadata } from "next";

import { KegiatanKalender } from "@/components/public/kegiatan-kalender";
import { PublicContainer, PublicPageTitleBand } from "@/components/public/public-shell";
import { isValidIsoMonth, monthOf, today } from "@/lib/dates";
import { loadKegiatanKalenderContent } from "@/lib/public/site-content";

export const metadata: Metadata = {
  title: "Kegiatan",
  description: "Kalender kegiatan jemaat, persekutuan, dan pelayanan GKP Rangkasbitung.",
};

type Props = { searchParams: Promise<{ bulan?: string }> };

/**
 * `/kegiatan?bulan=YYYY-MM` (brief §14.4). An invalid or missing `bulan`
 * falls back to the current month in Asia/Jakarta — never an error.
 */
export default async function KegiatanKalenderPage({ searchParams }: Props) {
  const { bulan: requested } = await searchParams;
  const todayIso = today();
  const bulan = requested && isValidIsoMonth(requested) ? requested : monthOf(todayIso);

  const result = await loadKegiatanKalenderContent(bulan);
  if (result.error !== null) throw new Error("Failed to load the kalender kegiatan.");

  return (
    <>
      <PublicPageTitleBand breadcrumb="Beranda / Kegiatan" title="Kalender Kegiatan" description="Kegiatan jemaat, persekutuan, dan pelayanan GKP Rangkasbitung." />

      <PublicContainer>
        <KegiatanKalender bulan={result.data.bulan} events={result.data.events} legend={result.data.legend} today={todayIso} />
      </PublicContainer>
    </>
  );
}
