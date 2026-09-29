"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { SearchInput } from "@/components/data-table/search-input";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong } from "@/lib/dates";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { formatJam, layoutFor, type PeribadahanField, type PeribadahanLayout } from "@/lib/peribadahan";
import type { PeribadahanCategoryOption, PeribadahanItemRow, SmkaKelompokRow } from "@/lib/peribadahan-routes";

import { EditJadwalDialog } from "./edit-jadwal-dialog";
import { JadwalDialog } from "./jadwal-dialog";

export type PeribadahanScope = { type: "all" } | { type: "category"; key: string; name: string };

const helper = createDataTableColumnHelper<PeribadahanItemRow>();

function dash(value: string | null): React.ReactNode {
  return value || <span className="text-muted-foreground">—</span>;
}

const TANGGAL_COLUMN = helper.accessor("tanggal", {
  header: "Tanggal",
  enableSorting: true,
  filterFn: "inDateRange",
  meta: { numeric: true },
  cell: ({ getValue }) => formatDateLong(getValue()),
});

const WAKTU_COLUMN = helper.accessor("jam", {
  id: "jam",
  header: "Waktu",
  enableSorting: true,
  meta: { numeric: true },
  cell: ({ getValue }) => dash(formatJam(getValue()) || null),
});

/** `/admin/peribadahan`: Ringkasan merges Tempat/Wilayah/Tema/DPA; the facets stay on hidden columns feeding off the raw values (brief §9.5). */
function buildAllColumns(): DataTableColumnDef<PeribadahanItemRow>[] {
  return [
    TANGGAL_COLUMN,
    WAKTU_COLUMN,
    helper.accessor("categoryName", {
      id: "categoryName",
      header: "Jenis",
      meta: { search: true },
    }),
    helper.accessor((row) => [row.tempatNama, row.wilayahNama, row.tema, row.dpa].filter(Boolean).join(" · "), {
      id: "ringkasan",
      header: "Ringkasan",
      meta: { search: true },
      cell: ({ getValue }) => dash(getValue() || null),
    }),
    helper.accessor("tempatNama", {
      id: "tempatNama",
      header: "Tempat",
      meta: { facet: { emptyLabel: "Tanpa Tempat" }, facetOnly: true },
    }),
    helper.accessor("wilayahNama", {
      id: "wilayahNama",
      header: "Wilayah",
      meta: { facet: { emptyLabel: "Tanpa Wilayah" }, facetOnly: true },
    }),
  ];
}

function buildFieldColumn(field: PeribadahanField, layout: PeribadahanLayout): DataTableColumnDef<PeribadahanItemRow> {
  switch (field) {
    case "tempat":
      return helper.accessor("tempatNama", {
        id: "tempatNama",
        header: "Tempat",
        meta: { search: true, facet: { emptyLabel: "Tanpa Tempat" } },
        cell: ({ getValue }) => dash(getValue()),
      });
    case "wilayah":
      return helper.accessor("wilayahNama", {
        id: "wilayahNama",
        header: "Wilayah",
        meta: { search: true, facet: { emptyLabel: "Tanpa Wilayah" } },
        cell: ({ getValue }) => dash(getValue()),
      });
    case "dpa":
      return helper.accessor("dpa", { header: "DPA", meta: { search: true }, cell: ({ getValue }) => dash(getValue()) });
    case "tema":
      return helper.accessor("tema", { header: "Tema", meta: { search: true }, cell: ({ getValue }) => dash(getValue()) });
    case "pelayanFirman":
      return helper.accessor("pelayanFirmanNama", {
        id: "pelayanFirmanNama",
        header: "Pelayan Firman",
        meta: { search: true },
        cell: ({ getValue }) => dash(getValue()),
      });
    case "liturgos":
      return helper.accessor("liturgosNama", {
        id: "liturgosNama",
        header: layout.liturgosLabel,
        meta: { search: true },
        cell: ({ getValue }) => dash(getValue()),
      });
    case "pemusik":
      return helper.accessor("pemusikNama", {
        id: "pemusikNama",
        header: "Pemusik",
        meta: { search: true },
        cell: ({ getValue }) => dash(getValue()),
      });
    case "bahanAlkitab":
      return helper.accessor("bahanAlkitab", {
        id: "bahanAlkitab",
        header: "Bahan Alkitab",
        meta: { search: true },
        cell: ({ getValue }) => dash(getValue()),
      });
    default:
      // "waktu" and "smkaGrid" are handled outside the per-field column loop.
      return WAKTU_COLUMN;
  }
}

/** `/admin/peribadahan/[key]`: columns follow the category's own layout, in the brief's own order. */
function buildCategoryColumns(key: string): DataTableColumnDef<PeribadahanItemRow>[] {
  const layout = layoutFor(key);
  const fieldColumns = layout.fields.filter((field) => field !== "waktu" && field !== "smkaGrid").map((field) => buildFieldColumn(field, layout));
  return [TANGGAL_COLUMN, WAKTU_COLUMN, ...fieldColumns];
}

export function PeribadahanManager({
  scope,
  rows,
  categories,
  tempatOptions,
  wilayahOptions,
  peopleOptions,
  smkaGroups,
  canWrite,
  initialSearch,
}: {
  scope: PeribadahanScope;
  rows: PeribadahanItemRow[];
  categories: readonly PeribadahanCategoryOption[];
  tempatOptions: readonly { id: string; nama: string }[];
  wilayahOptions: readonly { id: string; nama: string }[];
  peopleOptions: readonly PersonOptionRow[];
  smkaGroups: Map<string, SmkaKelompokRow[]>;
  canWrite: boolean;
  /** Current `?q=`; only meaningful for scope "all" (brief §9.5's server-side search). */
  initialSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const columns = useMemo(
    () => (scope.type === "all" ? buildAllColumns() : buildCategoryColumns(scope.key)),
    [scope],
  );
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });
  const tanggalColumn = table.table.getColumn("tanggal");

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

  function updateSearch(value: string) {
    const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
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

  const title = scope.type === "all" ? "Peribadahan" : scope.name;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} actions={addAction} />

      <DataTable
        table={table}
        label={title}
        noun="jadwal"
        canWrite={canWrite}
        addAction={addAction}
        toolbar={
          scope.type === "all" ? (
            <>
              <div className="relative w-full sm:w-64">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <SearchInput
                  aria-label="Cari tema/DPA/catatan"
                  placeholder="Cari tema/DPA/catatan..."
                  value={initialSearch ?? ""}
                  onValueChange={updateSearch}
                  debounceMs={300}
                  className="pl-8"
                />
              </div>
              <DateRangeFilter
                label="Rentang tanggal"
                value={(tanggalColumn?.getFilterValue() as DateRangeValue | undefined) ?? {}}
                onValueChange={(value) => tanggalColumn?.setFilterValue(value.start || value.end ? value : undefined)}
              />
            </>
          ) : undefined
        }
        rowActions={{
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
        }}
      />

      <JadwalDialog
        key={addKey}
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        fixedCategoryKey={scope.type === "category" ? scope.key : undefined}
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
    </div>
  );
}
