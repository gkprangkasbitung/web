"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JabatanKomisiRow } from "@/lib/komisi";

/** The inline jabatan editor in the members table (brief §14.8): "Simpan" enables only after a change. */
export function InlineJabatanCell({
  komisiId,
  jemaatId,
  value,
  jabatanOptions,
  onSaved,
}: {
  komisiId: string;
  jemaatId: string;
  value: string;
  jabatanOptions: readonly JabatanKomisiRow[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(value);
  const [pending, setPending] = useState(false);
  const dirty = selected !== value;

  async function save() {
    setPending(true);
    try {
      await apiFetch(`/api/admin/komisi/${komisiId}/anggota/${jemaatId}`, {
        method: "PATCH",
        body: { jabatanId: selected },
      });
      toast.success("Jabatan diperbarui");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select<string>
        items={jabatanOptions.map((option) => ({ value: option.id, label: option.nama }))}
        value={selected}
        onValueChange={(next) => next !== null && setSelected(next)}
        disabled={pending}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {jabatanOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.nama}
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
