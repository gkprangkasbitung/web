"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { DatePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { nextSunday, type IsoDate } from "@/lib/dates";
import type { PeribadahanCategoryOption } from "@/lib/peribadahan-routes";

export type JadwalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly PeribadahanCategoryOption[];
  /** Hides the Jenis select and always uses this key (a category-scoped page). */
  fixedCategoryKey?: string;
  /** Default Tanggal; falls back to next Sunday (brief §9.5). Stage 9 passes the warta's kebaktian date instead. */
  defaultDate?: IsoDate;
  /** Inclusive bounds; stage 9 passes the warta's service week here (brief §12.5). */
  minDate?: IsoDate;
  maxDate?: IsoDate;
  onCreated: () => void;
};

/**
 * "Tambah Jadwal" (brief §9.5): only Tanggal, Jenis (hidden on a
 * category-scoped page), and Waktu — the rest is filled in via Edit
 * afterward. Reusable inside a warta's Bidang Peribadahan section (§12.5)
 * through `defaultDate`/`minDate`/`maxDate`.
 */
export function JadwalDialog({
  open,
  onOpenChange,
  categories,
  fixedCategoryKey,
  defaultDate,
  minDate,
  maxDate,
  onCreated,
}: JadwalDialogProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  // Lazy initial state only: the caller remounts this component (a fresh
  // `key`) each time it opens, so these start over without an effect.
  const [tanggal, setTanggal] = useState<IsoDate>(() => defaultDate ?? nextSunday());
  const [categoryKey, setCategoryKey] = useState<string | null>(fixedCategoryKey ?? null);
  const [jam, setJam] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const key = fixedCategoryKey ?? categoryKey;
    if (!key) {
      setError("Jenis wajib diisi.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/peribadahan", {
        method: "POST",
        body: { categoryKey: key, tanggal, jam: jam || null },
      });
      toast.success("Baris ditambahkan - lengkapi detailnya lewat menu Edit");
      onOpenChange(false);
      onCreated();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Tambah Jadwal</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-describedby={error ? errorId : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-tanggal`}>
              Tanggal{" "}
              <span className="text-muted-foreground" aria-hidden>
                *
              </span>
            </Label>
            <DatePicker
              id={`${formId}-tanggal`}
              value={tanggal}
              onValueChange={(value) => value && setTanggal(value)}
              clearable={false}
              disabled={pending}
              minDate={minDate}
              maxDate={maxDate}
            />
          </div>

          {!fixedCategoryKey && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-jenis`}>
                Jenis{" "}
                <span className="text-muted-foreground" aria-hidden>
                  *
                </span>
              </Label>
              <Select value={categoryKey} onValueChange={setCategoryKey} disabled={pending}>
                <SelectTrigger id={`${formId}-jenis`} className="w-full">
                  <SelectValue placeholder="Pilih jenis" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.key} value={category.key}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-waktu`}>Waktu</Label>
            <Input
              id={`${formId}-waktu`}
              type="time"
              value={jam}
              onChange={(event) => setJam(event.target.value)}
              disabled={pending}
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
