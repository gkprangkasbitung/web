"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { PemilihanRow, StatusAksi } from "@/lib/pemilihan/admin-types";
import { konsekuensiAksi, LABEL_AKSI } from "@/lib/pemilihan/tampilan";

const TOAST: Record<StatusAksi, string> = {
  buka: "Pemilihan dibuka",
  tutup: "Pemilihan ditutup",
  umumkan: "Hasil pemilihan diumumkan",
};

/** Buka / Tutup / Umumkan behind a confirmation that names the consequences (brief §18.4). */
export function StatusConfirmDialog({
  row,
  aksi,
  open,
  onOpenChange,
  onDone,
}: {
  row: PemilihanRow;
  aksi: StatusAksi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  async function confirm() {
    try {
      await apiFetch(`/api/admin/pemilihan/${row.id}/status`, { method: "POST", body: { aksi } });
      toast.success(TOAST[aksi]);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${LABEL_AKSI[aksi]} "${row.nama}"?`}
      description={
        // Inside the dialog's <p>: block spans, not a list element.
        <span className="flex flex-col gap-1 text-left">
          {konsekuensiAksi(aksi, row).map((line) => (
            <span key={line} className="block">
              • {line}
            </span>
          ))}
        </span>
      }
      confirmLabel={LABEL_AKSI[aksi]}
      onConfirm={confirm}
    />
  );
}
