import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MoneyInput } from "./money-input";
import { PhoneInput } from "./phone-input";

function Money({ initial = null, onValue }: { initial?: number | null; onValue?: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <MoneyInput
      aria-label="Jumlah"
      name="jumlah"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe("MoneyInput", () => {
  it("shows a stored number with id-ID separators", () => {
    render(<Money initial={1_000_000} />);
    expect(screen.getByRole("textbox", { name: "Jumlah" })).toHaveValue("1.000.000");
  });

  it("turns typed digits into a number and drops everything else", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    const { container } = render(<Money onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Jumlah" });

    await user.type(input, "1a0b0.0-0,0x0");
    expect(input).toHaveValue("1.000.000");
    expect(onValue).toHaveBeenLastCalledWith(1_000_000);
    expect(container.querySelector('input[type="hidden"][name="jumlah"]')).toHaveValue("1000000");

    await user.clear(input);
    expect(input).toHaveValue("");
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("reads pasted grouped text", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Money onValue={onValue} />);
    await user.click(screen.getByRole("textbox", { name: "Jumlah" }));
    await user.paste("Rp 2.500.000");
    expect(screen.getByRole("textbox", { name: "Jumlah" })).toHaveValue("2.500.000");
    expect(onValue).toHaveBeenLastCalledWith(2_500_000);
  });

  it("keeps the caret after the same digit when editing in the middle", async () => {
    const user = userEvent.setup();
    render(<Money initial={100_000} />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Jumlah" });
    // "100.000": put the caret after the leading "1" and type "5".
    await user.click(input);
    input.setSelectionRange(1, 1);
    await user.keyboard("5");
    expect(input).toHaveValue("1.500.000");
    expect(input.selectionStart).toBe(3);
  });
});

describe("PhoneInput", () => {
  it("keeps digits only, including a leading zero", async () => {
    const user = userEvent.setup();
    function Phone() {
      const [value, setValue] = useState("");
      return <PhoneInput aria-label="Nomor HP/WA" value={value} onValueChange={setValue} />;
    }
    render(<Phone />);
    const input = screen.getByRole("textbox", { name: "Nomor HP/WA" });
    await user.type(input, "0812-34a56");
    expect(input).toHaveValue("08123456");
  });
});
