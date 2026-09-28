"use client";

import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

import { createDataTableColumnHelper } from "../features";
import { CONTOH_STATUS_LABEL, CONTOH_STATUS_OPTIONS, type ContohJemaat, type ContohStatus } from "./fixtures";

const STATUS_VARIANT: Record<ContohStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  simpatisan: "outline-accent",
  baptis_anak: "accent",
  sidi: "neutral",
  anggota_penuh: "neutral",
};

const helper = createDataTableColumnHelper<ContohJemaat>();

/** Example column definitions: one of each kind the table pattern supports. */
export const CONTOH_COLUMNS = helper.columns([
  helper.accessor("nomorAnggota", { header: "No. Anggota", meta: { mono: true } }),
  helper.accessor("nama", {
    header: "Nama",
    enableSorting: true,
    meta: { search: true },
    cell: ({ getValue }) => (
      <span className="flex items-center gap-2">
        <InitialsAvatar name={getValue()} />
        <span className="font-medium">{getValue()}</span>
      </span>
    ),
  }),
  helper.accessor("keluarga", {
    header: "Keluarga",
    meta: { search: true },
    cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("wilayah", {
    header: "Wilayah",
    meta: { facet: {} },
    cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("status", {
    header: "Status",
    enableSorting: true,
    meta: { facet: { options: CONTOH_STATUS_OPTIONS } },
    // Sort by the label people read, not the stored key.
    sortFn: (a, b) =>
      CONTOH_STATUS_LABEL[a.original.status].localeCompare(CONTOH_STATUS_LABEL[b.original.status], "id"),
    cell: ({ getValue }) => <Badge variant={STATUS_VARIANT[getValue()]}>{CONTOH_STATUS_LABEL[getValue()]}</Badge>,
  }),
  helper.accessor("kontak", {
    header: "Kontak",
    meta: { search: true, mono: true },
    cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("tanggalMasuk", {
    header: "Tanggal Masuk",
    enableSorting: true,
    meta: { numeric: true },
    cell: ({ getValue }) => {
      const value = getValue();
      return value ? formatDateShort(value) : <span className="text-muted-foreground">—</span>;
    },
  }),
  helper.accessor("persembahan", {
    header: "Persembahan",
    enableSorting: true,
    meta: { numeric: true },
    cell: ({ getValue }) => {
      const value = getValue();
      return value === null ? <span className="text-muted-foreground">—</span> : formatRupiah(value);
    },
  }),
]);
