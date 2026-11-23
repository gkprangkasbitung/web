import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfilSaya } from "@/lib/portal/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const submitPengajuanAction = vi.fn();
const batalkanPengajuanAction = vi.fn();
vi.mock("@/app/jemaat/(portal)/profil/actions", () => ({ submitPengajuanAction, batalkanPengajuanAction }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const { PengajuanSection } = await import("./pengajuan-section");

const PROFIL: ProfilSaya = {
  nama: "Uji Jemaat",
  nomorAnggota: "RB-0001",
  jenisKelamin: "perempuan",
  statusKeanggotaan: "sidi",
  wilayahNama: null,
  keluargaNama: null,
  hubunganKeluarga: null,
  tanggalLahir: null,
  tanggalMasuk: null,
  pekerjaan: "Guru",
  alamat: "Jalan Contoh 1",
  noHp: "081234567890",
};

beforeEach(() => {
  refresh.mockReset();
  submitPengajuanAction.mockReset();
  batalkanPengajuanAction.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("PengajuanSection", () => {
  it("strips non-digits as you type (PhoneInput), and rejects a too-short no_hp before calling the server", async () => {
    const user = userEvent.setup();
    render(<PengajuanSection profil={PROFIL} latestPengajuan={null} />);

    await user.click(screen.getByRole("button", { name: "Ajukan perubahan data" }));
    const noHp = screen.getByLabelText("No. HP") as HTMLInputElement;
    await user.clear(noHp);
    await user.type(noHp, "0812-3456");
    expect(noHp.value).toBe("08123456"); // the dash never reaches the stored value

    await user.clear(noHp);
    await user.type(noHp, "0812"); // 4 digits: too short either way
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    expect(await screen.findByText("No. HP hanya boleh berisi angka, 8 sampai 15 digit.")).toBeInTheDocument();
    expect(submitPengajuanAction).not.toHaveBeenCalled();
  });

  it("submits valid data, shows a success toast, and refreshes", async () => {
    submitPengajuanAction.mockResolvedValue({ ok: true, data: { id: "p1" } });
    const user = userEvent.setup();
    render(<PengajuanSection profil={PROFIL} latestPengajuan={null} />);

    await user.click(screen.getByRole("button", { name: "Ajukan perubahan data" }));
    const noHp = screen.getByLabelText("No. HP");
    await user.clear(noHp);
    await user.type(noHp, "081299998888");
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    await waitFor(() => expect(submitPengajuanAction).toHaveBeenCalledWith({ no_hp: "081299998888", alamat: "Jalan Contoh 1", pekerjaan: "Guru" }));
    expect(toastSuccess).toHaveBeenCalledWith("Pengajuan perubahan data terkirim.");
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server's message and keeps the dialog open on failure", async () => {
    submitPengajuanAction.mockResolvedValue({ ok: false, reason: "bentrok", message: "Masih ada pengajuan yang menunggu." });
    const user = userEvent.setup();
    render(<PengajuanSection profil={PROFIL} latestPengajuan={null} />);

    await user.click(screen.getByRole("button", { name: "Ajukan perubahan data" }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    expect(await screen.findByText("Masih ada pengajuan yang menunggu.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it(`disables "Ajukan perubahan data" while a request is menunggu, and shows its status and a Batalkan button`, async () => {
    render(
      <PengajuanSection
        profil={PROFIL}
        latestPengajuan={{ id: "p1", data: { no_hp: "0899" }, status: "menunggu", catatanAdmin: null, createdAt: "2026-01-05T03:00:00Z", ditinjauPada: null }}
      />,
    );

    expect(screen.getByRole("button", { name: "Ajukan perubahan data" })).toBeDisabled();
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batalkan pengajuan" })).toBeEnabled();
  });

  it("shows ditolak's catatan admin, and no Batalkan button", async () => {
    render(
      <PengajuanSection
        profil={PROFIL}
        latestPengajuan={{
          id: "p1",
          data: { alamat: "Jalan Baru" },
          status: "ditolak",
          catatanAdmin: "Alamat belum lengkap.",
          createdAt: "2026-01-05T03:00:00Z",
          ditinjauPada: "2026-01-06T03:00:00Z",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Ajukan perubahan data" })).toBeEnabled();
    expect(screen.getByText("Ditolak")).toBeInTheDocument();
    expect(screen.getByText(/Alamat belum lengkap\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Batalkan pengajuan" })).toBeNull();
  });

  it("Batalkan calls the action and refreshes", async () => {
    batalkanPengajuanAction.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(
      <PengajuanSection
        profil={PROFIL}
        latestPengajuan={{ id: "p1", data: { no_hp: "0899" }, status: "menunggu", catatanAdmin: null, createdAt: "2026-01-05T03:00:00Z", ditinjauPada: null }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Batalkan pengajuan" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan" }));

    await waitFor(() => expect(batalkanPengajuanAction).toHaveBeenCalledWith("p1"));
    expect(toastSuccess).toHaveBeenCalledWith("Pengajuan dibatalkan.");
    expect(refresh).toHaveBeenCalled();
  });
});
