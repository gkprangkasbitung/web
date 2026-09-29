import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDateCompact } from "@/lib/dates";

import { JadwalDialog } from "./jadwal-dialog";

const CATEGORIES = [{ id: "1", key: "umum", name: "Kebaktian Minggu" }];

afterEach(() => {
  vi.useRealTimers();
});

// Brief §13 #18: "Tambah Jadwal" defaults to next Sunday, or today when today
// is already Sunday, computed in Asia/Jakarta (never UTC or the browser's zone).
describe("JadwalDialog", () => {
  it("defaults Tanggal to today at 05:00 WIB on a Sunday", () => {
    vi.useFakeTimers();
    // 2025-11-30 is a Sunday. 05:00 WIB = 2025-11-29T22:00:00Z (WIB = UTC+7).
    vi.setSystemTime(new Date("2025-11-29T22:00:00Z"));

    render(<JadwalDialog open onOpenChange={() => {}} categories={CATEGORIES} onCreated={() => {}} />);
    expect(screen.getByText(formatDateCompact("2025-11-30"))).toBeInTheDocument();
  });

  it("defaults Tanggal to the next day (Sunday) at 23:00 WIB on a Saturday", () => {
    vi.useFakeTimers();
    // 2025-11-29 is a Saturday. 23:00 WIB = 2025-11-29T16:00:00Z.
    vi.setSystemTime(new Date("2025-11-29T16:00:00Z"));

    render(<JadwalDialog open onOpenChange={() => {}} categories={CATEGORIES} onCreated={() => {}} />);
    expect(screen.getByText(formatDateCompact("2025-11-30"))).toBeInTheDocument();
  });
});
