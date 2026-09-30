import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicWarta } from "@/lib/public-site";
import type { PublicScheduleRow } from "@/lib/public-schedule";

import { WartaPublicView } from "./warta-public-view";

const SMKA_ROW: PublicScheduleRow = {
  id: "s1",
  tanggal: "2025-11-30",
  jam: "08:00:00",
  categoryKey: "smka",
  categoryName: "Kebaktian SMKA",
  tempatNama: null,
  wilayahNama: null,
  dpa: null,
  tema: "Tema Contoh",
  pelayanFirmanNama: null,
  liturgosNama: "Contoh Liturgi",
  pemusikNama: null,
  bahanAlkitab: null,
  kehadiranLakiLaki: null,
  kehadiranPerempuan: null,
  kehadiranAnak: null,
  catatan: null,
  smkaKelompok: [
    { kelompok: "batita", label: "Kelas Batita", pfNama: "Contoh PF", lakiLaki: 1, perempuan: 2 },
    { kelompok: "orang_tua", label: "Orang Tua", pfNama: null, lakiLaki: 0, perempuan: null },
  ],
};

const WARTA: PublicWarta = {
  slug: "2025-11-30-minggu-contoh",
  tanggalKebaktian: "2025-11-30",
  judulKebaktian: "Minggu Contoh",
  temaKebaktian: "Tema Kebaktian Contoh",
  renunganJudul: "Judul Renungan",
  renunganKitab: "Mazmur 23:1-6",
  renunganIsi: "Baris pertama\n<script>alert(1)</script>\n<b>tebal</b>",
  renunganSumber: "Sumber Contoh",
  schedule: [SMKA_ROW],
  litbang: [
    { id: "l1", name: "Litbang Satu", deskripsi: "• butir satu\n• butir dua" },
    { id: "l2", name: "Litbang Dua", deskripsi: null },
  ],
  finance: [
    { key: "kas_jemaat", name: "Kas Jemaat", saldoAwal: 1_500_000, pemasukan: 250_000, pengeluaran: 100_000, saldoAkhir: 1_650_000 },
  ],
  kesaksian: [{ id: "k1", judul: "Kesaksian Contoh", deskripsi: "Isi kesaksian" }],
};

describe("WartaPublicView (brief §8)", () => {
  it("renders the sections in §8's order with the service and finance ranges", () => {
    const { container } = render(<WartaPublicView warta={WARTA} />);
    expect(screen.getByRole("heading", { level: 1, name: "Minggu Contoh" })).toBeInTheDocument();
    expect(container.querySelector("header time")).toHaveTextContent("Minggu, 30 November 2025");
    expect(screen.getByText("Tema Kebaktian Contoh")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Renungan",
      "Bidang Peribadahan",
      "Bidang Litbang",
      "Bidang Sarana dan Dana",
      "Bidang Kesaksian dan Keesaan",
    ]);
    expect(screen.getByText(/Minggu, 30 November 2025 – Sabtu, 6 Desember 2025 \(Minggu-Sabtu\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Minggu, 23 November 2025 – Sabtu, 29 November 2025 \(Minggu-Sabtu sebelum tanggal kebaktian\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Sumber: Sumber Contoh")).toBeInTheDocument();
  });

  it("shows HTML in the renungan as plain text with its line breaks kept", () => {
    const { container } = render(<WartaPublicView warta={WARTA} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    const isi = screen.getByText(/<script>alert\(1\)<\/script>/);
    expect(isi.textContent).toBe(WARTA.renunganIsi);
    expect(isi).toHaveClass("whitespace-pre-line");
  });

  it("labels the SMKA liturgos 'Pelayan Liturgi' and lists only the groups it was given", () => {
    render(<WartaPublicView warta={WARTA} />);
    const entry = screen.getByRole("heading", { level: 4, name: "Kebaktian SMKA" }).closest("article")!;
    expect(within(entry).getByText("Pelayan Liturgi")).toBeInTheDocument();
    expect(within(entry).queryByText("Liturgos")).toBeNull();
    const table = within(entry).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Kelas Batita", "Orang Tua"]);
    expect(within(rows[1]!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["–", "0", "–"]);
  });

  it("shows the four figures per item exactly as the public function returned them", () => {
    render(<WartaPublicView warta={WARTA} />);
    const item = screen.getByRole("heading", { level: 3, name: "Kas Jemaat" }).closest("article")!;
    const pairs = [...item.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(pairs).toEqual([
      ["Saldo Awal", "Rp 1.500.000"],
      ["Pemasukan", "Rp 250.000"],
      ["Pengeluaran", "Rp 100.000"],
      ["Saldo Akhir", "Rp 1.650.000"],
    ]);
  });

  it("numbers the Litbang list and keeps line breaks in its deskripsi", () => {
    render(<WartaPublicView warta={WARTA} />);
    const list = screen.getByRole("heading", { level: 2, name: "Bidang Litbang" }).closest("section")!.querySelector("ol")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText(/butir satu/)).toHaveClass("whitespace-pre-line");
  });

  it("leaves out Renungan without a judul or isi, and Litbang and Kesaksian when empty", () => {
    render(
      <WartaPublicView
        warta={{
          ...WARTA,
          renunganJudul: " ",
          renunganIsi: null,
          renunganKitab: "Mazmur 1",
          litbang: [],
          kesaksian: [],
          schedule: [],
        }}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Bidang Peribadahan",
      "Bidang Sarana dan Dana",
    ]);
    expect(screen.queryByText("Mazmur 1")).toBeNull();
    expect(screen.getByText("Belum ada jadwal untuk minggu ini.")).toBeInTheDocument();
  });
});
