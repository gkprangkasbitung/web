"use client";

import { useRouter } from "next/navigation";

import { TransactionsTable } from "@/components/sarana-dana/transactions-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateLong, type DateRange } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { PERSEMBAHAN_BULANAN_KEY } from "@/lib/sarana-dana";
import type { WartaFinanceItem } from "@/lib/sarana-dana-routes";

import { WartaSection } from "./warta-section";

function Figures({ report }: { report: WartaFinanceItem["report"] }) {
  const figures = [
    ["Saldo Awal", report.saldoAwal],
    ["Pemasukan", report.pemasukan],
    ["Pengeluaran", report.pengeluaran],
    ["Saldo Akhir", report.saldoAkhir],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 rounded-lg border p-3">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-mono text-base font-semibold tabular-nums">{formatRupiah(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Section 4, "Bidang Sarana dan Dana" (brief §9.4): the finance week, one
 * tab per item. The four figures come straight from the core report
 * function; the transactions are the ledger's own rows (same table, same
 * routes), so they sync both ways.
 */
export function WartaFinanceSection({
  range,
  items,
  peopleOptions,
  canWrite,
}: {
  range: DateRange;
  items: WartaFinanceItem[];
  peopleOptions: readonly PersonOptionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();

  return (
    <WartaSection
      title="Bidang Sarana dan Dana"
      description={`${formatDateLong(range.start)} – ${formatDateLong(range.end)} (Minggu-Sabtu sebelum tanggal kebaktian)`}
    >
      {items.length > 0 && (
        <Tabs defaultValue={items[0]!.key}>
          <div className="max-w-full overflow-x-auto">
            <TabsList>
              {items.map((item) => (
                <TabsTrigger key={item.key} value={item.key} className="px-3">
                  {item.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {items.map((item) => (
            <TabsContent key={item.key} value={item.key} className="flex flex-col gap-4 pt-2">
              <Figures report={item.report} />
              <TransactionsTable
                rows={item.rows}
                itemId={item.id}
                isPersembahanBulanan={item.key === PERSEMBAHAN_BULANAN_KEY}
                peopleOptions={peopleOptions}
                canWrite={canWrite}
                onChanged={() => router.refresh()}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </WartaSection>
  );
}
