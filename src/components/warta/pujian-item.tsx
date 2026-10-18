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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { PUJIAN_BUKU, type WartaPujianRow } from "@/lib/warta";

const BUKU_ITEMS = PUJIAN_BUKU.map((buku) => ({ value: buku, label: buku }));

export type PujianAccess = { canWrite: boolean };

/** One pujian row: drag handle, Buku, Nomor, Keterangan, Simpan, Hapus. Local state, set once from the row (brief §16.1). */
export function PujianItem({
  wartaId,
  item,
  access,
  onChanged,
}: {
  wartaId: string;
  item: WartaPujianRow;
  access: PujianAccess;
  onChanged: () => void;
}) {
  const formId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [buku, setBuku] = useState(item.buku);
  const [nomor, setNomor] = useState(item.nomor ?? "");
  const [keterangan, setKeterangan] = useState(item.keterangan ?? "");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !access.canWrite) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/pujian/${item.id}`, { method: "PATCH", body: { buku, nomor, keterangan } });
      toast.success("Pujian disimpan");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/pujian/${item.id}`, { method: "DELETE" });
      toast.success("Pujian dihapus");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = item.nomor ? `${item.buku} ${item.nomor}` : item.buku;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      {access.canWrite && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={saving}
          aria-label={`Ubah urutan pujian ${label}`}
          className="mt-6 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GripVerticalIcon aria-hidden />
        </button>
      )}

      <form id={formId} onSubmit={save} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2 sm:w-28">
          <Label htmlFor={`${formId}-buku`}>Buku</Label>
          <Select
            items={BUKU_ITEMS}
            value={buku}
            onValueChange={(value) => value && setBuku(value)}
            disabled={!access.canWrite || saving}
          >
            <SelectTrigger id={`${formId}-buku`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUJIAN_BUKU.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:w-32">
          <Label htmlFor={`${formId}-nomor`}>Nomor</Label>
          <Input
            id={`${formId}-nomor`}
            value={nomor}
            onChange={(event) => setNomor(event.target.value)}
            maxLength={20}
            disabled={!access.canWrite || saving}
            autoComplete="off"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${formId}-keterangan`}>Keterangan</Label>
          <Input
            id={`${formId}-keterangan`}
            value={keterangan}
            onChange={(event) => setKeterangan(event.target.value)}
            maxLength={200}
            placeholder="Mis. bait 1-3"
            disabled={!access.canWrite || saving}
            autoComplete="off"
          />
        </div>
        {access.canWrite && (
          <div className="flex gap-2 sm:mt-6">
            <Button type="submit" disabled={saving} focusableWhenDisabled>
              {saving && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDeleteOpen(true)} focusableWhenDisabled>
              Hapus
            </Button>
          </div>
        )}
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus pujian "${label}"?`}
        onConfirm={remove}
      />
    </li>
  );
}
