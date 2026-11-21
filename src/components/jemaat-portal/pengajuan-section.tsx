"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { batalkanPengajuanAction, submitPengajuanAction } from "@/app/jemaat/profil/actions";
import { jemaatButtonClass, jemaatFieldClass } from "@/components/jemaat-portal/control-classes";
import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTimestamp } from "@/lib/dates";
import {
  PENGAJUAN_FIELD_LABELS,
  PENGAJUAN_STATUS_LABELS,
  pengajuanFields,
  pengajuanInputSchema,
  type PengajuanField,
  type PengajuanSaya,
  type PengajuanStatus,
  type ProfilSaya,
} from "@/lib/portal/types";

const STATUS_BADGE: Record<PengajuanStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  menunggu: "outline-accent",
  disetujui: "accent",
  ditolak: "destructive",
  dibatalkan: "neutral",
};

type FormValues = { no_hp: string; alamat: string; pekerjaan: string };

function valuesFromProfil(profil: ProfilSaya | null): FormValues {
  return { no_hp: profil?.noHp ?? "", alamat: profil?.alamat ?? "", pekerjaan: profil?.pekerjaan ?? "" };
}

/**
 * "Ajukan perubahan data" (brief §17.2, §17.3): a form for no_hp, alamat,
 * and pekerjaan, the latest request's status as a badge with its catatan
 * admin, and "Batalkan" while it's still menunggu. Submitting while one is
 * already menunggu is refused by the database; the button is disabled first
 * so that round trip almost never happens.
 */
export function PengajuanSection({
  profil,
  latestPengajuan,
}: {
  profil: ProfilSaya | null;
  latestPengajuan: PengajuanSaya | null;
}) {
  const router = useRouter();
  const formId = useId();
  const errorId = `${formId}-error`;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => valuesFromProfil(profil));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<PengajuanField | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const isMenunggu = latestPengajuan?.status === "menunggu";

  function openDialog() {
    setValues(valuesFromProfil(profil));
    setError(null);
    setInvalidField(null);
    setDialogOpen(true);
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = pengajuanInputSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(issue.message);
      const field = issue.path[0];
      setInvalidField(field === "no_hp" || field === "alamat" || field === "pekerjaan" ? field : null);
      return;
    }

    setPending(true);
    setError(null);
    setInvalidField(null);
    const result = await submitPengajuanAction(parsed.data);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Pengajuan perubahan data terkirim.");
    setDialogOpen(false);
    router.refresh();
  }

  async function handleCancel() {
    if (!latestPengajuan) return;
    const result = await batalkanPengajuanAction(latestPengajuan.id);
    if (!result.ok) {
      toast.error(result.message);
      throw new Error(result.message);
    }
    toast.success("Pengajuan dibatalkan.");
    router.refresh();
  }

  return (
    <section aria-labelledby="pengajuan-perubahan" className="flex flex-col gap-4">
      <h2 id="pengajuan-perubahan" className="font-serif text-xl font-normal">
        Ajukan Perubahan Data
      </h2>
      <p className="text-sm text-muted-foreground">
        Ingin mengubah No. HP, alamat, atau pekerjaan? Ajukan di sini; pengurus akan meninjaunya.
      </p>

      {latestPengajuan && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Status pengajuan terakhir (diajukan {formatTimestamp(latestPengajuan.createdAt)}):
            </span>
            <Badge variant={STATUS_BADGE[latestPengajuan.status]}>{PENGAJUAN_STATUS_LABELS[latestPengajuan.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Perubahan: {pengajuanFields(latestPengajuan.data).map((field) => PENGAJUAN_FIELD_LABELS[field]).join(", ")}
          </p>
          {latestPengajuan.catatanAdmin && (
            <p className="text-sm">
              <span className="font-medium">Catatan pengurus: </span>
              {latestPengajuan.catatanAdmin}
            </p>
          )}
          {isMenunggu && (
            <Button
              type="button"
              variant="outline"
              className={`${jemaatButtonClass} w-fit`}
              onClick={() => setCancelOpen(true)}
            >
              Batalkan pengajuan
            </Button>
          )}
        </div>
      )}

      <Button
        type="button"
        className={`${jemaatButtonClass} w-fit`}
        onClick={openDialog}
        disabled={isMenunggu}
        aria-describedby={isMenunggu ? "pengajuan-menunggu-note" : undefined}
      >
        Ajukan perubahan data
      </Button>
      {isMenunggu && (
        <p id="pengajuan-menunggu-note" className="text-sm text-muted-foreground">
          Masih ada pengajuan yang menunggu ditinjau. Batalkan dulu untuk mengajukan yang baru.
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={(next) => !pending && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajukan Perubahan Data</DialogTitle>
            <DialogDescription>Isi data yang baru. Pengurus akan meninjau sebelum diterapkan.</DialogDescription>
          </DialogHeader>
          <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" aria-describedby={error ? errorId : undefined}>
            <FormError id={errorId} message={error} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-no-hp`} className="text-base">
                No. HP
              </Label>
              <PhoneInput
                id={`${formId}-no-hp`}
                value={values.no_hp}
                onValueChange={(value) => set("no_hp", value)}
                placeholder="08123456789"
                className={jemaatFieldClass}
                aria-invalid={invalidField === "no_hp" || undefined}
                aria-describedby={invalidField === "no_hp" ? errorId : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-alamat`} className="text-base">
                Alamat
              </Label>
              <Textarea
                id={`${formId}-alamat`}
                value={values.alamat}
                onChange={(event) => set("alamat", event.target.value)}
                rows={3}
                className={`${jemaatFieldClass} h-auto py-2.5`}
                aria-invalid={invalidField === "alamat" || undefined}
                aria-describedby={invalidField === "alamat" ? errorId : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-pekerjaan`} className="text-base">
                Pekerjaan
              </Label>
              <Input
                id={`${formId}-pekerjaan`}
                value={values.pekerjaan}
                onChange={(event) => set("pekerjaan", event.target.value)}
                className={jemaatFieldClass}
                aria-invalid={invalidField === "pekerjaan" || undefined}
                aria-describedby={invalidField === "pekerjaan" ? errorId : undefined}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" className={jemaatButtonClass} onClick={() => setDialogOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" form={formId} className={jemaatButtonClass} disabled={pending}>
              Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Batalkan pengajuan perubahan data?"
        description="Pengajuan ini tidak akan diterapkan. Anda bisa mengajukan lagi kapan saja."
        confirmLabel="Batalkan"
        onConfirm={handleCancel}
      />
    </section>
  );
}
