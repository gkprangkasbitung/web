"use client";

import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DateRangeFilter, type DateRangeValue } from "@/components/shared/date-range-filter";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import { ledgerRangeParam, PERSEMBAHAN_BULANAN_KEY } from "@/lib/sarana-dana";
import type { SaranaDanaLedger } from "@/lib/sarana-dana-routes";

import { TransactionsTable } from "./transactions-table";

/** `/admin/sarana-dana/[key]` (brief §9.7): "Saldo Saat Ini", inline "Saldo Awal", and the transactions table. */
export function SaranaDanaLedgerManager({
  item,
  rows,
  peopleOptions,
  canWrite,
  initialRange,
}: {
  item: SaranaDanaLedger["item"];
  rows: SaranaDanaLedger["rows"];
  peopleOptions: readonly PersonOptionRow[];
  canWrite: boolean;
  initialRange: DateRangeValue;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [saldoAwal, setSaldoAwal] = useState<number | null>(item.saldoAwal);
  const [savingSaldoAwal, setSavingSaldoAwal] = useState(false);

  function updateRange(value: DateRangeValue) {
    const param = ledgerRangeParam(value);
    const query = param ? `?tanggal=${encodeURIComponent(param)}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }

  async function saveSaldoAwal() {
    if (saldoAwal === null) {
      toast.error("Saldo awal wajib diisi.");
      return;
    }
    setSavingSaldoAwal(true);
    try {
      await apiFetch(`/api/admin/sarana-dana/${item.id}`, { method: "PATCH", body: { saldoAwal } });
      toast.success("Saldo awal diperbarui");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingSaldoAwal(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.name} description={`Saldo Saat Ini: ${formatRupiah(item.saldo)}`} />

      {canWrite && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="saldo-awal">Saldo Awal</Label>
            <MoneyInput
              id="saldo-awal"
              value={saldoAwal}
              onValueChange={setSaldoAwal}
              disabled={savingSaldoAwal}
              className="w-48"
            />
          </div>
          <Button onClick={saveSaldoAwal} disabled={savingSaldoAwal}>
            {savingSaldoAwal && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Simpan
          </Button>
        </div>
      )}

      <TransactionsTable
        rows={rows}
        itemKey={item.key}
        isPersembahanBulanan={item.key === PERSEMBAHAN_BULANAN_KEY}
        peopleOptions={peopleOptions}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
        toolbar={<DateRangeFilter label="Rentang tanggal" value={initialRange} onValueChange={updateRange} />}
      />
    </div>
  );
}
