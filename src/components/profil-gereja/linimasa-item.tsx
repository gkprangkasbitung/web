"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { LinimasaRow } from "@/lib/profil-gereja";

export type LinimasaAccess = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

/**
 * One timeline entry: drag handle, Tahun, Keterangan, Simpan, Hapus. Its
 * fields are local state, set once from the row (same convention as the
 * Litbang cards, stage 8), so a refresh doesn't wipe an edit in progress.
 */
export function LinimasaItem({
  item,
  access,
  onChanged,
}: {
  item: LinimasaRow;
  access: LinimasaAccess;
  onChanged: () => void;
}) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [tahun, setTahun] = useState(item.tahun);
  const [teks, setTeks] = useState(item.teks);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !access.canUpdate) return;
    if (!tahun.trim()) return void toast.error("Tahun wajib diisi.");
    if (!teks.trim()) return void toast.error("Keterangan wajib diisi.");

    setSaving(true);
    try {
      await apiFetch(`/api/admin/profil-gereja/linimasa/${item.id}`, { method: "PATCH", body: { tahun, teks } });
      toast.success("Linimasa disimpan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/profil-gereja/linimasa/${item.id}`, { method: "DELETE" });
      toast.success("Linimasa dihapus");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = `${item.tahun} · ${item.teks}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      {access.canUpdate && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={saving}
          aria-label={`Ubah urutan linimasa ${label}`}
          className="mt-6 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GripVerticalIcon aria-hidden />
        </button>
      )}

      <form id={formId} onSubmit={save} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2 sm:w-32">
          <Label htmlFor={`${formId}-tahun`}>Tahun</Label>
          <Input
            id={`${formId}-tahun`}
            value={tahun}
            onChange={(event) => setTahun(event.target.value)}
            maxLength={20}
            disabled={!access.canUpdate || saving}
            autoComplete="off"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${formId}-teks`}>Keterangan</Label>
          <Textarea
            id={`${formId}-teks`}
            value={teks}
            onChange={(event) => setTeks(event.target.value)}
            rows={2}
            maxLength={500}
            disabled={!access.canUpdate || saving}
          />
        </div>
        {(access.canUpdate || access.canDelete) && (
          <div className="flex gap-2 sm:mt-6">
            {access.canUpdate && (
              <Button type="submit" disabled={saving} focusableWhenDisabled>
                {saving && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                Simpan
              </Button>
            )}
            {access.canDelete && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => setDeleteOpen(true)} focusableWhenDisabled>
                Hapus
              </Button>
            )}
          </div>
        )}
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus linimasa "${label}"?`}
        description="Peristiwa ini tidak akan tampil lagi di halaman Tentang Kami. Tindakan ini tidak bisa dibatalkan."
        onConfirm={remove}
      />
    </li>
  );
}
