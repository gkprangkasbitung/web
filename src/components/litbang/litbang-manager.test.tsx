import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LitbangCardRow } from "@/lib/litbang";

import { LitbangManager } from "./litbang-manager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const CARDS: LitbangCardRow[] = [
  { id: "a", name: "Kartu A", deskripsi: null, active: true, sort_order: 0 },
  { id: "b", name: "Kartu B", deskripsi: null, active: true, sort_order: 1 },
  { id: "c", name: "Kartu C", deskripsi: null, active: false, sort_order: 2 },
];

const fetchMock = vi.fn();

/**
 * dnd-kit's keyboard coordinate getter (brief §9.6) compares each sortable
 * item's measured `getBoundingClientRect()` to find "the next card down" —
 * jsdom returns an all-zero rect for everything, so without this the arrow
 * key would never move past the first card.
 */
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

describe("LitbangManager", () => {
  it("reorders with the keyboard alone and saves the new order", async () => {
    const restoreRects = stubCardRects();
    try {
      const user = userEvent.setup();
      render(<LitbangManager cards={CARDS} canWrite />);
      respond(200, { data: { ok: true } });

      screen.getByRole("button", { name: "Ubah urutan litbang Kartu A" }).focus();
      await user.keyboard("[Space]");
      await user.keyboard("[ArrowDown]");
      await user.keyboard("[Space]");

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/litbang-template/reorder", expect.objectContaining({ method: "POST" })),
      );
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ ids: ["b", "a", "c"] });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    } finally {
      restoreRects();
    }
  });

  it("rolls back the order and shows the server's message when saving fails", async () => {
    const restoreRects = stubCardRects();
    try {
      const user = userEvent.setup();
      render(<LitbangManager cards={CARDS} canWrite />);
      respond(400, { error: "Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi." });

      screen.getByRole("button", { name: "Ubah urutan litbang Kartu A" }).focus();
      await user.keyboard("[Space]");
      await user.keyboard("[ArrowDown]");
      await user.keyboard("[Space]");

      await waitFor(() => expect(toastError).toHaveBeenCalledWith("Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi."));
      // Rolled back: Kartu A is still the first name input in the DOM.
      expect(screen.getAllByLabelText("Nama")[0]).toHaveValue("Kartu A");
    } finally {
      restoreRects();
    }
  });

  it("toggling Aktif shows the matching toast for each direction", async () => {
    const user = userEvent.setup();
    render(<LitbangManager cards={CARDS} canWrite />);

    respond(200, { data: { ...CARDS[0], active: false } });
    await user.click(screen.getAllByRole("checkbox", { name: "Aktif" })[0]!);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Dinonaktifkan - dilewati saat warta baru dibuat"));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ active: false });

    respond(200, { data: { ...CARDS[2], active: true } });
    await user.click(screen.getAllByRole("checkbox", { name: "Aktif" })[2]!);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Diaktifkan - akan ikut ke warta baru"));
  });

  it("read-only mode: no drag handle, no Tambah/Simpan/Hapus", () => {
    render(<LitbangManager cards={CARDS} canWrite={false} />);

    expect(screen.queryByRole("button", { name: /Ubah urutan litbang/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Litbang" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "Aktif" })[0]).toHaveAttribute("aria-disabled", "true");
  });
});
