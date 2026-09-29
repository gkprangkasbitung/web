import { isValidIsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

/** Shared constants for Sarana & Dana (brief §9.7). */

export const PERSEMBAHAN_BULANAN_KEY = "persembahan_bulanan";

export const TRANSACTION_TIPE = ["masuk", "keluar"] as const;
export type TransactionTipe = (typeof TRANSACTION_TIPE)[number];

export const TIPE_LABELS: Record<TransactionTipe, string> = {
  masuk: "Pemasukan",
  keluar: "Pengeluaran",
};

/** "Jumlah" with a +/- prefix (brief §9.7): the primary indicator, color is only a secondary cue. */
export function formatSignedJumlah(jumlah: number, tipe: TransactionTipe): string {
  const signed = tipe === "keluar" ? -jumlah : jumlah;
  return signed >= 0 ? `+${formatRupiah(signed)}` : formatRupiah(signed);
}

/** The ledger's `?tanggal=start~end` param (brief §9.7's server-side date-range filter). Either side may be absent. */
export function parseLedgerRangeParam(raw: string | undefined): { start?: string; end?: string } {
  if (!raw) return {};
  const [start, end] = raw.split("~");
  const range: { start?: string; end?: string } = {};
  if (start && isValidIsoDate(start)) range.start = start;
  if (end && isValidIsoDate(end)) range.end = end;
  return range;
}

export function ledgerRangeParam(value: { start?: string; end?: string }): string | null {
  if (!value.start && !value.end) return null;
  return `${value.start ?? ""}~${value.end ?? ""}`;
}
