import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireJemaat } from "@/lib/auth/session";
import { formatDateShort, today } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { loadPengaturanPortal, loadPersembahanSaya, PortalError } from "@/lib/portal/data";
import type { PersembahanSaya } from "@/lib/portal/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Persembahan Saya" };

type Props = { searchParams: Promise<{ tahun?: string }> };

const YEARS_BACK = 100;

function parseTahun(raw: string | undefined, currentYear: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isInteger(parsed) || parsed < currentYear - YEARS_BACK || parsed > currentYear) return currentYear;
  return parsed;
}

const navClass =
  "flex size-12 shrink-0 items-center justify-center rounded-lg border border-border outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Persembahan Saya (brief §17.1, §17.3): only exists while Profil Gereja's
 * `portal_tampilkan_persembahan` setting is on — a direct visit while it's
 * off 404s, the same guard the nav already uses to hide the link.
 */
export default async function PersembahanPage({ searchParams }: Props) {
  await requireJemaat();
  const supabase = await createClient();

  const pengaturan = await loadPengaturanPortal(supabase).catch((error: unknown) => {
    console.error("[/jemaat/persembahan] pengaturan_portal failed:", error);
    return { tampilkanPersembahan: false };
  });
  if (!pengaturan.tampilkanPersembahan) notFound();

  const currentYear = Number(today().slice(0, 4));
  const { tahun: raw } = await searchParams;
  const tahun = parseTahun(raw, currentYear);

  let rows: PersembahanSaya[] = [];
  let error: string | null = null;
  try {
    rows = await loadPersembahanSaya(supabase, tahun);
  } catch (loadError) {
    error = loadError instanceof PortalError ? loadError.message : "Terjadi kesalahan di server. Coba lagi.";
  }
  const total = rows.reduce((sum, row) => sum + row.jumlah, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl font-normal tracking-tight">Persembahan Saya</h1>
        <p className="text-sm text-muted-foreground">Persembahan Bulanan atas nama Anda.</p>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link href={`/jemaat/persembahan?tahun=${tahun - 1}`} aria-label="Tahun sebelumnya" className={navClass}>
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </Link>
        <span className="min-w-20 text-center font-mono text-lg font-medium tabular-nums">{tahun}</span>
        {tahun < currentYear ? (
          <Link href={`/jemaat/persembahan?tahun=${tahun + 1}`} aria-label="Tahun berikutnya" className={navClass}>
            <ChevronRightIcon aria-hidden="true" className="size-5" />
          </Link>
        ) : (
          <span aria-hidden="true" className={`${navClass} border-transparent text-muted-foreground/40`}>
            <ChevronRightIcon className="size-5" />
          </span>
        )}
      </div>

      {error ? (
        <p className="text-center text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">Belum ada data persembahan untuk tahun {tahun}.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Tanggal
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Jumlah
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="px-4 py-3">{formatDateShort(row.tanggal)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatRupiah(row.jumlah)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/30 font-medium">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{formatRupiah(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
