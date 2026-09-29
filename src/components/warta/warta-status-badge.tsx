import { Badge } from "@/components/ui/badge";
import { WARTA_STATUS_LABELS, type WartaStatus } from "@/lib/warta";

/** "Published" or "Draft" (brief §9.4); always a text label, never color alone. */
export function WartaStatusBadge({ status }: { status: WartaStatus }) {
  return <Badge variant={status === "published" ? "accent" : "neutral"}>{WARTA_STATUS_LABELS[status]}</Badge>;
}
