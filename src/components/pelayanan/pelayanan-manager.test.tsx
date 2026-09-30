import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PelayananCardRow } from "@/lib/pelayanan";

import { PelayananManager } from "./pelayanan-manager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const CARDS: PelayananCardRow[] = [
  { id: "a", nama: "Sekolah Minggu", deskripsi: null, jadwal: null, icon: "Baby", aktif: true, sort_order: 0 },
  { id: "b", nama: "Persekutuan Pria", deskripsi: null, jadwal: null, icon: "Users", aktif: true, sort_order: 1 },
  { id: "c", nama: "Nonaktif", deskripsi: null, jadwal: null, icon: "Users", aktif: false, sort_order: 2 },
];

const fetchMock = vi.fn();

/** Same jsdom rect stub as litbang-manager.test.tsx (dnd-kit's keyboard coordinate getter). */
function stubCardRects() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.getAttribute("data-slot") === "card") {
      const cards = Array.from(document.querySelectorAll('[data-slot="card"]'));
      const top = cards.indexOf(this) * 100;
      return { top, bottom: top + 90, left: 0, right: 300, width: 300, height: 90, x: 0, y: top, toJSON: () => {} } as DOMRect;
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refresh.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("PelayananManager", () => {
  it("reorders with the keyboard alone and saves the new order", async () => {
    const restoreRects = stubCardRects();
    try {
      const user = userEvent.setup();
      render(<PelayananManager cards={CARDS} canWrite canDelete />);
      respond(200, { data: { ok: true } });

      screen.getByRole("button", { name: "Ubah urutan pelayanan Sekolah Minggu" }).focus();
      await user.keyboard("[Space]");
      await user.keyboard("[ArrowDown]");
      await user.keyboard("[Space]");

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/pelayanan/reorder", expect.objectContaining({ method: "POST" })),
      );
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ ids: ["b", "a", "c"] });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    } finally {
      restoreRects();
    }
  });

  it("toggling Aktif shows a toast and sends only { aktif }", async () => {
    const user = userEvent.setup();
    render(<PelayananManager cards={CARDS} canWrite canDelete />);

    respond(200, { data: { ...CARDS[0], aktif: false } });
    await user.click(screen.getAllByRole("checkbox", { name: "Aktif" })[0]!);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Pelayanan dinonaktifkan"));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ aktif: false });
  });

  it("read-only mode: no drag handle, no Tambah/Simpan; Hapus follows canDelete separately from canWrite", () => {
    render(<PelayananManager cards={CARDS} canWrite={false} canDelete={false} />);

    expect(screen.queryByRole("button", { name: /Ubah urutan pelayanan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Pelayanan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
  });

  it("a viewer with no situs:update but situs:delete still sees Hapus, not Simpan", () => {
    render(<PelayananManager cards={CARDS} canWrite={false} canDelete />);

    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Hapus" })).toHaveLength(CARDS.length);
  });
});
