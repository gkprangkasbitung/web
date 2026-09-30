"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { initialPhotoValue, photoWillExist, PhotoField, type SavedPhoto } from "@/components/shared/photo-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { MajelisCardRow } from "@/lib/majelis";
import { appendPhotoFields, type PhotoFieldValue } from "@/lib/photo-upload-client";
import { PHOTO_ALT_REQUIRED, situsPhotoUrl } from "@/lib/situs-photo";

export type MajelisCardProps = {
  card: MajelisCardRow;
  canWrite: boolean;
  canDelete: boolean;
  onChanged: () => void;
};

/** One Majelis card (brief §14.3): drag handle, Nama, Jabatan, Foto, Aktif, Simpan, Hapus. */
export function MajelisCard({ card, canWrite, canDelete, onChanged }: MajelisCardProps) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const [nama, setNama] = useState(card.nama);
  const [jabatan, setJabatan] = useState(card.jabatan);
  const saved: SavedPhoto = card.foto_path && card.foto_alt ? { url: situsPhotoUrl(card.foto_path), alt: card.foto_alt } : null;
  const [photoValue, setPhotoValue] = useState<PhotoFieldValue>(() => initialPhotoValue(saved));
  const [photoKey, setPhotoKey] = useState(0);
  const [savingFields, setSavingFields] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [altInvalid, setAltInvalid] = useState(false);

  const pending = savingFields || togglingActive;

  async function saveFields(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    const trimmedNama = nama.trim();
    const trimmedJabatan = jabatan.trim();
    if (!trimmedNama) return void toast.error("Nama wajib diisi.");
    if (!trimmedJabatan) return void toast.error("Jabatan wajib diisi.");
    if (photoWillExist(saved, photoValue) && !photoValue.alt.trim()) {
      setAltInvalid(true);
      toast.error(PHOTO_ALT_REQUIRED);
      return;
    }

    const form = new FormData();
    form.append("nama", trimmedNama);
    form.append("jabatan", trimmedJabatan);
    appendPhotoFields(form, photoValue);

    setSavingFields(true);
    setAltInvalid(false);
    try {
      const updated = await apiFetch<MajelisCardRow>(`/api/admin/majelis/${card.id}`, { method: "PATCH", body: form });
      toast.success("Majelis disimpan");
      const updatedSaved: SavedPhoto =
        updated.foto_path && updated.foto_alt ? { url: situsPhotoUrl(updated.foto_path), alt: updated.foto_alt } : null;
      setPhotoValue(initialPhotoValue(updatedSaved));
      setPhotoKey((key) => key + 1);
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
      await apiFetch(`/api/admin/majelis/${card.id}/aktif`, { method: "PATCH", body: { aktif: next } });
      toast.success(next ? "Majelis diaktifkan" : "Majelis dinonaktifkan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTogglingActive(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/majelis/${card.id}`, { method: "DELETE" });
      toast.success("Majelis dihapus");
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
            aria-label={`Ubah urutan majelis ${card.nama}`}
            className="mt-1.5 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVerticalIcon aria-hidden />
          </button>
        )}

        <form id={formId} onSubmit={saveFields} className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
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
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-jabatan`}>Jabatan</Label>
                <Input
                  id={`${formId}-jabatan`}
                  value={jabatan}
                  onChange={(event) => setJabatan(event.target.value)}
                  maxLength={200}
                  disabled={!canWrite || pending}
                  autoComplete="off"
                />
              </div>
            </div>
            {!card.aktif && <Badge variant="neutral">Nonaktif</Badge>}
          </div>

          <PhotoField
            key={photoKey}
            label="Foto"
            saved={saved}
            value={photoValue}
            onValueChange={(next) => {
              setPhotoValue(next);
              if (altInvalid && next.alt.trim()) setAltInvalid(false);
            }}
            disabled={!canWrite || pending}
            altHint={`Foto ${card.nama || "majelis"}`}
            invalid={altInvalid}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-aktif`}
              checked={card.aktif}
              onCheckedChange={(checked) => toggleActive(checked === true)}
              disabled={!canWrite || pending}
            />
            <Label htmlFor={`${formId}-aktif`}>Aktif</Label>
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

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Hapus majelis "${card.nama}"?`} onConfirm={remove} />
    </Card>
  );
}
