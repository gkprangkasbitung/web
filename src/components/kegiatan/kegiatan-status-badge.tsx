import { Badge } from "@/components/ui/badge";
import { KEGIATAN_STATUS_LABELS, type KegiatanStatus } from "@/lib/kegiatan";

/** "Published" or "Draft" (brief §14.4); always a text label, never color alone. */
export function KegiatanStatusBadge({ status }: { status: KegiatanStatus }) {
  return <Badge variant={status === "published" ? "accent" : "neutral"}>{KEGIATAN_STATUS_LABELS[status]}</Badge>;
}
