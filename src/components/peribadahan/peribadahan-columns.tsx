import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { formatDateLong } from "@/lib/dates";
import { formatJam, layoutFor, type PeribadahanField, type PeribadahanLayout } from "@/lib/peribadahan";
import type { PeribadahanItemRow } from "@/lib/peribadahan-routes";

const helper = createDataTableColumnHelper<PeribadahanItemRow>();

function dash(value: string | null): React.ReactNode {
  return value || <span className="text-muted-foreground">—</span>;
}

function ringkasan(row: PeribadahanItemRow): string {
  return [row.tempatNama, row.wilayahNama, row.tema, row.dpa].filter(Boolean).join(" · ");
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
export function buildAllColumns(): DataTableColumnDef<PeribadahanItemRow>[] {
  return [
    TANGGAL_COLUMN,
    WAKTU_COLUMN,
    helper.accessor("categoryName", {
      id: "categoryName",
      header: "Jenis",
      meta: { search: true },
    }),
    helper.accessor(ringkasan, {
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

/**
 * A warta's Bidang Peribadahan (brief §9.4): "a plain paginated list is
 * enough; no sorting needed". Rows arrive ordered by date then sort_order.
 */
export function buildWeekColumns(): DataTableColumnDef<PeribadahanItemRow>[] {
  return [
    helper.accessor("tanggal", {
      header: "Tanggal",
      meta: { numeric: true },
      cell: ({ getValue }) => formatDateLong(getValue()),
    }),
    helper.accessor("jam", {
      id: "jam",
      header: "Waktu",
      meta: { numeric: true },
      cell: ({ getValue }) => dash(formatJam(getValue()) || null),
    }),
    helper.accessor("categoryName", { id: "categoryName", header: "Jenis" }),
    helper.accessor(ringkasan, {
      id: "ringkasan",
      header: "Ringkasan",
      cell: ({ getValue }) => dash(getValue() || null),
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
export function buildCategoryColumns(key: string): DataTableColumnDef<PeribadahanItemRow>[] {
  const layout = layoutFor(key);
  const fieldColumns = layout.fields
    .filter((field) => field !== "waktu" && field !== "smkaGrid")
    .map((field) => buildFieldColumn(field, layout));
  return [TANGGAL_COLUMN, WAKTU_COLUMN, ...fieldColumns];
}
