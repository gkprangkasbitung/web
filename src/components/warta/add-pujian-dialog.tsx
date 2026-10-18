"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { PUJIAN_BUKU, type PujianBuku } from "@/lib/warta";

const BUKU_ITEMS = PUJIAN_BUKU.map((buku) => ({ value: buku, label: buku }));

/** "Tambah Pujian": Buku, Nomor, Keterangan; the row goes last. */
export function AddPujianDialog({
  wartaId,
  open,
  onOpenChange,
  onSaved,
}: {
  wartaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const [buku, setBuku] = useState<PujianBuku>("KJ");
  const [nomor, setNomor] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/pujian`, { method: "POST", body: { buku, nomor, keterangan } });
      onOpenChange(false);
      setNomor("");
      setKeterangan("");
      onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Pujian</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-buku`}>Buku</Label>
            <Select items={BUKU_ITEMS} value={buku} onValueChange={(value) => value && setBuku(value)} disabled={pending}>
              <SelectTrigger id={`${formId}-buku`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUJIAN_BUKU.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-nomor`}>Nomor</Label>
            <Input
              id={`${formId}-nomor`}
              value={nomor}
              onChange={(event) => setNomor(event.target.value)}
              maxLength={20}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-keterangan`}>Keterangan</Label>
            <Input
              id={`${formId}-keterangan`}
              value={keterangan}
              onChange={(event) => setKeterangan(event.target.value)}
              maxLength={200}
              placeholder="Mis. bait 1-3"
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <FormError id={errorId} message={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Batal</DialogClose>
          <Button type="submit" form={formId} disabled={pending} focusableWhenDisabled>
            {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
