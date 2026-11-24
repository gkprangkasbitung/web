import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LABEL_KATEGORI, type KategoriImpor } from "@/lib/pemilihan/impor";

export type BarisRingkas = { sumber: string; kelompokWilayah: string; kategori: KategoriImpor; beres: boolean };

const KATEGORI: KategoriImpor[] = ["cocok", "ambigu", "tidak_ditemukan", "error"];

type Hitungan = Record<KategoriImpor, number> & { total: number; belum: number };

function kosong(): Hitungan {
  return { cocok: 0, ambigu: 0, tidak_ditemukan: 0, error: 0, total: 0, belum: 0 };
}

function tambah(h: Hitungan, row: BarisRingkas) {
  h[row.kategori] += 1;
  h.total += 1;
  if (!row.beres) h.belum += 1;
}

/** Per sheet and in total: Cocok, Ambigu, Tidak ditemukan, Error validasi, and what is still unresolved (brief §18.4). */
export function RingkasanLembar({ rows, caption }: { rows: readonly BarisRingkas[]; caption: string }) {
  const perLembar = new Map<string, { kelompok: string; h: Hitungan }>();
  const total = kosong();
  for (const row of rows) {
    const entry = perLembar.get(row.sumber) ?? { kelompok: row.kelompokWilayah, h: kosong() };
    tambah(entry.h, row);
    perLembar.set(row.sumber, entry);
    tambah(total, row);
  }

  const cells = (h: Hitungan) => (
    <>
      <TableCell className="text-right tabular-nums">{h.total}</TableCell>
      {KATEGORI.map((k) => (
        <TableCell key={k} className="text-right tabular-nums">
          {h[k]}
        </TableCell>
      ))}
      <TableCell className={h.belum > 0 ? "text-right font-semibold text-destructive tabular-nums" : "text-right tabular-nums"}>
        {h.belum}
      </TableCell>
    </>
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Sheet / kelompok</TableHead>
            <TableHead className="text-right">Baris</TableHead>
            {KATEGORI.map((k) => (
              <TableHead key={k} className="text-right">
                {LABEL_KATEGORI[k]}
              </TableHead>
            ))}
            <TableHead className="text-right">Belum beres</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...perLembar.entries()].map(([sumber, { kelompok, h }]) => (
            <TableRow key={sumber}>
              <TableCell>
                <span className="font-medium">{kelompok}</span>
                <span className="block text-xs text-muted-foreground">{sumber}</span>
              </TableCell>
              {cells(h)}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            {cells(total)}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
