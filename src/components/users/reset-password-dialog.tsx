"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PasswordTable, PrintSlipsButton, SHOWN_ONCE, type SlipAccount } from "./password-slips";

/**
 * The new temporary password after "Reset Password" (brief §18.7), shown
 * once with "Cetak Slip". Closing asks first, because the password can't be
 * shown again.
 */
export function ResetPasswordResultDialog({
  account,
  onClose,
}: {
  account: SlipAccount | null;
  onClose: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);

  return (
    <>
      <Dialog open={account !== null} onOpenChange={(next) => !next && setConfirmClose(true)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Password Direset</DialogTitle>
            <DialogDescription>
              {SHOWN_ONCE} Akun ini sudah dikeluarkan dari semua perangkat dan wajib membuat password baru saat masuk.
            </DialogDescription>
          </DialogHeader>
          {account && <PasswordTable accounts={[account]} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(true)}>
              Selesai
            </Button>
            {account && <PrintSlipsButton accounts={[account]} />}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Tutup password sementara?"
        description="Setelah ditutup, password sementara tidak bisa ditampilkan lagi. Kalau slip belum dicetak, password harus direset ulang."
        confirmLabel="Tutup"
        onConfirm={onClose}
      />
    </>
  );
}
