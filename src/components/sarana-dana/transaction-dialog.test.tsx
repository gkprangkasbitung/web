import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDateCompact } from "@/lib/dates";

import { TransactionDialog } from "./transaction-dialog";

afterEach(() => {
  vi.useRealTimers();
});

// Brief §13 #18: "Tambah Transaksi" defaults Tanggal to today in Asia/Jakarta.
describe("TransactionDialog", () => {
  it("defaults Tanggal to today at 05:00 WIB on a Sunday", () => {
    vi.useFakeTimers();
    // 05:00 WIB on 2025-11-30 = 2025-11-29T22:00:00Z (WIB = UTC+7).
    vi.setSystemTime(new Date("2025-11-29T22:00:00Z"));

    render(
      <TransactionDialog
        open
        onOpenChange={() => {}}
        itemKey="kas_jemaat"
        isPersembahanBulanan={false}
        row={null}
        peopleOptions={[]}
        readOnly={false}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByText(formatDateCompact("2025-11-30"))).toBeInTheDocument();
  });
});
