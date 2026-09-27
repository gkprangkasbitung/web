"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { HUBUNGAN_KELUARGA, type HubunganKeluarga } from "@/lib/jemaat";
import type { PersonOptionRow } from "@/lib/jemaat-routes";

/** "Tambah Anggota" (brief §9.10): a person not yet in this family, with an optional hubungan. */
export function TambahAnggotaForm({
  keluargaId,
  keluargaNama,
  people,
  memberIds,
}: {
  keluargaId: string;
  keluargaNama: string;
  people: readonly PersonOptionRow[];
  memberIds: readonly string[];
}) {
  const router = useRouter();
  const id = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hubungan, setHubungan] = useState<HubunganKeluarga | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selected = people.find((person) => person.id === selectedId) ?? null;
  const movesFromAnotherFamily = Boolean(selected?.keluargaId && selected.keluargaId !== keluargaId);

  async function add() {
    if (!selectedId) return;
    setPending(true);
    try {
      await apiFetch(`/api/admin/keluarga/${keluargaId}/anggota`, {
        method: "POST",
        body: { jemaatId: selectedId, hubunganKeluarga: hubungan },
      });
      toast.success("Anggota ditambahkan");
      setSelectedId(null);
      setHubungan(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function handleTambahkan() {
    if (!selectedId) return;
    if (movesFromAnotherFamily) setConfirmOpen(true);
    else add();
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">Tambah Anggota</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-person`}>Jemaat</Label>
          <PersonPicker
            id={`${id}-person`}
            people={people as readonly PersonOption[]}
            value={selectedId}
            onValueChange={setSelectedId}
            excludeIds={memberIds}
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-hubungan`}>Hubungan Keluarga</Label>
          <Select value={hubungan} onValueChange={setHubungan} disabled={pending}>
            <SelectTrigger id={`${id}-hubungan`} className="w-full sm:w-44">
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
        </div>
        <Button disabled={!selectedId || pending} onClick={handleTambahkan} focusableWhenDisabled>
          {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
          Tambahkan
        </Button>
      </div>
      {movesFromAnotherFamily && selected && (
        <p className="text-sm text-muted-foreground">
          {selected.nama} sedang tercatat di keluarga &quot;{selected.keluargaNama}&quot;. Menambahkannya di sini akan
          memindahkannya dari keluarga tersebut.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Pindahkan ${selected?.nama ?? ""} ke keluarga ${keluargaNama}?`}
        description={`"${selected?.nama ?? ""}" akan dilepas dari keluarga "${selected?.keluargaNama ?? ""}" dan dipindahkan ke sini.`}
        confirmLabel="Pindahkan"
        onConfirm={add}
      />
    </div>
  );
}
