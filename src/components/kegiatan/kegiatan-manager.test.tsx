import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KegiatanRow } from "@/lib/kegiatan";

import { KegiatanManager } from "./kegiatan-manager";

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

const ROWS: KegiatanRow[] = [
  {
    id: "a",
    judul: "Retret Pemuda",
    tanggal: "2031-06-15",
    waktu: null,
    tempat: "Aula",
    deskripsi: null,
    foto_path: null,
    foto_alt: null,
    status: "draft",
  },
  {
    id: "b",
    judul: "Ibadah Natal",
    tanggal: "2031-12-25",
    waktu: null,
    tempat: null,
    deskripsi: null,
    foto_path: null,
    foto_alt: null,
    status: "published",
  },
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

describe("KegiatanManager", () => {
  it("adds a kegiatan through the dialog as multipart, starting as draft", async () => {
    const user = userEvent.setup();
    render(<KegiatanManager rows={ROWS} canWrite canDelete />);

    await user.click(screen.getByRole("button", { name: "Tambah Kegiatan" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Kegiatan" });
    await user.type(within(dialog).getByLabelText(/Judul/), "Kegiatan Baru");

    respond(201, { data: { ...ROWS[0], id: "c", judul: "Kegiatan Baru" } });
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/kegiatan");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("judul")).toBe("Kegiatan Baru");
  });

  it("row menu offers Terbitkan for a draft and Tarik ke Draft for a published row", async () => {
    const user = userEvent.setup();
    render(<KegiatanManager rows={ROWS} canWrite canDelete />);

    await user.click(screen.getByRole("button", { name: "Aksi untuk Retret Pemuda" }));
    expect(await screen.findByRole("menuitem", { name: "Terbitkan" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Aksi untuk Ibadah Natal" }));
    expect(await screen.findByRole("menuitem", { name: "Tarik ke Draft" })).toBeInTheDocument();
  });

  it("Terbitkan calls the status endpoint and shows a toast", async () => {
    const user = userEvent.setup();
    render(<KegiatanManager rows={ROWS} canWrite canDelete />);

    await user.click(screen.getByRole("button", { name: "Aksi untuk Retret Pemuda" }));
    respond(200, { data: { ...ROWS[0], status: "published" } });
    await user.click(await screen.findByRole("menuitem", { name: "Terbitkan" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Kegiatan diterbitkan"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/kegiatan/a/status",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ status: "published" });
  });

  it("read-only mode: no add action, no Terbitkan/Hapus in the row menu", async () => {
    const user = userEvent.setup();
    render(<KegiatanManager rows={ROWS} canWrite={false} canDelete={false} />);

    expect(screen.queryByRole("button", { name: "Tambah Kegiatan" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aksi untuk Retret Pemuda" }));
    expect(screen.queryByRole("menuitem", { name: "Terbitkan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "Lihat" })).toBeInTheDocument();
  });
});
