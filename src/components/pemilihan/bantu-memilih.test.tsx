import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PemilihanBantu, PemilihBantu } from "@/lib/pemilihan/admin-types";
import type { Kandidat, Kontes } from "@/lib/pemilihan/types";

import { BantuMemilih } from "./bantu-memilih";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ID = "00000000-0000-4000-8000-000000000e01";
const PEMILIHAN: PemilihanBantu = {
  id: ID,
  nama: "Pemilihan Uji",
  periode: null,
  status: "dibuka",
  dibukaPada: "2026-12-07T01:00:00.000Z",
  ditutupPada: "2026-12-07T10:00:00.000Z",
};
const KONTES: Kontes[] = [
  { kode: "penatua", nama: "Penatua", minPilih: 1, maxPilih: 2 },
  { kode: "ppj", nama: "PPJ", minPilih: 1, maxPilih: 1 },
];
const KANDIDAT: Kandidat[] = [
  { jemaatId: "00000000-0000-4000-8000-0000000000k1", namaTampilan: "Bpk. Adi" },
  { jemaatId: "00000000-0000-4000-8000-0000000000k2", namaTampilan: "Ibu Budi" },
];
const PEMILIH: PemilihBantu[] = [
  { jemaatId: "00000000-0000-4000-8000-0000000000p1", namaTampilan: "Ibu Pemilih Satu", kelompokWilayah: "Wil. 1" },
  { jemaatId: "00000000-0000-4000-8000-0000000000p2", namaTampilan: "Bpk. Pemilih Dua", kelompokWilayah: "Maja" },
];

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function isiSuratSuara(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: "Bpk. Adi" }));
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
  await user.click(screen.getByRole("checkbox", { name: "Ibu Budi" }));
  await user.click(screen.getByRole("button", { name: "Tinjau" }));
}

async function pilihPemilih(user: ReturnType<typeof userEvent.setup>, nama: string) {
  await user.type(screen.getByLabelText(/Nama pemilih/), nama.split(" ").at(-1)!);
  await user.click(await screen.findByRole("option", { name: new RegExp(nama) }));
}

describe("BantuMemilih", () => {
  it("can't send without a voter, the identity check, and a form number", async () => {
    const user = userEvent.setup();
    render(<BantuMemilih pemilihan={PEMILIHAN} kontes={KONTES} kandidat={KANDIDAT} pemilih={PEMILIH} />);
    await isiSuratSuara(user);

    const kirim = screen.getByRole("button", { name: "Kirim Suara" });
    expect(screen.getByText("Pilih pemilih dulu.")).toHaveAttribute("role", "alert");
    expect(kirim).toBeDisabled();

    await pilihPemilih(user, "Pemilih Satu");
    expect(screen.getByText('Centang "Identitas pemilih sudah diverifikasi" dulu.')).toHaveAttribute("role", "alert");
    expect(kirim).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /Identitas pemilih sudah diverifikasi/ }));
    expect(screen.getByText("Isi nomor formulir dulu.")).toHaveAttribute("role", "alert");
    expect(kirim).toBeDisabled();

    await user.type(screen.getByLabelText(/Nomor formulir/), "   ");
    expect(kirim).toBeDisabled();
    await user.type(screen.getByLabelText(/Nomor formulir/), "F-12");
    expect(kirim).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a used form number gets a friendly message and keeps the ballot; success resets for the next voter", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(<BantuMemilih pemilihan={PEMILIHAN} kontes={KONTES} kandidat={KANDIDAT} pemilih={PEMILIH} />);
    await pilihPemilih(user, "Pemilih Satu");
    await user.click(screen.getByRole("checkbox", { name: /Identitas pemilih sudah diverifikasi/ }));
    await user.type(screen.getByLabelText(/Nomor formulir/), "F-12");
    await isiSuratSuara(user);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Nomor formulir "F-12" sudah dipakai pada pemilihan ini.', reason: "formulir_terpakai" }), { status: 400 }),
    );
    await user.click(screen.getByRole("button", { name: "Kirim Suara" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Ibu Pemilih Satu (formulir F-12)");
    await user.click(within(dialog).getByRole("button", { name: "Ya, kirim suara" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/admin/pemilihan/${ID}/bantu`);
    expect(JSON.parse(init.body)).toEqual({
      jemaatId: PEMILIH[0]!.jemaatId,
      nomorFormulir: "F-12",
      penatua: [KANDIDAT[0]!.jemaatId],
      ppj: [KANDIDAT[1]!.jemaatId],
    });
    expect(await screen.findByText(/Nomor formulir "F-12" sudah dipakai pada pemilihan ini. Periksa lagi nomor pada formulir kertas./)).toBeInTheDocument();
    // Still on the review step with the same choices.
    expect(screen.getByRole("heading", { name: "Tinjau pilihan" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Nomor formulir/));
    await user.type(screen.getByLabelText(/Nomor formulir/), "F-13");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { waktu: "2026-12-07T03:00:00Z", namaPemilih: "Ibu Pemilih Satu" } }), { status: 200 }));
    await user.click(screen.getByRole("button", { name: "Kirim Suara" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ya, kirim suara" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Suara Ibu Pemilih Satu tercatat (formulir F-13)."));
    expect(refresh).toHaveBeenCalled();
    // An empty form for the next voter.
    expect(screen.getByLabelText(/Nomor formulir/)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /Identitas pemilih sudah diverifikasi/ })).not.toBeChecked();
    expect(screen.getByRole("heading", { name: "Penatua" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bpk. Adi" })).not.toBeChecked();
    // Choices never go to browser storage.
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("lists only the voters it was given (not voted yet, not the panitia's own record)", async () => {
    const user = userEvent.setup();
    render(<BantuMemilih pemilihan={PEMILIHAN} kontes={KONTES} kandidat={KANDIDAT} pemilih={[PEMILIH[1]!]} />);
    await user.type(screen.getByLabelText(/Nama pemilih/), "Pemilih");
    expect(await screen.findByRole("option", { name: /Bpk. Pemilih Dua/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Ibu Pemilih Satu/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 pemilih belum memberikan suara.")).toBeInTheDocument();
  });

  it("shows no form outside the voting window", () => {
    render(<BantuMemilih pemilihan={{ ...PEMILIHAN, status: "ditutup" }} kontes={[]} kandidat={[]} pemilih={[]} />);
    expect(screen.getByText("Pemungutan suara sudah ditutup")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nomor formulir/)).not.toBeInTheDocument();
  });
});
