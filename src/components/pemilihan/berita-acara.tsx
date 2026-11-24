"use client";

import { PrinterIcon } from "lucide-react";
import Link from "next/link";

import { DokumenCetak } from "@/components/shared/dokumen-cetak";
import { Button } from "@/components/ui/button";
import { formatTimestampLong } from "@/lib/dates";
import type { Pencatat, PemilihanRow } from "@/lib/pemilihan/admin-types";
import { formatPersen } from "@/lib/pemilihan/tampilan";
import { isSeri, type HasilKandidat, type HasilPartisipasi, type Kontes } from "@/lib/pemilihan/types";

function waktu(value: string | null): string {
  return value ? formatTimestampLong(value) : "—";
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="w-1/2 py-1.5 pr-4 text-left align-top font-normal">
        {label}
      </th>
      <td className="py-1.5 align-top">{children}</td>
    </tr>
  );
}

type Props = {
  row: PemilihanRow;
  pencatat: Pencatat;
  partisipasi: HasilPartisipasi;
  suara: HasilKandidat[];
  kontes: Kontes[];
};

/** The document itself, shared by the screen and the print copy. Plain markup that prints well. */
function Isi({ row, pencatat, partisipasi, suara, kontes }: Props) {
  return (
    <div className="flex flex-col gap-6 text-sm">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-semibold uppercase">Berita Acara Pemilihan</h1>
        <p className="text-base font-medium">{row.nama}</p>
        {row.periode && <p>Periode {row.periode}</p>}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Pelaksanaan</h2>
        <table className="w-full">
          <tbody>
            <Baris label="Jadwal dibuka">{waktu(row.dibukaPada)}</Baris>
            <Baris label="Jadwal ditutup">{waktu(row.ditutupPada)}</Baris>
            <Baris label="Dibuka">
              {waktu(row.waktuDibuka)}
              {pencatat.dibukaOleh ? `, oleh ${pencatat.dibukaOleh}` : ""}
            </Baris>
            <Baris label="Ditutup">{waktu(row.waktuDitutup)}</Baris>
            <Baris label="Panitia yang menutup">{pencatat.ditutupOleh ?? "—"}</Baris>
            {row.waktuDiumumkan && (
              <Baris label="Diumumkan">
                {waktu(row.waktuDiumumkan)}
                {pencatat.diumumkanOleh ? `, oleh ${pencatat.diumumkanOleh}` : ""}
              </Baris>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Partisipasi</h2>
        <table className="w-full">
          <tbody>
            <Baris label="Total pemilih">{partisipasi.totalPemilih}</Baris>
            <Baris label="Sudah memberikan suara">
              {partisipasi.sudahMemilih} ({formatPersen(partisipasi.persen)})
            </Baris>
            <Baris label="Mandiri (Portal Jemaat)">{partisipasi.mandiri}</Baris>
            <Baris label="Dibantu panitia">{partisipasi.dibantu}</Baris>
            <Baris label="Tidak memberikan suara">{partisipasi.totalPemilih - partisipasi.sudahMemilih}</Baris>
          </tbody>
        </table>
        {partisipasi.dibantuPerPanitia.length > 0 && (
          <>
            <h3 className="mt-2 font-medium">Suara dibantu per panitia</h3>
            <table className="w-full">
              <tbody>
                {partisipasi.dibantuPerPanitia.map((p) => (
                  <Baris key={p.userId} label={p.nama ?? "(akun sudah dihapus)"}>
                    {p.jumlah}
                  </Baris>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Perolehan Suara</h2>
        {kontes.map((k) => {
          const hasil = suara.filter((s) => s.kontes === k.kode);
          return (
            <div key={k.kode} className="flex break-inside-avoid-page flex-col gap-1">
              <h3 className="font-medium">{k.nama}</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="w-24 py-1 pr-2 text-right font-medium">
                      Peringkat
                    </th>
                    <th scope="col" className="py-1 text-left font-medium">
                      Nama
                    </th>
                    <th scope="col" className="w-28 py-1 text-right font-medium">
                      Jumlah Suara
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.map((h) => (
                    <tr key={`${h.kontes}:${h.jemaatId ?? h.namaTampilan}`} className="border-b last:border-b-0">
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {h.peringkat}
                        {isSeri(hasil, h) ? " (Seri)" : ""}
                      </td>
                      <td className="py-1">{h.namaTampilan}</td>
                      <td className="py-1 text-right tabular-nums">{h.jumlahSuara}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <footer className="flex break-inside-avoid flex-col items-end gap-16 pt-8">
        <span>Panitia Pemilihan</span>
        <span>(............................................)</span>
      </footer>
    </div>
  );
}

/**
 * Berita acara (brief §18.4–18.5, after close): the election, its schedule
 * and actual open/close times, the panitia who closed it, voters and turnout
 * (mandiri / dibantu), assisted votes per panitia, and the ranking per
 * contest. Every figure comes from hasil_partisipasi / hasil_suara, the
 * same as the live page and the CSV. "Cetak" prints only the document.
 */
export function BeritaAcara(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href={`/admin/pemilihan/${props.row.id}/hasil`} className="hover:underline">
            Hasil {props.row.nama}
          </Link>{" "}
          / Berita Acara
        </nav>
        <Button type="button" onClick={() => window.print()}>
          <PrinterIcon aria-hidden />
          Cetak
        </Button>
      </div>

      <article className="mx-auto w-full max-w-3xl rounded-xl border bg-card p-6">
        <Isi {...props} />
      </article>

      <DokumenCetak>
        <Isi {...props} />
      </DokumenCetak>
    </div>
  );
}
