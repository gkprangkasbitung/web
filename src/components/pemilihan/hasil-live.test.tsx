import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HasilLive as HasilLiveData } from "@/lib/pemilihan/admin-types";
import type { Kontes } from "@/lib/pemilihan/types";

import { HasilLive, POLL_MS } from "./hasil-live";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ID = "00000000-0000-4000-8000-000000000e01";
const KONTES: Kontes[] = [
  { kode: "penatua", nama: "Penatua (Majelis Jemaat)", minPilih: 10, maxPilih: 30 },
  { kode: "ppj", nama: "PPJ (Pengawas Perbendaharaan Jemaat)", minPilih: 5, maxPilih: 15 },
];

function data(over: Partial<HasilLiveData> = {}): HasilLiveData {
  return {
    status: "dibuka",
    tampilkanHasil: false,
    partisipasi: { totalPemilih: 40, sudahMemilih: 12, persen: 30, mandiri: 9, dibantu: 3, dibantuPerPanitia: [{ userId: "u1", nama: "Panitia Satu", jumlah: 3 }] },
    suara: [
      { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "a", namaTampilan: "Bpk. Adi", jumlahSuara: 7, peringkat: 1 },
      { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "b", namaTampilan: "Ibu Budi", jumlahSuara: 5, peringkat: 2 },
      { kontes: "penatua", kontesNama: KONTES[0]!.nama, jemaatId: "c", namaTampilan: "Sdr. Citra", jumlahSuara: 5, peringkat: 2 },
      { kontes: "ppj", kontesNama: KONTES[1]!.nama, jemaatId: "a", namaTampilan: "Bpk. Adi", jumlahSuara: 4, peringkat: 1 },
    ],
    waktu: "2026-12-07T03:42:07.000Z",
    ...over,
  };
}

let visibility: DocumentVisibilityState = "visible";
const fetchMock = vi.fn();

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: data({ waktu: "2026-12-07T03:42:17.000Z" }) }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderHasil(initial: HasilLiveData) {
  return render(<HasilLive pemilihan={{ id: ID, nama: "Pemilihan Uji" }} kontes={KONTES} initial={initial} canUpdate={false} canBantu={false} />);
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("HasilLive", () => {
  it("shows turnout split mandiri / dibantu and the last update time in WIB", () => {
    renderHasil(data());
    expect(screen.getByText("12 / 40")).toBeInTheDocument();
    expect(screen.getByText("30,0%")).toBeInTheDocument();
    expect(screen.getByText("Diperbarui pukul 10.42.07")).toBeInTheDocument();
    expect(screen.getByText(/Panitia Satu/)).toHaveTextContent("Panitia Satu: 3");
  });

  it("shows both rankings while open even with the Portal Jemaat switch off, ties marked Seri", () => {
    renderHasil(data({ tampilkanHasil: false }));
    const penatua = screen.getByRole("region", { name: KONTES[0]!.nama });
    expect(within(penatua).getAllByRole("row")).toHaveLength(4);
    expect(within(penatua).getAllByText("Seri")).toHaveLength(2);
    expect(screen.getByRole("region", { name: KONTES[1]!.nama })).toBeInTheDocument();
  });

  it("without pemilihan_hasil:read: turnout only, no tally", () => {
    renderHasil(data({ suara: null }));
    expect(screen.getByText("12 / 40")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: KONTES[0]!.nama })).not.toBeInTheDocument();
    expect(screen.queryByText("Bpk. Adi")).not.toBeInTheDocument();
    expect(screen.getByText(/hanya bisa dilihat oleh pemegang izin pemilihan_hasil:read/)).toBeInTheDocument();
  });

  it("polls every 10 s, stops while the tab is hidden, and refreshes at once when it is visible again", async () => {
    vi.useFakeTimers();
    renderHasil(data());

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/pemilihan/${ID}/hasil`);
    expect(screen.getByText("Diperbarui pukul 10.42.17")).toBeInTheDocument();

    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("doesn't poll once the election is closed", async () => {
    vi.useFakeTimers();
    renderHasil(data({ status: "ditutup" }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ekspor CSV" })).toBeInTheDocument();
  });

  it("keeps the last figures when a refresh fails", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    renderHasil(data());
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("12 / 40")).toBeInTheDocument();
    expect(screen.getByText(/gagal memperbarui/)).toBeInTheDocument();
  });
});
