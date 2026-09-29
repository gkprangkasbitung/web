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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { LITBANG_DESKRIPSI_PLACEHOLDER, type LitbangCardRow } from "@/lib/litbang";

export type LitbangCardProps = {
  card: LitbangCardRow;
  canWrite: boolean;
  onChanged: () => void;
};

/** One template card (brief §9.6): drag handle, Nama, Aktif, Deskripsi, Simpan, Hapus. */
export function LitbangCard({ card, canWrite, onChanged }: LitbangCardProps) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const [name, setName] = useState(card.name);
  const [deskripsi, setDeskripsi] = useState(card.deskripsi ?? "");
  const [savingFields, setSavingFields] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const pending = savingFields || togglingActive;

  async function saveFields(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Nama wajib diisi.");
      return;
    }

    setSavingFields(true);
    try {
      await apiFetch(`/api/admin/litbang-template/${card.id}`, {
        method: "PATCH",
        body: { name: trimmedName, deskripsi },
      });
      toast.success("Litbang disimpan");
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
      await apiFetch(`/api/admin/litbang-template/${card.id}`, { method: "PATCH", body: { active: next } });
      toast.success(next ? "Diaktifkan - akan ikut ke warta baru" : "Dinonaktifkan - dilewati saat warta baru dibuat");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTogglingActive(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/litbang-template/${card.id}`, { method: "DELETE" });
      toast.success("Litbang dihapus");
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
      className={isDragging ? "relative z-10 opacity-90 shadow-lg" : card.active ? "relative" : "relative opacity-60"}
    >
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {canWrite && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={pending}
            aria-label={`Ubah urutan litbang ${card.name}`}
            className="mt-1.5 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVerticalIcon aria-hidden />
          </button>
        )}

        <form id={formId} onSubmit={saveFields} className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor={`${formId}-name`}>Nama</Label>
              <Input
                id={`${formId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                disabled={!canWrite || pending}
                autoComplete="off"
              />
            </div>
            {!card.active && <Badge variant="neutral">Nonaktif</Badge>}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-active`}
              checked={card.active}
              onCheckedChange={(checked) => toggleActive(checked)}
              disabled={!canWrite || pending}
            />
            <Label htmlFor={`${formId}-active`}>Aktif</Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-deskripsi`}>Deskripsi</Label>
            <Textarea
              id={`${formId}-deskripsi`}
              value={deskripsi}
              onChange={(event) => setDeskripsi(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={LITBANG_DESKRIPSI_PLACEHOLDER}
              disabled={!canWrite || pending}
            />
          </div>

          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending} focusableWhenDisabled>
                {savingFields && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                Simpan
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDeleteOpen(true)}
                focusableWhenDisabled
              >
                Hapus
              </Button>
            </div>
          )}
        </form>
      </CardContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus litbang "${card.name}"?`}
        onConfirm={remove}
      />
    </Card>
  );
}
