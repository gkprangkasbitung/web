"use client";

import { DownloadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { CONTOH_COLUMNS } from "@/components/data-table/testing/columns";
import { CONTOH_JEMAAT, type ContohJemaat } from "@/components/data-table/testing/fixtures";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useUrlTableState } from "@/components/data-table/use-url-table-state";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { MoneyInput } from "@/components/shared/money-input";
import { PhoneInput } from "@/components/shared/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MODULE_LABELS, ACTIVITY_MODULES, moduleLabel } from "@/lib/activity-modules";
import { formatTimestamp } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

import { CONTOH_LOG_CONFIG, type ContohLog } from "./contoh-log";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Toggle({ pressed, onPressedChange, children }: { pressed: boolean; onPressedChange: (next: boolean) => void; children: React.ReactNode }) {
  return (
    <Button variant={pressed ? "secondary" : "outline"} aria-pressed={pressed} onClick={() => onPressedChange(!pressed)}>
      {children}
    </Button>
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ClientTableDemo() {
  const [data, setData] = useState<ContohJemaat[]>(CONTOH_JEMAAT);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failDelete, setFailDelete] = useState(false);
  const table = useDataTable({ data, columns: CONTOH_COLUMNS, getRowId: (row) => row.id, searchColumns: ["nama", "keluarga"] });

  const addAction = (
    <Button onClick={() => toast.info("Contoh: dialog Tambah Jemaat dibuka.")}>
      <PlusIcon aria-hidden />
      Tambah Jemaat
    </Button>
  );

  return (
    <Section
      title="Mode client"
      description="Semua baris dimuat; sort, filter, dan pagination berjalan di browser. 57 baris jemaat fiktif."
    >
      <div className="flex flex-wrap gap-2">
        <Toggle pressed={readOnly} onPressedChange={setReadOnly}>
          Mode read-only
        </Toggle>
        <Toggle pressed={loading} onPressedChange={setLoading}>
          Tampilkan loading
        </Toggle>
        <Toggle pressed={failDelete} onPressedChange={setFailDelete}>
          Hapus gagal
        </Toggle>
        <Button variant="outline" onClick={() => setData((rows) => (rows.length ? [] : CONTOH_JEMAAT))}>
          {data.length ? "Kosongkan data" : "Pulihkan data"}
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.success(`Ekspor CSV: ${table.filteredRows.length} baris (semua hasil filter).`)}
        >
          <DownloadIcon aria-hidden />
          Ekspor CSV
        </Button>
        {!readOnly && addAction}
      </div>
      <DataTable
        table={table}
        label="Contoh Jemaat"
        noun="jemaat"
        canWrite={!readOnly}
        addAction={addAction}
        searchPlaceholder="Cari nama atau keluarga..."
        isLoading={loading}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => toast.info(`Contoh: membuka ${row.nama}.`) },
          extra: [
            { label: "Lihat Persembahan", onSelect: (row) => toast.info(`${row.nama}: ${row.persembahan === null ? "—" : formatRupiah(row.persembahan)}`) },
          ],
          delete: {
            title: (row) => `Hapus ${row.nama}?`,
            description: () => "Catatan pastoral milik jemaat ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
            onConfirm: async (row) => {
              await sleep(800);
              if (failDelete) {
                toast.error("Gagal menghapus (simulasi).");
                throw new Error("simulasi");
              }
              setData((rows) => rows.filter((item) => item.id !== row.id));
              toast.success(`${row.nama} dihapus.`);
            },
          },
        }}
      />
    </Section>
  );
}

const logHelper = createDataTableColumnHelper<ContohLog>();
const MODULE_OPTIONS = ACTIVITY_MODULES.map((value) => ({ value, label: MODULE_LABELS[value] }));

const LOG_COLUMNS = logHelper.columns([
  logHelper.accessor("created_at", {
    header: "Waktu",
    enableSorting: true,
    meta: { numeric: true },
    cell: ({ getValue }) => formatTimestamp(getValue()),
  }),
  logHelper.accessor("user_email", { header: "Pengguna" }),
  logHelper.accessor("module", {
    header: "Modul",
    enableSorting: true,
    meta: { facet: { options: MODULE_OPTIONS, multiple: false } },
    cell: ({ getValue }) => <Badge>{moduleLabel(getValue())}</Badge>,
  }),
  logHelper.accessor("activity", { header: "Aktivitas", meta: { className: "min-w-64 whitespace-normal" } }),
  logHelper.accessor("ip_address", { header: "IP", meta: { mono: true } }),
]);

export function ServerTableDemo({ rows, total }: { rows: ContohLog[]; total: number }) {
  const url = useUrlTableState(CONTOH_LOG_CONFIG);
  const table = useDataTable({
    data: rows,
    columns: LOG_COLUMNS,
    getRowId: (row) => row.id,
    server: { ...url, rowCount: total },
  });
  const waktu = table.table.getColumn("created_at");

  return (
    <Section
      title="Mode server"
      description="Seperti Log Aktivitas: sort, filter, dan pagination dikirim lewat URL search params, lalu server mengembalikan satu halaman."
    >
      <DataTable
        table={table}
        label="Contoh Log Aktivitas"
        noun="aktivitas"
        canWrite={false}
        searchPlaceholder="Cari aktivitas atau email..."
        toolbar={
          <DateRangeFilter
            label="Rentang waktu"
            value={(waktu?.getFilterValue() as DateRangeValue | undefined) ?? {}}
            onValueChange={(value) => waktu?.setFilterValue(value.start || value.end ? value : undefined)}
          />
        }
      />
    </Section>
  );
}

export function InputsDemo() {
  const [amount, setAmount] = useState<number | null>(1_500_000);
  const [phone, setPhone] = useState("");
  const [range, setRange] = useState<DateRangeValue>({});

  return (
    <Section title="Input" description="MoneyInput, PhoneInput, dan DateRangeFilter dengan nilai yang tersimpan.">
      <div className="grid max-w-xl gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contoh-jumlah">Jumlah</Label>
          <MoneyInput id="contoh-jumlah" value={amount} onValueChange={setAmount} />
          <p className="font-mono text-xs text-muted-foreground">value = {JSON.stringify(amount)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contoh-hp">Nomor HP/WA</Label>
          <PhoneInput id="contoh-hp" value={phone} onValueChange={setPhone} placeholder="08…" />
          <p className="font-mono text-xs text-muted-foreground">value = {JSON.stringify(phone)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Rentang tanggal</span>
          <DateRangeFilter value={range} onValueChange={setRange} />
          <p className="font-mono text-xs text-muted-foreground">value = {JSON.stringify(range)}</p>
        </div>
      </div>
    </Section>
  );
}
