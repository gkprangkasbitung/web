import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PemilihanRow } from "@/lib/pemilihan/admin-types";
import type { HasilKandidat, HasilPartisipasi, Kontes } from "@/lib/pemilihan/types";

import { BeritaAcara } from "./berita-acara";

const ROW: PemilihanRow = {
  id: "00000000-0000-4000-8000-000000000e01",
  nama: "Pemilihan Uji",
  periode: "2027–2031",
  status: "ditutup",
  dibukaPada: "2026-12-06T01:00:00.000Z",
  ditutupPada: "2026-12-06T10:00:00.000Z",
  tampilkanHasil: false,
  waktuDibuka: "2026-12-06T01:00:05.000Z",
  waktuDitutup: "2026-12-06T10:02:00.000Z",
  waktuDiumumkan: null,
  createdAt: "2026-11-20T01:00:00.000Z",
  totalPemilih: 40,
  sudahMemilih: 31,
  persen: 77.5,
  barisBelumBeres: 0,
};
const KONTES: Kontes[] = [
  { kode: "penatua", nama: "Penatua (Majelis Jemaat)", minPilih: 10, maxPilih: 30 },
  { kode: "ppj", nama: "PPJ (Pengawas Perbendaharaan Jemaat)", minPilih: 5, maxPilih: 15 },
];
const PARTISIPASI: HasilPartisipasi = {
  totalPemilih: 40,
  sudahMemilih: 31,
  persen: 77.5,
  mandiri: 25,
  dibantu: 6,
  dibantuPerPanitia: [
    { userId: "u1", nama: "Panitia Satu", jumlah: 4 },
    { userId: "u2", nama: null, jumlah: 2 },
  ],
};
const SUARA: HasilKandidat[] = [
  { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "a", namaTampilan: "Bpk. Adi", jumlahSuara: 28, peringkat: 1 },
  { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "b", namaTampilan: "Ibu Budi", jumlahSuara: 20, peringkat: 2 },
  { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "c", namaTampilan: "Sdr. Citra", jumlahSuara: 20, peringkat: 2 },
  { kontes: "ppj", kontesNama: KONTES[1]!.nama, jemaatId: "a", namaTampilan: "Bpk. Adi", jumlahSuara: 17, peringkat: 1 },
];

describe("BeritaAcara", () => {
  it("shows exactly the figures of hasil_partisipasi and hasil_suara, and who closed it", () => {
    render(
      <BeritaAcara
        row={ROW}
        pencatat={{ dibuatOleh: null, dibukaOleh: "Panitia Satu", ditutupOleh: "Panitia Dua", diumumkanOleh: null }}
        partisipasi={PARTISIPASI}
        suara={SUARA}
        kontes={KONTES}
      />,
    );
    const doc = screen.getByRole("article");
    const cell = (label: string) => within(doc).getByRole("rowheader", { name: label }).nextElementSibling;

    expect(within(doc).getByRole("heading", { name: "Berita Acara Pemilihan" })).toBeInTheDocument();
    expect(cell("Jadwal dibuka")).toHaveTextContent("Minggu, 6 Desember 2026, 08.00 WIB");
    expect(cell("Ditutup")).toHaveTextContent("Minggu, 6 Desember 2026, 17.02 WIB");
    expect(cell("Panitia yang menutup")).toHaveTextContent("Panitia Dua");
    expect(cell("Total pemilih")).toHaveTextContent("40");
    expect(cell("Sudah memberikan suara")).toHaveTextContent("31 (77,5%)");
    expect(cell("Mandiri (Portal Jemaat)")).toHaveTextContent("25");
    expect(cell("Dibantu panitia")).toHaveTextContent("6");
    expect(cell("Tidak memberikan suara")).toHaveTextContent("9");
    expect(cell("Panitia Satu")).toHaveTextContent("4");
    expect(cell("(akun sudah dihapus)")).toHaveTextContent("2");

    const rows = within(doc)
      .getAllByRole("row")
      .filter((r) => within(r).queryAllByRole("cell").length === 3)
      .map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows).toEqual([
      ["1", "Bpk. Adi", "28"],
      ["2 (Seri)", "Ibu Budi", "20"],
      ["2 (Seri)", "Sdr. Citra", "20"],
      ["1", "Bpk. Adi", "17"],
    ]);
  });
});
