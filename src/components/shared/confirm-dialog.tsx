"use client";

import { Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the record, for example `Hapus tempat "Gedung Serbaguna"?`. */
  title: string;
  /** The consequence of confirming. */
  description?: React.ReactNode;
  confirmLabel?: string;
  /**
   * Runs the action. The dialog closes when it resolves; when it rejects the
   * dialog stays open so the caller can show the error (toast) and the user
   * can retry or cancel.
   */
  onConfirm: () => Promise<unknown> | unknown;
};

/**
 * Confirmation for destructive actions (brief §2). Focus starts on "Batal",
 * and while the action runs the dialog can't be dismissed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description = "Tindakan ini tidak bisa dibatalkan.",
  confirmLabel = "Hapus",
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the error; keep the dialog open.
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} aria-busy={pending || undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={pending}>
            Batal
          </AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending} focusableWhenDisabled>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
