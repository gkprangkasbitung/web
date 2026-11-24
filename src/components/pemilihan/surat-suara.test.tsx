import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Kandidat, Kontes } from "@/lib/pemilihan/types";

import { SuratSuara } from "./surat-suara";

// Limits come from the props (pemilihan_kontes), never from the component.
const KONTES: Kontes[] = [
  { kode: "penatua", nama: "Penatua", minPilih: 2, maxPilih: 3 },
  { kode: "ppj", nama: "PPJ", minPilih: 1, maxPilih: 1 },
];
const KANDIDAT: Kandidat[] = [
  { jemaatId: "k1", namaTampilan: "Bpk. Adi" },
  { jemaatId: "k2", namaTampilan: "Ibu Budi" },
  { jemaatId: "k3", namaTampilan: "Sdr. Citra" },
  { jemaatId: "k4", namaTampilan: "Sdri. Dewi" },
];

describe("SuratSuara", () => {
  it("enforces each contest's limits from pemilihan_kontes, then reviews and confirms", async () => {
    const user = userEvent.setup();
    const onKirim = vi.fn().mockResolvedValue(undefined);
    render(<SuratSuara kontes={KONTES} kandidat={KANDIDAT} onKirim={onKirim} />);

    expect(screen.getByText("Pilih minimal 2 dan maksimal 3 calon.")).toBeInTheDocument();
    const lanjut = screen.getByRole("button", { name: "Lanjut" });
    expect(lanjut).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Bpk. Adi" }));
    expect(screen.getByText("1 dari maks. 3 dipilih")).toBeInTheDocument();
    expect(screen.getByText("Pilih minimal 2 calon untuk lanjut.")).toBeInTheDocument();
    expect(lanjut).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Ibu Budi" }));
    await user.click(screen.getByRole("checkbox", { name: "Sdr. Citra" }));
    expect(screen.getByText("3 dari maks. 3 dipilih")).toBeInTheDocument();
    expect(screen.getByText("Batas maksimal 3 calon tercapai.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Sdri. Dewi" })).toHaveAttribute("aria-disabled", "true");

    // Search narrows the list.
    await user.type(screen.getByRole("searchbox", { name: "Cari calon Penatua" }), "dew");
    expect(screen.queryByRole("checkbox", { name: "Bpk. Adi" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Cari calon Penatua" }));

    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByRole("heading", { name: "PPJ" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Bpk. Adi" }));
    await user.click(screen.getByRole("button", { name: "Tinjau" }));

    expect(screen.getByRole("heading", { name: "Tinjau pilihan" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kirim Suara" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("tidak bisa diubah atau dibatalkan");
    await user.click(screen.getByRole("button", { name: "Ya, kirim suara" }));
    await waitFor(() => expect(onKirim).toHaveBeenCalledWith({ penatua: ["k1", "k2", "k3"], ppj: ["k1"] }));
  });

  it("can't be sent while a reason blocks it", async () => {
    const user = userEvent.setup();
    render(<SuratSuara kontes={[KONTES[1]!]} kandidat={KANDIDAT} onKirim={vi.fn()} alasanTidakBisaKirim="Pilih pemilih dulu." />);
    await user.click(screen.getByRole("checkbox", { name: "Ibu Budi" }));
    await user.click(screen.getByRole("button", { name: "Tinjau" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih pemilih dulu.");
    expect(screen.getByRole("button", { name: "Kirim Suara" })).toBeDisabled();
  });
});
