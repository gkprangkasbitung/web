import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PeribadahanItemRow } from "@/lib/peribadahan-routes";

import { WartaEditor, type WartaEditorProps } from "./warta-editor";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refresh.mockReset();
  push.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

const SCHEDULE_ROW: PeribadahanItemRow = {
  id: "p1",
  categoryId: "c1",
  categoryKey: "umum",
  categoryName: "Kebaktian Minggu",
  tanggal: "2025-11-30",
  jam: "09:00:00",
  tempatId: null,
  tempatNama: "Gedung Contoh",
  wilayahId: null,
  wilayahNama: null,
  pelayanFirmanId: null,
  pelayanFirmanNama: null,
  liturgosId: null,
  liturgosNama: null,
  pemusikId: null,
  pemusikNama: null,
  tema: null,
  dpa: null,
  catatan: null,
  bahanAlkitab: null,
  kehadiranLakiLaki: null,
  kehadiranPerempuan: null,
  kehadiranAnak: null,
  sortOrder: 0,
};

function props(overrides: Partial<WartaEditorProps> = {}): WartaEditorProps {
  return {
    warta: {
      id: "w1",
      slug: "2025-11-30-contoh",
      status: "draft",
      publishedAt: null,
      updatedAt: "2025-11-20T01:00:00.000001+00:00",
      tanggalKebaktian: "2025-11-30",
      judulKebaktian: "Contoh Warta",
      temaKebaktian: null,
      renunganJudul: null,
      renunganKitab: null,
      renunganIsi: null,
      renunganSumber: null,
    },
    litbang: [{ id: "l1", name: "Kartu Contoh", deskripsi: "Isi kartu" }],
    kesaksian: [{ id: "k1", judul: "Kesaksian Contoh", deskripsi: null }],
    serviceWeek: { start: "2025-11-30", end: "2025-12-06" },
    schedule: {
      rows: [SCHEDULE_ROW],
      categories: [{ id: "c1", key: "umum", name: "Kebaktian Minggu" }],
      tempatOptions: [],
      wilayahOptions: [],
      smkaGroups: new Map(),
    },
    financeWeek: { start: "2025-11-23", end: "2025-11-29" },
    finance: [
      {
        id: "s1",
        key: "kas_jemaat",
        name: "Kas Jemaat",
        report: { saldoAwal: 1_000_000, pemasukan: 250_000, pengeluaran: 50_000, saldoAkhir: 1_200_000 },
        rows: [
          {
            id: "t1",
            itemId: "s1",
            tanggal: "2025-11-24",
            tipe: "masuk",
            jumlah: 250_000,
            jemaatId: null,
            jemaatNama: null,
            keterangan: "Contoh",
          },
        ],
      },
    ],
    peopleOptions: [],
    canWrite: true,
    canDelete: true,
    ...overrides,
  };
}

describe("WartaEditor", () => {
  it("read-only: every section shows, inputs are disabled, and there are no action buttons (brief §9.4)", () => {
    render(<WartaEditor {...props({ canWrite: false, canDelete: false })} />);

    for (const title of [
      "Informasi & Renungan",
      "Bidang Peribadahan",
      "Bidang Litbang",
      "Bidang Sarana dan Dana",
      "Bidang Kesaksian dan Keesaan",
    ]) {
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    }

    for (const name of [
      "Terbitkan",
      "Tarik ke Draft",
      "Hapus Warta",
      "Simpan Informasi & Renungan",
      "Simpan",
      "Hapus",
      "Tambah",
      "Tambah Jadwal",
      "Tambah Transaksi",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("form", { name: "Tambah Item Baru" })).not.toBeInTheDocument();

    for (const textbox of screen.getAllByRole("textbox")) expect(textbox).toBeDisabled();
    // The rows themselves are still readable.
    expect(screen.getByText("Gedung Contoh")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Isi kartu")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kesaksian Contoh")).toBeInTheDocument();
  });

  it("editor without warta:delete gets Terbitkan but no Hapus Warta (§13 #2)", () => {
    render(<WartaEditor {...props({ canDelete: false })} />);
    expect(screen.getByRole("button", { name: "Terbitkan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus Warta" })).not.toBeInTheDocument();
  });

  it("shows the four figures exactly as the report returned them", () => {
    render(<WartaEditor {...props()} />);
    const finance = screen.getByRole("region", { name: "Bidang Sarana dan Dana" });
    const figures = within(finance).getAllByRole("definition").map((dd) => dd.textContent);
    expect(figures).toEqual(["Rp 1.000.000", "Rp 250.000", "Rp 50.000", "Rp 1.200.000"]);
    expect(within(finance).getByText(/23 November 2025 – Sabtu, 29 November 2025/)).toBeInTheDocument();
  });

  it("publishing sends only the target status, never published_at", async () => {
    const user = userEvent.setup();
    render(<WartaEditor {...props()} />);
    respond(200, { data: { id: "w1", status: "published", publishedAt: "x", updatedAt: "y" } });

    await user.click(screen.getByRole("button", { name: "Terbitkan" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Warta diterbitkan"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/warta/w1");
    expect(JSON.parse(init.body)).toEqual({ status: "published" });
    expect(refresh).toHaveBeenCalled();
  });

  it("Informasi & Renungan sends the updated_at it started from, then the one the server returned", async () => {
    const user = userEvent.setup();
    render(<WartaEditor {...props()} />);
    const section = screen.getByRole("region", { name: "Informasi & Renungan" });
    const save = within(section).getByRole("button", { name: "Simpan Informasi & Renungan" });

    respond(200, { data: { id: "w1", status: "draft", publishedAt: null, updatedAt: "2025-11-21T00:00:00+00:00" } });
    await user.type(within(section).getByLabelText("Tema Kebaktian"), "Tema baru");
    await user.click(save);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Informasi & Renungan disimpan"));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      temaKebaktian: "Tema baru",
      expectedUpdatedAt: "2025-11-20T01:00:00.000001+00:00",
    });

    const conflict = "Warta ini sudah diubah orang lain sejak kamu membukanya.";
    respond(400, { error: conflict });
    await user.click(save);
    await waitFor(() => expect(within(section).getByRole("alert")).toHaveTextContent(conflict));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
      expectedUpdatedAt: "2025-11-21T00:00:00+00:00",
    });
    // The typed text stays so the user can keep it.
    expect(within(section).getByLabelText("Tema Kebaktian")).toHaveValue("Tema baru");
  });

  it("blank Judul Kebaktian is caught before the request", async () => {
    const user = userEvent.setup();
    render(<WartaEditor {...props()} />);
    const section = screen.getByRole("region", { name: "Informasi & Renungan" });

    await user.clear(within(section).getByRole("textbox", { name: /Judul Kebaktian/ }));
    await user.click(within(section).getByRole("button", { name: "Simpan Informasi & Renungan" }));

    expect(within(section).getByRole("alert")).toHaveTextContent("Judul Kebaktian wajib diisi.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
