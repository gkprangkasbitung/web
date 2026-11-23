import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { jemaatNav } from "@/lib/jemaat-portal-nav";

vi.mock("@/app/jemaat/actions", () => ({ logoutJemaat: vi.fn() }));

let pathname = "/jemaat";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { JemaatShell } = await import("./jemaat-shell");

describe("JemaatShell", () => {
  it("the mobile bottom nav has exactly Beranda, Pelayanan, Profil, Akun, in order", () => {
    pathname = "/jemaat";
    render(
      <JemaatShell items={jemaatNav(true)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={false}>
        <p>Konten</p>
      </JemaatShell>,
    );
    const bottomNav = screen.getByRole("navigation", { name: "Navigasi utama" });
    const labels = within(bottomNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Beranda", "Pelayanan", "Profil", "Akun"]);
  });

  it("every bottom nav link is at least 48px tall and reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(
      <JemaatShell items={jemaatNav(true)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={false}>
        <p>Konten</p>
      </JemaatShell>,
    );
    const bottomNav = screen.getByRole("navigation", { name: "Navigasi utama" });
    const links = within(bottomNav).getAllByRole("link");
    for (const link of links) {
      expect(link.className).toMatch(/min-h-12/);
      expect(link).toHaveAttribute("href");
      expect(link).not.toHaveAttribute("tabindex", "-1");
    }

    // Starts from the bar's own first link (jsdom has no real layout engine,
    // so it can't skip the CSS-hidden desktop sidebar the way a browser
    // would); tabbing forward from there still proves the 4 links are
    // adjacent, focusable, and in the stated order.
    links[0]!.focus();
    expect(links[0]).toHaveFocus();
    for (let i = 1; i < links.length; i++) {
      await user.tab();
      expect(links[i]).toHaveFocus();
    }
  });

  it("the desktop sidebar lists every page, including Komisi and Persembahan", () => {
    pathname = "/jemaat/komisi";
    render(
      <JemaatShell items={jemaatNav(true)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={false}>
        <p>Konten</p>
      </JemaatShell>,
    );
    const sidebar = screen.getByRole("navigation", { name: "Navigasi Portal Jemaat" });
    const links = within(sidebar).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Beranda", "Pelayanan", "Profil", "Komisi", "Persembahan", "Akun"]);
    expect(within(sidebar).getByRole("link", { name: "Komisi" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Beranda" })).not.toHaveAttribute("aria-current");
  });

  it("hides Persembahan everywhere when the setting is off", () => {
    pathname = "/jemaat";
    render(
      <JemaatShell items={jemaatNav(false)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={false}>
        <p>Konten</p>
      </JemaatShell>,
    );
    expect(screen.queryByRole("link", { name: "Persembahan" })).toBeNull();
  });

  it(`shows "Buka halaman admin" only for a staff account that is also a jemaat`, () => {
    pathname = "/jemaat";
    const { rerender } = render(
      <JemaatShell items={jemaatNav(true)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={false}>
        <p>Konten</p>
      </JemaatShell>,
    );
    expect(screen.queryByRole("link", { name: "Buka halaman admin" })).toBeNull();

    rerender(
      <JemaatShell items={jemaatNav(true)} nama="Uji Jemaat" akun="uji@test.local" isStaffToo={true}>
        <p>Konten</p>
      </JemaatShell>,
    );
    expect(screen.getByRole("link", { name: "Buka halaman admin" })).toHaveAttribute("href", "/admin");
  });
});
