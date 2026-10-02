import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { isActivePublicPath, PublicMobileNav, PublicNav } from "./public-nav";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("public navigation (brief §8)", () => {
  it("lists the six links in order and marks the current page", () => {
    pathname = "/warta/2025-11-30-minggu-contoh";
    render(<PublicNav />);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Beranda", "/"],
      ["Tentang Kami", "/tentang-kami"],
      ["Komisi", "/komisi"],
      ["Jadwal Ibadah", "/jadwal-ibadah"],
      ["Warta", "/warta"],
      ["Kontak", "/kontak"],
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual([
      "Warta",
    ]);
  });

  it("marks Beranda only on / itself", () => {
    expect(isActivePublicPath("/", "/")).toBe(true);
    expect(isActivePublicPath("/warta", "/")).toBe(false);
    expect(isActivePublicPath("/wartawan", "/warta")).toBe(false);
  });

  it("opens the mobile menu from the keyboard and closes it after choosing a link", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicMobileNav />);

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Buka menu" });
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    const kontak = within(dialog).getByRole("link", { name: "Kontak" });
    kontak.addEventListener("click", (event) => event.preventDefault());
    await user.click(kontak);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
