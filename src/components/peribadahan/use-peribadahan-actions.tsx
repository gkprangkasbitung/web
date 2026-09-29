"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { RowActionsConfig } from "@/components/data-table/row-actions";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong, type IsoDate } from "@/lib/dates";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import type { PeribadahanCategoryOption, PeribadahanItemRow, SmkaKelompokRow } from "@/lib/peribadahan-routes";

import { EditJadwalDialog } from "./edit-jadwal-dialog";
import { JadwalDialog } from "./jadwal-dialog";

export type PeribadahanActionsOptions = {
  categories: readonly PeribadahanCategoryOption[];
  /** Hides Jenis in "Tambah Jadwal" (a category-scoped page). */
  fixedCategoryKey?: string;
  tempatOptions: readonly { id: string; nama: string }[];
  wilayahOptions: readonly { id: string; nama: string }[];
  peopleOptions: readonly PersonOptionRow[];
  smkaGroups: Map<string, SmkaKelompokRow[]>;
  canWrite: boolean;
  /** "Tambah Jadwal" defaults and inclusive bounds; a warta passes its service week (brief §9.4, §12.5). */
  defaultDate?: IsoDate;
  minDate?: IsoDate;
  maxDate?: IsoDate;
};

/**
 * The add / edit / delete wiring every schedule list shares (brief §9.5):
 * the "Tambah Jadwal" button, the row actions, and both dialogs. The
 * Peribadahan pages and a warta's Bidang Peribadahan each lay these out in
 * their own container, on the same rows and the same API routes.
 */
export function usePeribadahanActions({
  categories,
  fixedCategoryKey,
  tempatOptions,
  wilayahOptions,
  peopleOptions,
  smkaGroups,
  canWrite,
  defaultDate,
  minDate,
  maxDate,
}: PeribadahanActionsOptions) {
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  // Bumped on every "Tambah Jadwal" click so JadwalDialog remounts with fresh defaults.
  const [addKey, setAddKey] = useState(0);
  const [editRow, setEditRow] = useState<PeribadahanItemRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function remove(row: PeribadahanItemRow) {
    try {
      await apiFetch(`/api/admin/peribadahan/${row.id}`, { method: "DELETE" });
      toast.success("Jadwal dihapus");
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addAction = canWrite ? (
    <Button
      onClick={() => {
        setAddKey((key) => key + 1);
        setAddOpen(true);
      }}
    >
      <PlusIcon aria-hidden />
      Tambah Jadwal
    </Button>
  ) : undefined;

  const rowActions: RowActionsConfig<PeribadahanItemRow> = {
    getRowLabel: (row) => `${row.categoryName} · ${formatDateLong(row.tanggal)}`,
    edit: {
      onSelect: (row) => {
        setEditRow(row);
        setEditOpen(true);
      },
    },
    delete: {
      title: (row) => `Hapus "${row.categoryName} · ${formatDateLong(row.tanggal)}"?`,
      onConfirm: remove,
    },
  };

  const dialogs = (
    <>
      <JadwalDialog
        key={addKey}
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        fixedCategoryKey={fixedCategoryKey}
        defaultDate={defaultDate}
        minDate={minDate}
        maxDate={maxDate}
        onCreated={refresh}
      />

      <EditJadwalDialog
        key={editRow?.id ?? "none"}
        row={editRow}
        smkaKelompok={editRow ? (smkaGroups.get(editRow.id) ?? []) : []}
        open={editOpen}
        onOpenChange={setEditOpen}
        readOnly={!canWrite}
        tempatOptions={tempatOptions}
        wilayahOptions={wilayahOptions}
        peopleOptions={peopleOptions}
        onSaved={refresh}
      />
    </>
  );

  return { addAction, rowActions, dialogs };
}
