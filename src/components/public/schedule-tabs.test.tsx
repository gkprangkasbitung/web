import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { weekContaining, type DateRange } from "@/lib/dates";
import type { PublicScheduleRow } from "@/lib/public-schedule";

import { ScheduleTabs } from "./schedule-tabs";

function row(id: string, tanggal: string, categoryName: string): PublicScheduleRow {
  return {
    id,
    tanggal,
    jam: null,
    categoryKey: "umum",
    categoryName,
    tempatNama: null,
    wilayahNama: null,
    dpa: null,
    tema: null,
    pelayanFirmanNama: null,
    liturgosNama: null,
    pemusikNama: null,
    bahanAlkitab: null,
    kehadiranLakiLaki: null,
    kehadiranPerempuan: null,
    kehadiranAnak: null,
    catatan: null,
    smkaKelompok: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// Brief §9c instruction C: the day tabs default to today (Asia/Jakarta) and
// are usable with the keyboard alone.
describe("ScheduleTabs", () => {
  it("defaults to today's tab (Asia/Jakarta)", () => {
    vi.useFakeTimers();
    // 2025-12-03 is a Wednesday. 08:00 WIB = 2025-12-03T01:00:00Z.
    vi.setSystemTime(new Date("2025-12-03T01:00:00Z"));
    const week: DateRange = weekContaining();
    const rows = [row("r1", "2025-12-03", "Doa Pagi"), row("r2", "2025-12-04", "Pemahaman Alkitab")];

    render(<ScheduleTabs week={week} rows={rows} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    const active = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
    expect(active).toHaveTextContent("Rab 3");
    expect(screen.getByText("Doa Pagi")).toBeInTheDocument();
    expect(screen.queryByText("Pemahaman Alkitab")).toBeNull();
  });

  it("moves the selected day with the arrow keys alone", async () => {
    const user = userEvent.setup();
    const week = weekContaining("2025-11-30");
    const rows = [row("r1", "2025-11-30", "Kebaktian Minggu"), row("r2", "2025-12-01", "Doa Pagi")];

    render(<ScheduleTabs week={week} rows={rows} />);

    const tabsBefore = screen.getAllByRole("tab");
    const initiallyActive = tabsBefore.find((tab) => tab.getAttribute("aria-selected") === "true")!;
    initiallyActive.focus();

    await user.keyboard("{ArrowRight}");

    const tabsAfter = screen.getAllByRole("tab");
    const nowActive = tabsAfter.find((tab) => tab.getAttribute("aria-selected") === "true")!;
    expect(nowActive).not.toBe(initiallyActive);
    expect(nowActive).toHaveFocus();
  });

  it("shows a friendly message on a day with no schedule", () => {
    const week = weekContaining("2025-11-30");
    render(<ScheduleTabs week={week} rows={[]} />);
    expect(screen.getAllByText("Belum ada jadwal ibadah pada hari ini.").length).toBeGreaterThan(0);
  });
});
