import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LABEL_JEMAAT, TEMPAT, type MasterDataRow } from "@/lib/master-data";

import { MasterDataManager } from "./master-data-manager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ROWS: MasterDataRow[] = [
  { id: "a", nama: "Contoh Gedung Utama", keterangan: "Contoh alamat", sort_order: 0 },
  { id: "b", nama: "Contoh Aula", keterangan: null, sort_order: 1 },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("MasterDataManager", () => {
  it("lists rows in the given sort_order", () => {
    render(<MasterDataManager config={TEMPAT} rows={ROWS} canWrite />);
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(names).toEqual(["Contoh Gedung Utama", "Contoh Aula"]);
  });

  it("adds through the dialog, trimming, then refreshes", async () => {
    const user = userEvent.setup();
    render(<MasterDataManager config={TEMPAT} rows={ROWS} canWrite />);

    await user.click(screen.getAllByRole("button", { name: "Tambah Tempat" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Tambah Tempat" });
    expect(within(dialog).getByLabelText("Keterangan")).toHaveAttribute("placeholder", "Alamat/keterangan");

    // Blank name: inline error, no request.
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nama wajib diisi.");
    expect(fetchMock).not.toHaveBeenCalled();

    respond(201, { data: { id: "c", nama: "Contoh Baru", keterangan: null, sort_order: 2 } });
    await user.type(within(dialog).getByLabelText(/Nama/), "  Contoh Baru ");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/tempat", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ nama: "Contoh Baru", keterangan: "" });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the server's message on failure", async () => {
    const user = userEvent.setup();
    render(<MasterDataManager config={LABEL_JEMAAT} rows={ROWS} canWrite />);

    await user.click(screen.getAllByRole("button", { name: "Tambah Label" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Tambah Label" });
    expect(within(dialog).getByLabelText(/Nama Label/)).toHaveAttribute("placeholder", "Mis. Pendeta");

    respond(400, { error: "Nama label sudah digunakan." });
    await user.type(within(dialog).getByLabelText(/Nama Label/), "Contoh Aula");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nama label sudah digunakan.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("titles the edit dialog with the record name and saves with PATCH", async () => {
    const user = userEvent.setup();
    render(<MasterDataManager config={TEMPAT} rows={ROWS} canWrite />);

    await user.click(screen.getByRole("button", { name: "Aksi untuk Contoh Aula" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Contoh Aula" });
    expect(within(dialog).getByLabelText(/Nama/)).toHaveValue("Contoh Aula");

    respond(200, { data: ROWS[1] });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/tempat/b", expect.objectContaining({ method: "PATCH" })));
  });

  it("confirms a delete naming the record and its consequence", async () => {
    const user = userEvent.setup();
    render(<MasterDataManager config={TEMPAT} rows={ROWS} canWrite />);

    await user.click(screen.getByRole("button", { name: "Aksi untuk Contoh Gedung Utama" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hapus" }));
    const dialog = await screen.findByRole("alertdialog", { name: 'Hapus tempat "Contoh Gedung Utama"?' });
    expect(dialog).toHaveTextContent("dikosongkan tempatnya");

    respond(200, { data: { id: "a" } });
    await user.click(within(dialog).getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/tempat/a", expect.objectContaining({ method: "DELETE" })));
    expect(refresh).toHaveBeenCalled();
  });

  it("is read-only without warta:update: no add, Lihat opens disabled fields, no Hapus", async () => {
    const user = userEvent.setup();
    render(<MasterDataManager config={TEMPAT} rows={ROWS} canWrite={false} />);

    expect(screen.queryByRole("button", { name: "Tambah Tempat" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aksi untuk Contoh Gedung Utama" }));
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Lihat" }));

    const dialog = await screen.findByRole("dialog", { name: "Contoh Gedung Utama" });
    expect(within(dialog).getByLabelText(/Nama/)).toBeDisabled();
    expect(within(dialog).getByLabelText("Keterangan")).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: "Tutup" }).length).toBeGreaterThan(0);
  });
});
