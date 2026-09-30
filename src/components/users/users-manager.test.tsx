import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UsersOverview } from "@/lib/users-routes";

import { UsersManager } from "./users-manager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ME = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const ROLE_ADMIN = "00000000-0000-4000-8000-0000000000e1";
const ROLE_SUPER = "00000000-0000-4000-8000-0000000000e2";

const OVERVIEW: UsersOverview = {
  roles: [
    { id: ROLE_ADMIN, name: "admin" },
    { id: ROLE_SUPER, name: "super_admin" },
  ],
  users: [
    {
      id: ME,
      email: "saya@contoh.test",
      fullName: "Contoh Saya",
      nama: "Contoh Saya",
      roleIds: [ROLE_SUPER],
      roleNames: "super_admin",
      jemaatId: null,
      jemaatNama: null,
    },
    {
      id: OTHER,
      email: "lain@contoh.test",
      fullName: null,
      nama: "lain@contoh.test",
      roleIds: [],
      roleNames: null,
      jemaatId: null,
      jemaatNama: null,
    },
  ],
  people: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refresh.mockReset();
  Object.values(toast).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderManager(overrides: Partial<Parameters<typeof UsersManager>[0]> = {}) {
  return render(
    <UsersManager overview={OVERVIEW} currentUserId={ME} canCreate canUpdate canDelete {...overrides} />,
  );
}

describe("UsersManager", () => {
  it('offers "Hapus" on other rows but never on your own (brief §9.11)', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "Aksi untuk Contoh Saya" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Aksi untuk lain@contoh.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hapus" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Hapus akun lain@contoh.test?" });
    expect(confirm).toHaveTextContent("Akun ini tidak akan bisa login lagi.");
  });

  it("locks the role on your own row and saves only the jemaat", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "Aksi untuk Contoh Saya" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Contoh Saya" });
    expect(within(dialog).getByText("Role akun sendiri tidak bisa diubah.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Role")).toHaveAttribute("data-disabled");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: ME } }), { status: 200 }));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/users/${ME}`);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ jemaatId: null });
  });

  it("shows a 207 as a warning, not a success, and still closes the invite dialog", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getAllByRole("button", { name: "Undang Pengguna" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Undang Pengguna" });

    await user.click(within(dialog).getByRole("button", { name: "Kirim Undangan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Email wajib diisi.");
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { id: "x" }, error: "Pengguna diundang, tapi gagal set role/jemaat: Role tidak ditemukan." }),
        { status: 207 },
      ),
    );
    await user.type(within(dialog).getByLabelText("Email"), "baru@contoh.test");
    await user.click(within(dialog).getByRole("button", { name: "Kirim Undangan" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.warning).toHaveBeenCalledWith(
      "Pengguna diundang, tapi gagal set role/jemaat: Role tidak ditemukan.",
      expect.anything(),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("without users:create / users:delete: no invite button, no Hapus", async () => {
    const user = userEvent.setup();
    renderManager({ canCreate: false, canDelete: false });
    expect(screen.queryByRole("button", { name: "Undang Pengguna" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aksi untuk lain@contoh.test" }));
    await screen.findByRole("menuitem", { name: "Edit" });
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).not.toBeInTheDocument();
  });
});
