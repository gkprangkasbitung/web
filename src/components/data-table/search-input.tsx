"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

export type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Milliseconds to wait after typing; server-side tables use it to avoid a request per key. */
  debounceMs?: number;
};

/**
 * Text input for table filters. While a debounced change is in flight it
 * shows the typed draft; once `value` changes (the filter applied, or was
 * reset elsewhere) it follows `value` again.
 */
export function SearchInput({ value, onValueChange, debounceMs = 0, ...props }: SearchInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [lastValue, setLastValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(null);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Input
      type="search"
      autoComplete="off"
      {...props}
      value={draft ?? value}
      onChange={(event) => {
        const next = event.target.value;
        if (debounceMs <= 0) {
          onValueChange(next);
          return;
        }
        setDraft(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onValueChange(next), debounceMs);
      }}
    />
  );
}
