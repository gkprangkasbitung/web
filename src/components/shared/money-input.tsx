"use client";

import { cn } from "cn";
import { useLayoutEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatMoneyInput, onlyDigits, parseMoney } from "@/lib/digits";

export type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> & {
  /** Rupiah as a whole number; `null` when empty. */
  value: number | null;
  onValueChange: (value: number | null) => void;
};

/**
 * Amount input (brief §11): only digits are accepted while typing, the text
 * shows id-ID thousand separators ("1.000.000"), and the value is a number.
 * With a `name`, a hidden input carries the plain number for form posts.
 */
export function MoneyInput({ value, onValueChange, name, ref, ...props }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Bumped on every keystroke so the caret is restored even when a rejected
  // character leaves the value unchanged.
  const [caret, setCaret] = useState<{ position: number } | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caret && input && document.activeElement === input) {
      input.setSelectionRange(caret.position, caret.position);
    }
  }, [caret]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const next = parseMoney(raw);
    const text = formatMoneyInput(next);

    // Keep the caret after the same number of digits it followed before,
    // minus any leading zeros that were dropped.
    const digitsBefore = onlyDigits(raw.slice(0, event.target.selectionStart ?? raw.length));
    const droppedZeros = onlyDigits(raw).length - onlyDigits(text).length;
    let remaining = Math.max(0, digitsBefore.length - Math.max(0, droppedZeros));
    let position = 0;
    while (position < text.length && remaining > 0) {
      if (/\d/.test(text[position]!)) remaining -= 1;
      position += 1;
    }

    setCaret({ position });
    if (next !== value) onValueChange(next);
  }

  return (
    <>
      <Input
        {...props}
        ref={(node) => {
          inputRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatMoneyInput(value)}
        onChange={handleChange}
        className={cn("tabular-nums", props.className)}
      />
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </>
  );
}
