import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const ITEMS = [
  { value: "smka", label: "Kebaktian SMKA" },
  { value: "umum", label: "Kebaktian Umum" },
];

function Harness({
  initialValue = null,
  onValueChange,
}: {
  initialValue?: string | null;
  onValueChange?: (value: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <Select
      items={ITEMS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      <SelectTrigger aria-label="Jenis">
        <SelectValue placeholder="Pilih jenis" />
      </SelectTrigger>
      <SelectContent>
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the option's label in the trigger after picking it, and sends the key to onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox", { name: "Jenis" }));
    await user.click(await screen.findByRole("option", { name: "Kebaktian SMKA" }));

    expect(screen.getByRole("combobox", { name: "Jenis" })).toHaveTextContent("Kebaktian SMKA");
    expect(screen.queryByText("smka")).not.toBeInTheDocument();
    expect(onValueChange).toHaveBeenCalledWith("smka");
  });

  it("shows the label immediately for a value already set, without the user picking it", () => {
    render(<Harness initialValue="umum" />);

    expect(screen.getByRole("combobox", { name: "Jenis" })).toHaveTextContent("Kebaktian Umum");
  });

  it("shows a clear fallback, not the raw value, when the value isn't among the options", () => {
    render(<Harness initialValue="deleted-category" />);

    const trigger = screen.getByRole("combobox", { name: "Jenis" });
    expect(trigger).toHaveTextContent("Tidak ditemukan");
    expect(trigger).not.toHaveTextContent("deleted-category");
  });

  it("shows the placeholder, not a fallback, when nothing is selected and null isn't one of the options", () => {
    render(<Harness initialValue={null} />);

    expect(screen.getByRole("combobox", { name: "Jenis" })).toHaveTextContent("Pilih jenis");
  });
});
