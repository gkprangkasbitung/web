"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PersonOption } from "@/components/shared/person-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JabatanKomisiRow } from "@/lib/komisi";
import type { KomisiPersonOption } from "@/lib/komisi-routes";

/** "Tambah Anggota" (brief §14.8): a Sidi/Anggota Penuh jemaat not yet in this komisi, plus a jabatan. */
export function TambahAnggotaForm({
  komisiId,
  anggotaOptions,
  jabatanOptions,
  memberIds,
}: {
  komisiId: string;
  anggotaOptions: readonly KomisiPersonOption[];
  jabatanOptions: readonly JabatanKomisiRow[];
  memberIds: readonly string[];
}) {
  const router = useRouter();
  const id = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jabatanId, setJabatanId] = useState<string | null>(jabatanOptions[0]?.id ?? null);
  const [pending, setPending] = useState(false);

  async function add() {
    if (!selectedId || !jabatanId) return;
    setPending(true);
    try {
      await apiFetch(`/api/admin/komisi/${komisiId}/anggota`, {
        method: "POST",
        body: { jemaatId: selectedId, jabatanId },
      });
      toast.success("Anggota ditambahkan");
      setSelectedId(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">Tambah Anggota</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-person`}>Jemaat</Label>
          <PersonPicker
            id={`${id}-person`}
            people={anggotaOptions as readonly PersonOption[]}
            value={selectedId}
            onValueChange={setSelectedId}
            excludeIds={memberIds}
            placeholder="Cari jemaat Sidi/Anggota Penuh..."
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-jabatan`}>Jabatan</Label>
          <Select
            items={jabatanOptions.map((option) => ({ value: option.id, label: option.nama }))}
            value={jabatanId}
            onValueChange={setJabatanId}
            disabled={pending}
          >
            <SelectTrigger id={`${id}-jabatan`} className="w-full sm:w-44">
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
        </div>
        <Button disabled={!selectedId || !jabatanId || pending} onClick={add} focusableWhenDisabled>
          {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
          Tambahkan
        </Button>
      </div>
      {anggotaOptions.length === 0 && (
        <p className="text-sm text-muted-foreground">Tidak ada jemaat Sidi/Anggota Penuh yang bisa ditambahkan.</p>
      )}
    </div>
  );
}
