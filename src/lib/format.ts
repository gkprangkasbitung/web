/** Groups digits with id-ID thousand separators: 1500000 -> "1.500.000". */
export function formatThousands(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** IDR without decimals: 1500000 -> "Rp 1.500.000", -2500 -> "−Rp 2.500". */
export function formatRupiah(value: number): string {
  const sign = Math.round(value) < 0 ? "−" : "";
  return `${sign}Rp ${formatThousands(value)}`;
}

/** Initials of the first and last word: "Maria Magdalena Siahaan" -> "MS". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}
