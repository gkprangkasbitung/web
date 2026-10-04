import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  flattenPublicNav,
  isActivePublicPath,
  isDropdownActive,
  PORTAL_LINK,
  PUBLIC_NAV,
  visiblePublicNav,
  type PublicNavEntry,
} from "./nav";

const APP_DIR = join(import.meta.dirname, "..", "..", "app");

/** Whether `href` (fragment stripped) resolves to a real `page.tsx`, in the public group or at the app root. */
function pageExists(href: string): boolean {
  const segment = href.split("#")[0]!.slice(1); // drop the leading "/"
  return [join(APP_DIR, "(public)", segment, "page.tsx"), join(APP_DIR, segment, "page.tsx")].some(existsSync);
}

describe("public nav config (stage 11g)", () => {
  it("every visible menu item, and the Portal button, point at a page that exists", () => {
    for (const link of [...flattenPublicNav(), PORTAL_LINK]) {
      expect(pageExists(link.href), link.href).toBe(true);
    }
    expect(pageExists("/")).toBe(true);
  });

  it("hides a disabled top-level entry and a disabled dropdown item, and drops an empty dropdown", () => {
    const fixture: PublicNavEntry[] = [
      { kind: "link", href: "/a", label: "A" },
      { kind: "link", href: "/b", label: "B", enabled: false },
      {
        kind: "dropdown",
        href: "/c",
        label: "C",
        items: [
          { href: "/c", label: "C1" },
          { href: "/c/2", label: "C2", enabled: false },
        ],
      },
      {
        kind: "dropdown",
        href: "/d",
        label: "D",
        items: [{ href: "/d/1", label: "D1", enabled: false }],
      },
    ];
    const visible = visiblePublicNav(fixture);
    expect(visible.map((entry) => entry.label)).toEqual(["A", "C"]);
    expect(visible[1]).toMatchObject({ kind: "dropdown", items: [{ href: "/c", label: "C1" }] });
  });

  it("isActivePublicPath ignores a link's #fragment and matches sub-paths", () => {
    expect(isActivePublicPath("/tentang-kami", "/tentang-kami#pendeta")).toBe(true);
    expect(isActivePublicPath("/warta/2025-11-30-contoh", "/warta")).toBe(true);
    expect(isActivePublicPath("/wartawan", "/warta")).toBe(false);
    expect(isActivePublicPath("/warta", "/")).toBe(false);
    expect(isActivePublicPath("/", "/")).toBe(true);
  });

  it("isDropdownActive: /komisi/* and /tentang-kami/* both mark Tentang Kami active, other pages don't", () => {
    const tentangKami = PUBLIC_NAV.find((entry) => entry.kind === "dropdown" && entry.label === "Tentang Kami");
    if (!tentangKami || tentangKami.kind !== "dropdown") throw new Error("Tentang Kami dropdown not found");
    expect(isDropdownActive("/tentang-kami", tentangKami)).toBe(true);
    expect(isDropdownActive("/komisi", tentangKami)).toBe(true);
    expect(isDropdownActive("/komisi/majelis-pemuda", tentangKami)).toBe(true);
    expect(isDropdownActive("/pendeta-majelis", tentangKami)).toBe(true);
    expect(isDropdownActive("/warta", tentangKami)).toBe(false);
    expect(isDropdownActive("/", tentangKami)).toBe(false);
  });

  it("isDropdownActive: Informasi Jemaat has no page of its own, so it's active purely on its items", () => {
    const informasiJemaat = PUBLIC_NAV.find((entry) => entry.kind === "dropdown" && entry.label === "Informasi Jemaat");
    if (!informasiJemaat || informasiJemaat.kind !== "dropdown") throw new Error("Informasi Jemaat dropdown not found");
    expect(informasiJemaat.href).toBeUndefined();
    expect(isDropdownActive("/jadwal-ibadah", informasiJemaat)).toBe(true);
    expect(isDropdownActive("/kegiatan", informasiJemaat)).toBe(true);
    expect(isDropdownActive("/kegiatan/retret-pemuda", informasiJemaat)).toBe(true);
    expect(isDropdownActive("/warta", informasiJemaat)).toBe(true);
    expect(isDropdownActive("/warta/2025-11-30-contoh", informasiJemaat)).toBe(true);
    expect(isDropdownActive("/", informasiJemaat)).toBe(false);
    expect(isDropdownActive("/tentang-kami", informasiJemaat)).toBe(false);
  });

  it("flattenPublicNav drops Beranda and unwraps the dropdown into its own items, in order", () => {
    const flat = flattenPublicNav();
    expect(flat.map((link) => link.label)).toEqual([
      "Profil Gereja",
      "Pendeta & Majelis",
      "Komisi",
      "Jadwal Ibadah",
      "Kegiatan",
      "Warta",
      "Kontak",
    ]);
  });
});
