import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import type { RowActionsConfig } from "./row-actions";
import { CONTOH_COLUMNS } from "./testing/columns";
import { CONTOH_JEMAAT, CONTOH_JEMAAT_COUNT, CONTOH_STATUS_LABEL, type ContohJemaat } from "./testing/fixtures";
import { useDataTable } from "./use-data-table";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: React.ComponentProps<"a"> & { href: string }) => <a href={href} {...props} />,
}));

function Harness({
  data = CONTOH_JEMAAT,
  canWrite = true,
  rowActions,
  onRows,
}: {
  data?: ContohJemaat[];
  canWrite?: boolean;
  rowActions?: RowActionsConfig<ContohJemaat>;
  onRows?: (rows: ContohJemaat[]) => void;
}) {
  const table = useDataTable({ data, columns: CONTOH_COLUMNS, getRowId: (row) => row.id });
  onRows?.(table.filteredRows);
  return (
    <DataTable
      table={table}
      label="Contoh Jemaat"
      noun="jemaat"
      canWrite={canWrite}
      addAction={<button type="button">Tambah Jemaat</button>}
      rowActions={rowActions}
    />
  );
}

/** Names in the body, top to bottom. */
function visibleNames(): string[] {
  const [, body] = screen.getAllByRole("rowgroup");
  return within(body!)
    .queryAllByRole("row")
    .map((row) => within(row).queryAllByRole("cell")[1]?.querySelector(".font-medium")?.textContent ?? "");
}

function header(name: string) {
  return screen.getByRole("columnheader", { name: new RegExp(`^${name}`) });
}

function rangeText() {
  return screen.getByText(/ dari \d+ jemaat$/).textContent;
}

async function tabTo(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  for (let i = 0; i < 100 && document.activeElement !== element; i++) await user.tab();
  expect(document.activeElement).toBe(element);
}

const sortedNumbers = CONTOH_JEMAAT.map((row) => Number(row.nama.split(" ").pop())).sort((a, b) => a - b);

describe("sorting", () => {
  it("cycles ascending → descending → unsorted, with one indicator", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const original = visibleNames();
    const sortButton = within(header("Nama")).getByRole("button", { name: "Nama" });

    expect(header("Nama")).toHaveAttribute("aria-sort", "none");
    expect(header("No. Anggota")).not.toHaveAttribute("aria-sort");

    await user.click(sortButton);
    expect(header("Nama")).toHaveAttribute("aria-sort", "ascending");
    // Indonesian collation with numeric order: 1, 2, 3 … not 1, 10, 11.
    expect(visibleNames().slice(0, 3)).toEqual(sortedNumbers.slice(0, 3).map((n) => `Jemaat Contoh ${n}`));
    expect(sortButton.querySelector("svg")).not.toBeNull();
    expect(within(header("Persembahan")).getByRole("button").querySelector("svg")).toBeNull();

    await user.click(sortButton);
    expect(header("Nama")).toHaveAttribute("aria-sort", "descending");
    expect(visibleNames()[0]).toBe(`Jemaat Contoh ${CONTOH_JEMAAT_COUNT}`);

    await user.click(sortButton);
    expect(header("Nama")).toHaveAttribute("aria-sort", "none");
    expect(sortButton.querySelector("svg")).toBeNull();
    expect(visibleNames()).toEqual(original);
  });

  it("sorts blank values last in both directions", async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);
    const sortButton = within(header("Persembahan")).getByRole("button", { name: "Persembahan" });

    await user.click(sortButton);
    let rows: ContohJemaat[] = onRows.mock.lastCall![0];
    expect(rows.at(-1)!.persembahan).toBeNull();
    expect(rows[0]!.persembahan).toBe(Math.min(...rows.filter((r) => r.persembahan !== null).map((r) => r.persembahan!)));

    await user.click(sortButton);
    rows = onRows.mock.lastCall![0];
    expect(rows.at(-1)!.persembahan).toBeNull();
    expect(rows[0]!.persembahan).toBe(Math.max(...rows.map((r) => r.persembahan ?? 0)));
  });
});

