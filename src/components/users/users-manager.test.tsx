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
const JEMAAT_USER = "00000000-0000-4000-8000-00000000000c";
const JEMAAT_LINKED = "00000000-0000-4000-8000-0000000000f1";
const JEMAAT_FREE = "00000000-0000-4000-8000-0000000000f2";

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
      accountKind: "Pengurus",
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
      accountKind: "Tanpa akses",
    },
    {
      id: JEMAAT_USER,
      email: "jemaat@contoh.test",
      fullName: "Contoh Jemaat",
      nama: "Contoh Jemaat",
      roleIds: [],
      roleNames: null,
      jemaatId: JEMAAT_LINKED,
      jemaatNama: "Contoh Jemaat",
      accountKind: "Jemaat",
    },
  ],
  people: [
    { id: JEMAAT_LINKED, nama: "Contoh Jemaat", labels: [], linkedEmail: "jemaat@contoh.test", linkedUserId: JEMAAT_USER },
    { id: JEMAAT_FREE, nama: "Contoh Bebas", labels: [], linkedEmail: null, linkedUserId: null },
  ],
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

  it("shows the account kind as badges, with a Jenis Akun facet (stage 11f)", async () => {
    const user = userEvent.setup();
    renderManager();

    const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
    expect(within(row("Contoh Saya")).getByText("Pengurus")).toBeInTheDocument();
    expect(within(row("Contoh Jemaat")).getByText("Jemaat")).toBeInTheDocument();
    expect(within(row("lain@contoh.test")).getByText("Tanpa akses")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter Jenis Akun" }));
    const options = await screen.findAllByRole("menuitemcheckbox");
    expect(options.map((option) => option.textContent)).toEqual(["Jemaat1", "Pengurus1", "Tanpa akses1"]);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /^Jemaat/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("row", { name: /Contoh Saya/ })).not.toBeInTheDocument();
    expect(row("Contoh Jemaat")).toBeInTheDocument();
  });

  it('"Akun Jemaat": no role or name fields, a jemaat is required, and the body says kind "jemaat"', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getAllByRole("button", { name: "Undang Pengguna" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Undang Pengguna" });
    await user.click(within(dialog).getByRole("radio", { name: /Akun Jemaat/ }));
    expect(within(dialog).queryByLabelText("Role")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Nama Lengkap")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Email"), "anggota@contoh.test");
    await user.click(within(dialog).getByRole("button", { name: "Kirim Undangan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Jemaat wajib dipilih untuk Akun Jemaat.");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Jemaat (wajib)"), "Contoh");
    expect(await screen.findByRole("option", { name: /Contoh Jemaat/ })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: /Contoh Bebas/ }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "x" } }), { status: 201 }));
    await user.click(within(dialog).getByRole("button", { name: "Kirim Undangan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      kind: "jemaat",
      email: "anggota@contoh.test",
      jemaatId: JEMAAT_FREE,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Undangan terkirim"));
  });
});
