"use client";

import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { buildWeekColumns } from "@/components/peribadahan/peribadahan-columns";
import { usePeribadahanActions } from "@/components/peribadahan/use-peribadahan-actions";
import { formatDateLong, type DateRange } from "@/lib/dates";
import type { PeribadahanOverview } from "@/lib/peribadahan-routes";
import type { PersonOptionRow } from "@/lib/jemaat-routes";

import { WartaSection } from "./warta-section";

/**
 * Section 2, "Bidang Peribadahan" (brief §9.4): the service week's rows of
 * the Peribadahan module itself — never a copy — with the same add, edit,
 * and delete. "Tambah Jadwal" takes any date inside the service week,
 * defaulting to the kebaktian date (§12.5).
 */
export function WartaPeribadahanSection({
  range,
  schedule,
  peopleOptions,
  canWrite,
}: {
  range: DateRange;
  schedule: PeribadahanOverview;
  peopleOptions: readonly PersonOptionRow[];
  canWrite: boolean;
}) {
  const columns = useMemo(() => buildWeekColumns(), []);
  const table = useDataTable({ data: schedule.rows, columns, getRowId: (row) => row.id });

  const { addAction, rowActions, dialogs } = usePeribadahanActions({
    categories: schedule.categories,
    tempatOptions: schedule.tempatOptions,
    wilayahOptions: schedule.wilayahOptions,
    peopleOptions,
    smkaGroups: schedule.smkaGroups,
    canWrite,
    defaultDate: range.start,
    minDate: range.start,
    maxDate: range.end,
  });

  return (
    <WartaSection
      title="Bidang Peribadahan"
      description={`${formatDateLong(range.start)} – ${formatDateLong(range.end)} (Minggu-Sabtu)`}
    >
      <DataTable
        table={table}
        label="Bidang Peribadahan"
        noun="jadwal"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={addAction}
        rowActions={rowActions}
      />
      {dialogs}
    </WartaSection>
  );
}
