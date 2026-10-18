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
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JadwalRutinRow } from "@/lib/profil-gereja";

export type JadwalRutinAccess = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

/**
 * One routine-schedule entry: drag handle, Nama, Keterangan Waktu, Simpan,
 * Hapus. Its fields are local state, set once from the row (same convention
 * as Linimasa, stage 11a), so a refresh doesn't wipe an edit in progress.
 */
export function JadwalRutinItem({
  item,
  access,
  onChanged,
}: {
  item: JadwalRutinRow;
  access: JadwalRutinAccess;
  onChanged: () => void;
}) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [nama, setNama] = useState(item.nama);
  const [keteranganWaktu, setKeteranganWaktu] = useState(item.keterangan_waktu);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !access.canUpdate) return;
    if (!nama.trim()) return void toast.error("Nama wajib diisi.");
    if (!keteranganWaktu.trim()) return void toast.error("Keterangan waktu wajib diisi.");

    setSaving(true);
    try {
      await apiFetch(`/api/admin/profil-gereja/jadwal-rutin/${item.id}`, {
        method: "PATCH",
        body: { nama, keteranganWaktu },
      });
      toast.success("Jadwal rutin disimpan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/profil-gereja/jadwal-rutin/${item.id}`, { method: "DELETE" });
      toast.success("Jadwal rutin dihapus");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = `${item.nama} · ${item.keterangan_waktu}`;

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
          aria-label={`Ubah urutan jadwal rutin ${label}`}
          className="mt-6 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GripVerticalIcon aria-hidden />
        </button>
      )}

      <form id={formId} onSubmit={save} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${formId}-nama`}>Nama</Label>
          <Input
            id={`${formId}-nama`}
            value={nama}
            onChange={(event) => setNama(event.target.value)}
            maxLength={200}
            disabled={!access.canUpdate || saving}
            autoComplete="off"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${formId}-keterangan-waktu`}>Keterangan Waktu</Label>
          <Input
            id={`${formId}-keterangan-waktu`}
            value={keteranganWaktu}
            onChange={(event) => setKeteranganWaktu(event.target.value)}
            maxLength={200}
            placeholder="Mis. Minggu, pkl. 08.00 WIB"
            disabled={!access.canUpdate || saving}
            autoComplete="off"
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
        title={`Hapus jadwal rutin "${label}"?`}
        description="Baris ini tidak akan tampil lagi di Warta. Tindakan ini tidak bisa dibatalkan."
        onConfirm={remove}
      />
    </li>
  );
}
