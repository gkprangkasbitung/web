"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { HUBUNGAN_KELUARGA, type HubunganKeluarga } from "@/lib/jemaat";

/** The inline hubungan editor in the members table (brief §9.10): "Simpan" enables only after a change. */
export function InlineHubunganCell({
  keluargaId,
  jemaatId,
  value,
  onSaved,
}: {
  keluargaId: string;
  jemaatId: string;
  value: string | null;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<HubunganKeluarga | null>(value as HubunganKeluarga | null);
  const [pending, setPending] = useState(false);
  const dirty = selected !== (value as HubunganKeluarga | null);

  async function save() {
    setPending(true);
    try {
      await apiFetch(`/api/admin/keluarga/${keluargaId}/anggota/${jemaatId}`, {
        method: "PATCH",
        body: { hubunganKeluarga: selected },
      });
      toast.success("Hubungan keluarga diperbarui");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected} disabled={pending}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Tidak ada" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>Tidak ada</SelectItem>
          {HUBUNGAN_KELUARGA.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!dirty || pending} onClick={save} focusableWhenDisabled>
        {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
        Simpan
      </Button>
    </div>
  );
}
