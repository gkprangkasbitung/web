import { Badge } from "@/components/ui/badge";
import { PEMILIHAN_STATUS_LABELS, type PemilihanStatus } from "@/lib/pemilihan/types";

const VARIANT = {
  draft: "neutral",
  dibuka: "accent",
  ditutup: "outline",
  diumumkan: "outline-accent",
} as const satisfies Record<PemilihanStatus, "neutral" | "accent" | "outline" | "outline-accent">;

export function PemilihanStatusBadge({ status }: { status: PemilihanStatus }) {
  return <Badge variant={VARIANT[status]}>{PEMILIHAN_STATUS_LABELS[status]}</Badge>;
}
