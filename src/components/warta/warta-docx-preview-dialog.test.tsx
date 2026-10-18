import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WartaDocxPreview } from "@/lib/warta-docx";

import { WartaDocxPreviewDialog } from "./warta-docx-preview-dialog";

const renderAsync = vi.fn(async () => undefined);
vi.mock("docx-preview", () => ({ renderAsync: (...args: unknown[]) => renderAsync(...(args as [])) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const fetchMock = vi.fn();
const HASH = "a".repeat(64);
const PREVIEW: WartaDocxPreview = {
  hash: HASH,
  dibuatPada: "2026-10-04T02:30:00.000Z",
  kelengkapan: [
    { pesan: "Daftar Pujian masih kosong.", href: "#bahan-bacaan" },
    { pesan: "Tidak ada data kehadiran di minggu sebelumnya.", href: "/admin/peribadahan" },
  ],
  docx: btoa("PK fake docx"),
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  renderAsync.mockClear();
  toastSuccess.mockReset();
  toastError.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:warta");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondPreview() {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: PREVIEW }), { status: 200 }));
}

async function openDialog() {
  const user = userEvent.setup();
  render(<WartaDocxPreviewDialog wartaId="w1" />);
  respondPreview();
  await user.click(screen.getByRole("button", { name: "Pratinjau Warta" }));
  await screen.findByText("Daftar Pujian masih kosong.");
  return user;
}

describe("WartaDocxPreviewDialog", () => {
  it("loads the preview on open, renders the pages, and lists Kelengkapan Warta with links", async () => {
    await openDialog();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/warta/w1/docx?mode=preview", { cache: "no-store" });
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "Daftar Pujian masih kosong." })).toHaveAttribute("href", "#bahan-bacaan");
    expect(screen.getByRole("link", { name: "Tidak ada data kehadiran di minggu sebelumnya." })).toHaveAttribute(
      "href",
      "/admin/peribadahan",
    );
    // 02.30 UTC is 09.30 WIB.
    expect(screen.getByText("09.30")).toBeInTheDocument();
  });

  it("downloads with the preview's hash", async () => {
    const user = await openDialog();
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["docx"]), {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="warta-2026-10-04-DRAFT.docx"' },
      }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Unduh Warta (.docx)" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Warta diunduh"));
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/admin/warta/w1/docx?mode=download&hash=${HASH}`, { cache: "no-store" });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("on 409, shows that the data changed and blocks the download until the preview is reloaded", async () => {
    const user = await openDialog();
    const message = "Data warta berubah sejak pratinjau dibuat. Muat ulang pratinjau.";
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: message }), { status: 409 }));
    await user.click(screen.getByRole("button", { name: "Unduh Warta (.docx)" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(message));
    expect(screen.getByText("Data berubah")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unduh Warta (.docx)" })).toHaveAttribute("aria-disabled", "true");

    respondPreview();
    await user.click(screen.getByRole("button", { name: "Muat ulang pratinjau" }));
    await waitFor(() => expect(screen.queryByText("Data berubah")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unduh Warta (.docx)" })).not.toHaveAttribute("aria-disabled", "true"),
    );
  });
});
