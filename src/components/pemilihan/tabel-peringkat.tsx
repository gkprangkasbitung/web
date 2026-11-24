import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isSeri, type HasilKandidat } from "@/lib/pemilihan/types";

/**
 * One contest's ranking, as hasil_suara returns it (most votes first; equal
 * votes share a rank and are marked "Seri"). A fixed, printable ranking,
 * not a list to filter, so it is a plain table rather than the DataTable.
 */
export function TabelPeringkat({ judul, hasil }: { judul: string; hasil: readonly HasilKandidat[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label={judul}>
      <h3 className="text-base font-semibold">{judul}</h3>
      {hasil.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada calon.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-right">Peringkat</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="w-32 text-right">Jumlah Suara</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasil.map((row) => (
                <TableRow key={`${row.kontes}:${row.jemaatId ?? row.namaTampilan}`}>
                  <TableCell className="text-right tabular-nums">
                    {row.peringkat}
                    {isSeri(hasil, row) && (
                      <Badge variant="outline" className="ml-2">
                        Seri
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.namaTampilan}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.jumlahSuara}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
