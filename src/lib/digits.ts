import { formatThousands } from "@/lib/format";

/** Money inputs cap at 15 digits so values stay exact JavaScript numbers. */
export const MAX_MONEY_DIGITS = 15;

/** Keeps only the ASCII digits 0–9: "+62 812-34" -> "6281234". */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Parses what the user typed into a money input: every non-digit is dropped,
 * then leading zeros. "1.000.000" -> 1000000, "Rp 2a5" -> 25, "" -> null.
 */
export function parseMoney(text: string): number | null {
  const digits = onlyDigits(text).replace(/^0+(?=\d)/, "").slice(0, MAX_MONEY_DIGITS);
  return digits === "" ? null : Number(digits);
}

/** The display text of a money input: 1000000 -> "1.000.000", null -> "". */
export function formatMoneyInput(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : formatThousands(value);
}