describe("filters", () => {
  it("combines facets and column search with AND, counts per option, and resets", async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);

    // Wilayah facet: every value present, with its row count, blanks last as "Tanpa Wilayah".
    await user.click(screen.getByRole("button", { name: "Filter Wilayah" }));
    const wilayahOptions = await screen.findAllByRole("menuitemcheckbox");
    const count = (predicate: (row: ContohJemaat) => boolean) => CONTOH_JEMAAT.filter(predicate).length;
    expect(wilayahOptions.map((option) => option.textContent)).toEqual([
      `Contoh Wilayah Selatan${count((r) => r.wilayah === "Contoh Wilayah Selatan")}`,
      `Contoh Wilayah Timur${count((r) => r.wilayah === "Contoh Wilayah Timur")}`,
      `Contoh Wilayah Utara${count((r) => r.wilayah === "Contoh Wilayah Utara")}`,
      `Tanpa Wilayah${count((r) => r.wilayah === null)}`,
    ]);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /^Contoh Wilayah Utara/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Filter Wilayah, 1 dipilih" })).toHaveTextContent("1 dipilih");

    // Status counts follow the Wilayah filter (but not their own).
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await screen.findAllByRole("menuitemcheckbox");
    const inUtara = (row: ContohJemaat) => row.wilayah === "Contoh Wilayah Utara";
    for (const status of ["anggota_penuh", "sidi"] as const) {
      const expected = count((r) => inUtara(r) && r.status === status);
      expect(screen.getByRole("menuitemcheckbox", { name: new RegExp(`^${CONTOH_STATUS_LABEL[status]}`) })).toHaveTextContent(
        `${CONTOH_STATUS_LABEL[status]}${expected}`,
      );
    }
    await user.click(screen.getByRole("menuitemcheckbox", { name: /^Anggota Penuh/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /^Sidi/ }));
    await user.keyboard("{Escape}");

    const facetMatch = (row: ContohJemaat) => inUtara(row) && (row.status === "anggota_penuh" || row.status === "sidi");
    expect(onRows.mock.lastCall![0]).toHaveLength(count(facetMatch));

    // Column search on Nama narrows further (case-insensitive "contains").
    await user.click(screen.getByRole("button", { name: "Cari Nama" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari Nama" }), "CONTOH 1");
    await user.keyboard("{Enter}");
    const all = (row: ContohJemaat) => facetMatch(row) && row.nama.toLowerCase().includes("contoh 1");
    const expected = CONTOH_JEMAAT.filter(all);
    expect(expected.length).toBeGreaterThan(0);
    expect(onRows.mock.lastCall![0]).toEqual(expected);
    expect(rangeText()).toBe(`1–${expected.length} dari ${expected.length} jemaat`);

    // Filters survive sorting.
    await user.click(within(header("Nama")).getByRole("button", { name: "Nama" }));
    expect(onRows.mock.lastCall![0]).toHaveLength(expected.length);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(onRows.mock.lastCall![0]).toHaveLength(CONTOH_JEMAAT_COUNT);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter Wilayah" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cari Nama" })).toBeInTheDocument();
  });

  it("says when filters hide every row, and resets from there", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Cari Nama" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari Nama" }), "tidak ada yang cocok");
    await user.keyboard("{Enter}");

    expect(screen.getByText("Tidak ada jemaat yang cocok dengan filter ini.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(rangeText()).toBe(`1–10 dari ${CONTOH_JEMAAT_COUNT} jemaat`);
  });
});

