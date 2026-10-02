"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { isMelayani, type PendetaRow } from "@/lib/pendeta";
import type { ProfilGerejaRow } from "@/lib/profil-gereja";

import { ProfilSection } from "./profil-section";

const NONE = "__none__";

/**
 * Profil Gereja's Sambutan section (brief §14.7): the text stays free-form,
 * but the pastor is now picked from the pendeta table instead of typed name
 * and photo fields, sorted with currently-serving pastors first.
 */
export function SambutanSection({
  profil,
  pendeta,
  canWrite,
}: {
  profil: ProfilGerejaRow;
  pendeta: PendetaRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const errorId = `${id}-error`;
  const [teks, setTeks] = useState(profil.sambutan_teks ?? "");
  const [pendetaId, setPendetaId] = useState(profil.sambutan_pendeta_id ?? NONE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...pendeta].sort((a, b) => Number(isMelayani(b)) - Number(isMelayani(a)));
  const items: SelectOption<string>[] = [
    { value: NONE, label: "Tidak ada" },
    ...sorted.map((p) => ({ value: p.id, label: `${p.nama} — ${p.peran}` })),
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;

    setPending(true);
    setError(null);
    try {
      const row = await apiFetch<ProfilGerejaRow>("/api/admin/profil-gereja/sambutan", {
        method: "PATCH",
        body: { sambutanTeks: teks, pendetaId: pendetaId === NONE ? null : pendetaId },
      });
      setTeks(row.sambutan_teks ?? "");
      setPendetaId(row.sambutan_pendeta_id ?? NONE);
      toast.success("Bagian Sambutan disimpan");
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const disabled = !canWrite || pending;

  return (
    <ProfilSection title="Sambutan" description="Sambutan singkat dari pendeta di halaman utama.">
      <form noValidate onSubmit={submit} className="flex flex-col gap-5" aria-describedby={error ? errorId : undefined}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-teks`}>Teks sambutan</Label>
          <Textarea
            id={`${id}-teks`}
            value={teks}
            onChange={(event) => setTeks(event.target.value)}
            rows={5}
            maxLength={2000}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-pendeta`}>Pendeta</Label>
          <Select items={items} value={pendetaId} onValueChange={(value) => value && setPendetaId(value)} disabled={disabled}>
            <SelectTrigger id={`${id}-pendeta`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">Kelola daftar pendeta, foto, dan peran di halaman Pendeta.</p>
        </div>

        <FormError id={errorId} message={error} />

        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Kamu hanya bisa melihat bagian ini.</p>
        )}
      </form>
    </ProfilSection>
  );
}
