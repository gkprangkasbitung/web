import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublicMobileNav, PublicNav } from "./public-nav";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("public header nav (stage 11g)", () => {
  it("lists Beranda, Tentang Kami, Kontak, and Portal as links, plus both dropdown triggers", () => {
    pathname = "/";
    render(<PublicNav />);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });

    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Beranda", "/"],
      ["Tentang Kami", "/tentang-kami"],
      ["Kontak", "/kontak"],
      ["Portal", "/portal"],
    ]);
    // The two submenus are separate controls, not links.
    expect(within(nav).getByRole("button", { name: "Submenu Tentang Kami" })).toHaveAttribute("aria-expanded", "false");
    const informasiJemaat = within(nav).getByRole("button", { name: "Informasi Jemaat" });
    expect(informasiJemaat).toHaveAttribute("aria-expanded", "false");
    expect(informasiJemaat.tagName).toBe("BUTTON");
  });

  it("marks Beranda active only on /, and Informasi Jemaat active (no own link) on a warta detail page", () => {
    pathname = "/";
    const { unmount } = render(<PublicNav />);
    expect(screen.getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Informasi Jemaat" })).not.toHaveAttribute("aria-current");
    unmount();

    pathname = "/warta/2025-11-30-minggu-contoh";
    render(<PublicNav />);
    expect(screen.getByRole("button", { name: "Informasi Jemaat" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Beranda" })).not.toHaveAttribute("aria-current");
  });

  it("marks Informasi Jemaat active on /jadwal-ibadah and a kegiatan detail page too", () => {
    pathname = "/jadwal-ibadah";
    const { unmount } = render(<PublicNav />);
    expect(screen.getByRole("button", { name: "Informasi Jemaat" })).toHaveAttribute("aria-current", "page");
    unmount();

    pathname = "/kegiatan/retret-pemuda";
    render(<PublicNav />);
    expect(screen.getByRole("button", { name: "Informasi Jemaat" })).toHaveAttribute("aria-current", "page");
  });

  it("marks Tentang Kami active on a komisi detail page too, without opening either submenu", () => {
    pathname = "/komisi/majelis-pemuda";
    render(<PublicNav />);
    expect(screen.getByRole("link", { name: "Tentang Kami" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Informasi Jemaat" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Komisi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Warta" })).not.toBeInTheDocument();
  });

  it("Tentang Kami's submenu opens by click, lists its three items, and the direct link still points at /tentang-kami", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicNav />);

    const trigger = screen.getByRole("button", { name: "Submenu Tentang Kami" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const items = await screen.findAllByRole("link", { name: /Profil Gereja|Pendeta & Majelis|Komisi/ });
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Profil Gereja", "/tentang-kami"],
      ["Pendeta & Majelis", "/pendeta-majelis"],
      ["Komisi", "/komisi"],
    ]);
  });

  it("Informasi Jemaat's submenu opens by click and lists Jadwal Ibadah, Kegiatan, Warta", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicNav />);

    const trigger = screen.getByRole("button", { name: "Informasi Jemaat" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const items = await screen.findAllByRole("link", { name: /Jadwal Ibadah|Kegiatan|Warta/ });
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Jadwal Ibadah", "/jadwal-ibadah"],
      ["Kegiatan", "/kegiatan"],
      ["Warta", "/warta"],
    ]);
  });

  it("opens with Enter on the keyboard, and Escape closes it and returns focus to the button", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicNav />);

    const trigger = screen.getByRole("button", { name: "Informasi Jemaat" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("link", { name: "Warta" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Warta" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("a click outside a submenu closes it", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(
      <div>
        <PublicNav />
        <button type="button">Luar menu</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Submenu Tentang Kami" }));
    expect(await screen.findByRole("link", { name: "Komisi" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Luar menu" }));
    expect(screen.queryByRole("link", { name: "Komisi" })).not.toBeInTheDocument();
  });
});

describe("public mobile nav (stage 11g)", () => {
  it("opens from the keyboard, with both accordions and a full-width Portal button", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicMobileNav />);

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Buka menu" });
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    const tentangKamiToggle = within(dialog).getByRole("button", { name: "Submenu Tentang Kami" });
    expect(tentangKamiToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByRole("link", { name: "Komisi" })).not.toBeInTheDocument();
    await user.click(tentangKamiToggle);
    expect(tentangKamiToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("link", { name: "Komisi" })).toBeInTheDocument();

    const informasiToggle = within(dialog).getByRole("button", { name: "Informasi Jemaat" });
    expect(informasiToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByRole("link", { name: "Warta" })).not.toBeInTheDocument();
    await user.click(informasiToggle);
    expect(informasiToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("link", { name: "Warta" })).toBeInTheDocument();

    expect(within(dialog).getByRole("link", { name: "Portal" })).toHaveAttribute("href", "/portal");
  });

  it("closes after choosing a top-level link", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicMobileNav />);
    await user.click(screen.getByRole("button", { name: "Buka menu" }));

    const dialog = await screen.findByRole("dialog");
    const kontak = within(dialog).getByRole("link", { name: "Kontak" });
    kontak.addEventListener("click", (event) => event.preventDefault());
    await user.click(kontak);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes after choosing a link inside the Informasi Jemaat accordion", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<PublicMobileNav />);
    await user.click(screen.getByRole("button", { name: "Buka menu" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Informasi Jemaat" }));
    const warta = within(dialog).getByRole("link", { name: "Warta" });
    warta.addEventListener("click", (event) => event.preventDefault());
    await user.click(warta);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
