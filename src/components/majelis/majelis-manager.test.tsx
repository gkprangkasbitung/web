import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MajelisCardRow } from "@/lib/majelis";

import { MajelisManager } from "./majelis-manager";

// lib/situs-photo.ts (situsPhotoUrl) reads these once, at import.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const CARDS: MajelisCardRow[] = [
  { id: "a", nama: "Pdt. Contoh", jabatan: "Pendeta Jemaat", foto_path: null, foto_alt: null, aktif: true, sort_order: 0 },
  { id: "b", nama: "Nonaktif", jabatan: "Mantan Diaken", foto_path: null, foto_alt: null, aktif: false, sort_order: 1 },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
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

describe("MajelisManager", () => {
  it("toggling Aktif calls the dedicated endpoint with only { aktif }", async () => {
    const user = userEvent.setup();
    render(<MajelisManager cards={CARDS} canWrite canDelete />);

    respond(200, { data: { ...CARDS[0], aktif: false } });
    await user.click(screen.getAllByRole("checkbox", { name: "Aktif" })[0]!);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Majelis dinonaktifkan"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/majelis/a/aktif");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ aktif: false });
  });

  it("adds a majelis through the dialog with nama, jabatan, and no photo (multipart)", async () => {
    const user = userEvent.setup();
    render(<MajelisManager cards={CARDS} canWrite canDelete />);

    await user.click(screen.getByRole("button", { name: "Tambah Majelis" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nama/), "Diaken Baru");
    await user.type(within(dialog).getByLabelText(/Jabatan/), "Diaken");

    respond(201, { data: { ...CARDS[0], id: "c", nama: "Diaken Baru", jabatan: "Diaken" } });
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/majelis");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("nama")).toBe("Diaken Baru");
    expect(body.get("jabatan")).toBe("Diaken");
  });

  it("read-only mode: no drag handle, no Tambah/Simpan; Hapus needs canDelete separately", () => {
    render(<MajelisManager cards={CARDS} canWrite={false} canDelete={false} />);

    expect(screen.queryByRole("button", { name: /Ubah urutan majelis/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Majelis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
  });

  it("canWrite without canDelete: Simpan shows, Hapus doesn't", () => {
    render(<MajelisManager cards={CARDS} canWrite canDelete={false} />);

    expect(screen.getAllByRole("button", { name: "Simpan" })).toHaveLength(CARDS.length);
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
  });
});