describe("pagination", () => {
  it("counts the filtered rows and returns to page 1 on a page size change", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(rangeText()).toBe("1–10 dari 57 jemaat");
    expect(visibleNames()).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(rangeText()).toBe("21–30 dari 57 jemaat");

    await user.click(screen.getByRole("combobox", { name: "Jumlah baris per halaman" }));
    await user.click(await screen.findByRole("option", { name: "20" }));
    expect(rangeText()).toBe("1–20 dari 57 jemaat");
    expect(visibleNames()).toHaveLength(20);

    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(rangeText()).toBe("41–57 dari 57 jemaat");
    expect(screen.getByRole("button", { name: "Halaman berikutnya" })).toBeDisabled();
  });

  it("exposes every filtered row for export, not only the page", async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);
    await user.click(screen.getByRole("button", { name: "Filter Wilayah" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /^Contoh Wilayah Utara/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /^Contoh Wilayah Selatan/ }));
    await user.keyboard("{Escape}");

    const expected = CONTOH_JEMAAT.filter((r) => r.wilayah === "Contoh Wilayah Utara" || r.wilayah === "Contoh Wilayah Selatan");
    expect(expected.length).toBeGreaterThan(10);
    expect(visibleNames()).toHaveLength(10);
    expect(onRows.mock.lastCall![0]).toEqual(expected);
  });
});

describe("empty and read-only states", () => {
  it("offers the add action only with write access", () => {
    const { unmount } = render(<Harness data={[]} />);
    expect(screen.getByText("Belum ada jemaat.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah Jemaat" })).toBeInTheDocument();
    expect(screen.queryByText(/ dari \d+ jemaat$/)).toBeNull();
    unmount();

    render(<Harness data={[]} canWrite={false} />);
    expect(screen.getByText("Belum ada jemaat.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Jemaat" })).toBeNull();
  });

  it("shows Lihat instead of Edit and hides Hapus and write actions", async () => {
    const user = userEvent.setup();
    const actions: RowActionsConfig<ContohJemaat> = {
      getRowLabel: (row) => row.nama,
      edit: { href: (row) => `/admin/jemaat/${row.id}` },
      extra: [
        { label: "Lihat Riwayat", onSelect: () => {} },
        { label: "Arsipkan", onSelect: () => {}, write: true },
      ],
      delete: { title: (row) => `Hapus ${row.nama}?`, onConfirm: () => {} },
    };
    const { unmount } = render(<Harness rowActions={actions} />);
    const first = CONTOH_JEMAAT[0]!;
    await user.click(screen.getByRole("button", { name: `Aksi untuk ${first.nama}` }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute("href", `/admin/jemaat/${first.id}`);
    expect(screen.getByRole("menuitem", { name: "Arsipkan" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Hapus" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    unmount();

    render(<Harness rowActions={actions} canWrite={false} />);
    await user.click(screen.getByRole("button", { name: `Aksi untuk ${first.nama}` }));
    expect(await screen.findByRole("menuitem", { name: "Lihat" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Lihat Riwayat" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Arsipkan" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
  });
});

describe("keyboard", () => {
  it("sorts, opens the row menu, and confirms a delete without a mouse", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const first = CONTOH_JEMAAT[0]!;
    render(
      <Harness
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: () => {} },
          delete: { title: (row) => `Hapus ${row.nama}?`, onConfirm },
        }}
      />,
    );

    // Sort with Enter on the header button.
    await tabTo(user, within(header("Nama")).getByRole("button", { name: "Nama" }));
    await user.keyboard("{Enter}");
    expect(header("Nama")).toHaveAttribute("aria-sort", "ascending");
    await user.keyboard(" ");
    expect(header("Nama")).toHaveAttribute("aria-sort", "descending");
    await user.keyboard(" ");
    expect(header("Nama")).toHaveAttribute("aria-sort", "none");

    // Open the row menu and choose Hapus with the arrow keys.
    const trigger = screen.getByRole("button", { name: `Aksi untuk ${first.nama}` });
    await tabTo(user, trigger);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Hapus" })).toHaveFocus();
    await user.keyboard("{Enter}");

    // The dialog names the record and starts on "Batal"; Escape cancels.
    const dialog = await screen.findByRole("alertdialog", { name: `Hapus ${first.nama}?` });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Batal" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    // Again, this time Tab to "Hapus" and confirm.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");
    const again = await screen.findByRole("alertdialog");
    await waitFor(() => expect(within(again).getByRole("button", { name: "Batal" })).toHaveFocus());
    await user.tab();
    expect(within(again).getByRole("button", { name: "Hapus" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(first);
  });
});
