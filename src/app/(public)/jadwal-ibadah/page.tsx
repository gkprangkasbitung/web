import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import {
  PlaceholderBlock,
  PublicContainer,
  PublicPageHeader,
  PublicSection,
} from "@/components/public/public-shell";
import { ScheduleList } from "@/components/public/schedule-list";
import { addDays, formatDateLong, today } from "@/lib/dates";
import { loadJadwalMendatang } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Jadwal Ibadah",
  description: "Jadwal ibadah GKP Rangkasbitung untuk tujuh hari ke depan.",
};

/**
 * Brief §8 (optional part): the coming 7 days from `public_jadwal_mendatang`
 * (0027), whose range is computed in the database with no date parameter,
 * and which returns people by name only. Above it, the regular weekly
 * services, still to be supplied by the church (§12.4).
 */
export default async function JadwalIbadahPage() {
  const schedule = await loadJadwalMendatang();
  // The same range the function computes (today .. + 6 in WIB), for the heading.
  const start = today();
  const end = addDays(start, 6);

  return (
    <PublicContainer narrow>
      <PublicPageHeader title="Jadwal Ibadah" description="Ibadah dan persekutuan di GKP Rangkasbitung." />

      <PublicSection id="jadwal-rutin" title="Jadwal rutin">
        {/* TODO(konten): the regular weekly services (day, time, place) as confirmed by the church. */}
        <PlaceholderBlock />
      </PublicSection>

      <PublicSection
        id="tujuh-hari"
        title="Tujuh hari ke depan"
        description={`${formatDateLong(start)} – ${formatDateLong(end)}`}
      >
        {schedule.error !== null ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Gagal memuat jadwal. Muat ulang halaman untuk mencoba lagi.
          </p>
        ) : (
          <ScheduleList rows={schedule.data} emptyText="Belum ada jadwal ibadah untuk tujuh hari ke depan." />
        )}
      </PublicSection>
    </PublicContainer>
  );
}
