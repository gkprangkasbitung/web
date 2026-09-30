import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionOption } from "@/lib/access";
import type { RoleCard } from "@/lib/roles-routes";

import { PermissionMatrix } from "./permission-matrix";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const P = (resource: string, action: string): PermissionOption => ({ id: `${resource}-${action}`, resource, action });
// Only visible resources reach the matrix (the loader filters announcements/content).
const PERMISSIONS = [
  ...["create", "read", "update", "delete"].map((a) => P("warta", a)),
  ...["create", "read", "update", "delete"].map((a) => P("users", a)),
  ...["create", "read", "update", "delete"].map((a) => P("roles", a)),
  P("activity_log", "read"),
];

const ROLES: RoleCard[] = [
  { id: "r-editor", name: "editor", description: null, isSuperAdmin: false, permissionIds: ["warta-read"] },
  {
    id: "r-super",
    name: "super_admin",
    description: null,
    isSuperAdmin: true,
    permissionIds: PERMISSIONS.map((p) => p.id),
  },
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

describe("PermissionMatrix", () => {
  it("warns that roles:* / users:* equal super admin, and hides announcements/content", () => {
    render(<PermissionMatrix roles={ROLES} permissions={PERMISSIONS} />);
    expect(screen.getByText("Permission roles dan users setara akses super admin")).toBeInTheDocument();
    expect(screen.queryByText("announcements")).not.toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    // activity_log has only read; the other actions are "Tidak tersedia".
    expect(screen.getAllByText("Tidak tersedia")).toHaveLength(ROLES.length * 3);
  });

  it("locks super_admin's roles:* and users:* boxes, but not its other boxes", () => {
    render(<PermissionMatrix roles={ROLES} permissions={PERMISSIONS} />);
    expect(screen.getByRole("checkbox", { name: "super_admin: users:delete (terkunci)" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("checkbox", { name: "super_admin: roles:update (terkunci)" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("checkbox", { name: "super_admin: warta:delete" })).not.toHaveAttribute("data-disabled");
  });

  it("enables Simpan only after a change and saves that role's whole set", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrix roles={ROLES} permissions={PERMISSIONS} />);
    const save = screen.getByRole("button", { name: "Simpan permission editor" });
    expect(save).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("checkbox", { name: "editor: warta:update" }));
    expect(save).not.toHaveAttribute("aria-disabled", "true");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await user.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/roles/r-editor");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).permissionIds.sort()).toEqual(["warta-read", "warta-update"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("asks for confirmation before granting users:* or roles:*", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrix roles={ROLES} permissions={PERMISSIONS} />);

    await user.click(screen.getByRole("checkbox", { name: "editor: users:update" }));
    await user.click(screen.getByRole("button", { name: "Simpan permission editor" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Beri akses setara super admin ke role editor?" });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await user.click(within(confirm).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
});
