"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { PelayananCardRow } from "@/lib/pelayanan";
import { PELAYANAN_ICONS } from "@/lib/pelayanan-icons";

export type PelayananCardProps = {
  card: PelayananCardRow;
  canWrite: boolean;
  canDelete: boolean;
  onChanged: () => void;
};

/** One Pelayanan card (brief §14.2): drag handle, Nama, Jadwal, Ikon, Aktif, Deskripsi, Simpan, Hapus. */
export function PelayananCard({ card, canWrite, canDelete, onChanged }: PelayananCardProps) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const [nama, setNama] = useState(card.nama);
  const [deskripsi, setDeskripsi] = useState(card.deskripsi ?? "");
  const [jadwal, setJadwal] = useState(card.jadwal ?? "");
  const [icon, setIcon] = useState(card.icon);
  const [savingFields, setSavingFields] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const pending = savingFields || togglingActive;

  async function saveFields(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    const trimmedNama = nama.trim();
    if (!trimmedNama) {
      toast.error("Nama wajib diisi.");
      return;
    }

    setSavingFields(true);
    try {
      await apiFetch(`/api/admin/pelayanan/${card.id}`, {
        method: "PATCH",
        body: { nama: trimmedNama, deskripsi, jadwal, icon },
      });
      toast.success("Pelayanan disimpan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingFields(false);
    }
  }

  async function toggleActive(next: boolean) {
    if (pending || !canWrite) return;
    setTogglingActive(true);
    try {
      await apiFetch(`/api/admin/pelayanan/${card.id}`, { method: "PATCH", body: { aktif: next } });
      toast.success(next ? "Pelayanan diaktifkan" : "Pelayanan dinonaktifkan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTogglingActive(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/pelayanan/${card.id}`, { method: "DELETE" });
      toast.success("Pelayanan dihapus");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={isDragging ? "relative z-10 opacity-90 shadow-lg" : card.aktif ? "relative" : "relative opacity-60"}
    >
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {canWrite && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={pending}
            aria-label={`Ubah urutan pelayanan ${card.nama}`}
            className="mt-1.5 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVerticalIcon aria-hidden />
          </button>
        )}

        <form id={formId} onSubmit={saveFields} className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor={`${formId}-nama`}>Nama</Label>
              <Input
                id={`${formId}-nama`}
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                maxLength={200}
                disabled={!canWrite || pending}
                autoComplete="off"
              />
            </div>
            {!card.aktif && <Badge variant="neutral">Nonaktif</Badge>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-jadwal`}>Jadwal</Label>
              <Input
                id={`${formId}-jadwal`}
                value={jadwal}
                onChange={(event) => setJadwal(event.target.value)}
                maxLength={300}
                placeholder="Mis. Setiap Minggu, pkl. 09.00 WIB"
                disabled={!canWrite || pending}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${formId}-icon`}>Ikon</Label>
              <Select value={icon} onValueChange={(value) => value && setIcon(value)} disabled={!canWrite || pending}>
                <SelectTrigger id={`${formId}-icon`} className="w-full">
                  <SelectValue placeholder="Pilih ikon" />
                </SelectTrigger>
                <SelectContent>
                  {PELAYANAN_ICONS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      <item.icon aria-hidden className="size-4" />
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-aktif`}
              checked={card.aktif}
              onCheckedChange={(checked) => toggleActive(checked === true)}
              disabled={!canWrite || pending}
            />
            <Label htmlFor={`${formId}-aktif`}>Aktif</Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-deskripsi`}>Deskripsi</Label>
            <Textarea
              id={`${formId}-deskripsi`}
              value={deskripsi}
              onChange={(event) => setDeskripsi(event.target.value)}
              rows={3}
              maxLength={2000}
              disabled={!canWrite || pending}
            />
          </div>

          {(canWrite || canDelete) && (
            <div className="flex flex-wrap gap-2">
              {canWrite && (
                <Button type="submit" disabled={pending} focusableWhenDisabled>
                  {savingFields && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                  Simpan
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setDeleteOpen(true)}
                  focusableWhenDisabled
                >
                  Hapus
                </Button>
              )}
            </div>
          )}
        </form>
      </CardContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus pelayanan "${card.nama}"?`}
        onConfirm={remove}
      />
    </Card>
  );
}
