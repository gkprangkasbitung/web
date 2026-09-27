import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

function Harness({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title='Hapus tempat "Contoh Gedung"?'
      description="Jadwal yang memakai tempat ini akan dikosongkan."
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("names the record, starts on Batal, and shows a spinner while working", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Harness onConfirm={onConfirm} />);

    const dialog = await screen.findByRole("alertdialog", { name: 'Hapus tempat "Contoh Gedung"?' });
    expect(dialog).toHaveAccessibleDescription("Jadwal yang memakai tempat ini akan dikosongkan.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Batal" })).toHaveFocus());

    const confirm = within(dialog).getByRole("button", { name: "Hapus" });
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm.querySelector("svg")).not.toBeNull();

    // Escape is ignored while the action runs.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("stays open when the action fails", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => Promise.reject(new Error("gagal")));
    render(<Harness onConfirm={onConfirm} />);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Hapus" }));
    const confirm = within(dialog).getByRole("button", { name: "Hapus" });
    await waitFor(() => expect(confirm).not.toHaveAttribute("aria-disabled", "true"));
    expect(confirm.querySelector("svg")).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
