"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateLong, type DateRange } from "@/lib/dates";
import type { PersonOptionRow } from "@/lib/jemaat-routes";
import type { PeribadahanOverview } from "@/lib/peribadahan-routes";
import type { WartaFinanceItem } from "@/lib/sarana-dana-routes";
import { WARTA_DELETE_DESCRIPTION, type WartaDetail, type WartaKesaksianItemRow, type WartaLitbangItemRow } from "@/lib/warta";

import { WartaFinanceSection } from "./warta-finance-section";
import { WartaInfoSection } from "./warta-info-section";
import { WartaKesaksianSection } from "./warta-kesaksian-section";
import { WartaLitbangSection } from "./warta-litbang-section";
import { WartaPeribadahanSection } from "./warta-peribadahan-section";
import { WartaStatusBadge } from "./warta-status-badge";

export type WartaEditorProps = {
  warta: WartaDetail;
  litbang: WartaLitbangItemRow[];
  kesaksian: WartaKesaksianItemRow[];
  serviceWeek: DateRange;
  schedule: PeribadahanOverview;
  financeWeek: DateRange;
  finance: WartaFinanceItem[];
  peopleOptions: readonly PersonOptionRow[];
  /** `warta:update`: every edit, including Terbitkan / Tarik ke Draft. */
  canWrite: boolean;
  /** `warta:delete`: "Hapus Warta". */
  canDelete: boolean;
};

/** `/admin/warta/[id]` (brief §9.4). Read-only users see every section with disabled inputs and no actions. */
export function WartaEditor({
  warta,
  litbang,
  kesaksian,
  serviceWeek,
  schedule,
  financeWeek,
  finance,
  peopleOptions,
  canWrite,
  canDelete,
}: WartaEditorProps) {
  const router = useRouter();
  const [statusPending, setStatusPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isPublished = warta.status === "published";

  async function toggleStatus() {
    if (statusPending) return;
    setStatusPending(true);
    try {
      // The target status, not a toggle: two editors clicking "Terbitkan" both end up published.
      await apiFetch(`/api/admin/warta/${warta.id}`, {
        method: "PATCH",
        body: { status: isPublished ? "draft" : "published" },
      });
      toast.success(isPublished ? "Warta ditarik ke draft" : "Warta diterbitkan");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStatusPending(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/warta/${warta.id}`, { method: "DELETE" });
      toast.success("Warta dihapus");
      router.push("/admin/warta");
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/warta" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar warta
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{warta.judulKebaktian}</h1>
            <WartaStatusBadge status={warta.status} />
          </div>
          <p className="text-sm text-muted-foreground">{formatDateLong(warta.tanggalKebaktian)}</p>
          <p className="font-mono text-xs text-muted-foreground">{warta.slug}</p>
        </div>

        {(canWrite || canDelete) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canDelete && (
              <Button variant="outline" onClick={() => setDeleteOpen(true)} disabled={statusPending} focusableWhenDisabled>
                Hapus Warta
              </Button>
            )}
            {canWrite && (
              <Button onClick={toggleStatus} disabled={statusPending} focusableWhenDisabled>
                {statusPending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                {isPublished ? "Tarik ke Draft" : "Terbitkan"}
              </Button>
            )}
          </div>
        )}
      </div>

      <WartaInfoSection warta={warta} canWrite={canWrite} />
      <WartaPeribadahanSection
        range={serviceWeek}
        schedule={schedule}
        peopleOptions={peopleOptions}
        canWrite={canWrite}
      />
      <WartaLitbangSection wartaId={warta.id} items={litbang} canWrite={canWrite} />
      <WartaFinanceSection range={financeWeek} items={finance} peopleOptions={peopleOptions} canWrite={canWrite} />
      <WartaKesaksianSection wartaId={warta.id} items={kesaksian} canWrite={canWrite} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus "${warta.judulKebaktian}"?`}
        description={WARTA_DELETE_DESCRIPTION}
        onConfirm={remove}
      />
    </div>
  );
}
