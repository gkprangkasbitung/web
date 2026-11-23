"use client";

import { useState } from "react";
import { toast } from "sonner";

import { hapusAkunLogin } from "@/app/jemaat/actions";
import { jemaatButtonClass } from "@/components/jemaat-portal/control-classes";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * "Hapus akun login" (brief §17.4): confirms, then calls the Server Action.
 * On success it redirects to /portal from inside the action itself (the
 * same `await action(); ` + plain catch shape the admin account menu's
 * "Keluar" already uses for its own redirecting action — the navigation is
 * driven by the router before the rejected promise ever reaches this catch).
 */
export function HapusAkunButton({ akun }: { akun: string }) {
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    const result = await hapusAkunLogin();
    if (result?.error) {
      toast.error(result.error);
      throw new Error(result.error);
    }
  }

  return (
    <>
      <Button type="button" variant="destructive" className={`${jemaatButtonClass} w-fit`} onClick={() => setOpen(true)}>
        Hapus akun login
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Hapus akun login ${akun}?`}
        description="Data Anda sebagai jemaat di gereja (profil, keluarga, riwayat pelayanan) tetap ada. Hanya akun untuk masuk ke Portal Jemaat ini yang dihapus, dan Anda akan keluar."
        confirmLabel="Hapus akun login"
        onConfirm={handleConfirm}
      />
    </>
  );
}
