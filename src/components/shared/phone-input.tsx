"use client";

import { Input } from "@/components/ui/input";
import { onlyDigits } from "@/lib/digits";

export type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> & {
  /** Digits only, as a string so a leading 0 is kept ("0812…"). */
  value: string;
  onValueChange: (value: string) => void;
};

/** Nomor HP/WA (brief §11): keeps digits only while typing or pasting. */
export function PhoneInput({ value, onValueChange, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(event) => {
        const next = onlyDigits(event.target.value);
        if (next !== value) onValueChange(next);
      }}
    />
  );
}
