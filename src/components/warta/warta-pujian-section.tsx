"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  type ScreenReaderInstructions,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { WartaBahanBacaan, WartaPujianRow } from "@/lib/warta";

import { AddPujianDialog } from "./add-pujian-dialog";
import { PujianItem } from "./pujian-item";
import { WartaSection } from "./warta-section";

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Untuk mengubah urutan, tekan spasi atau enter untuk mengangkat pujian. " +
    "Gunakan tombol panah atas atau bawah untuk memindahkannya, lalu tekan spasi atau enter lagi untuk menaruhnya. " +
    "Tekan escape untuk membatalkan.",
};

function itemLabel(items: WartaPujianRow[], id: string): string {
  const item = items.find((row) => row.id === id);
  return item ? (item.nomor ? `${item.buku} ${item.nomor}` : item.buku) : "";
}

function buildAnnouncements(items: WartaPujianRow[]): Announcements {
  const position = (id: unknown) => items.findIndex((row) => row.id === id) + 1;
  return {
    onDragStart: ({ active }) => `Pujian "${itemLabel(items, String(active.id))}" diangkat.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Pujian "${itemLabel(items, String(active.id))}" dipindahkan ke posisi ${position(over.id)} dari ${items.length}, semula posisi ${position(active.id)}.`
        : `Pujian "${itemLabel(items, String(active.id))}" tidak di atas posisi manapun.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Pujian "${itemLabel(items, String(active.id))}" ditaruh di posisi ${position(over.id)} dari ${items.length}.`
        : `Pujian "${itemLabel(items, String(active.id))}" dilepas. Urutan tidak berubah.`,
    onDragCancel: ({ active }) => `Pengubahan urutan pujian "${itemLabel(items, String(active.id))}" dibatalkan.`,
  };
}

function BahanBacaanFields({ wartaId, values, canWrite }: { wartaId: string; values: WartaBahanBacaan; canWrite: boolean }) {
  const formId = useId();
  const router = useRouter();
  const [tataKebaktian, setTataKebaktian] = useState(values.tataKebaktian ?? "");
  const [nasPembimbing, setNasPembimbing] = useState(values.nasPembimbing ?? "");
  const [pembacaanAlkitab, setPembacaanAlkitab] = useState(values.pembacaanAlkitab ?? "");
  const [pembacaanMazmur, setPembacaanMazmur] = useState(values.pembacaanMazmur ?? "");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canWrite) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/bahan-bacaan`, {
        method: "PATCH",
        body: { tataKebaktian, nasPembimbing, pembacaanAlkitab, pembacaanMazmur },
      });
      toast.success("Bahan bacaan & nyanyian disimpan");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-tata-kebaktian`}>Tata Kebaktian</Label>
        <Textarea
          id={`${formId}-tata-kebaktian`}
          value={tataKebaktian}
          onChange={(event) => setTataKebaktian(event.target.value)}
          rows={4}
          maxLength={2000}
          disabled={!canWrite || saving}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-nas-pembimbing`}>Nas Pembimbing</Label>
        <Input
          id={`${formId}-nas-pembimbing`}
          value={nasPembimbing}
          onChange={(event) => setNasPembimbing(event.target.value)}
          maxLength={500}
          disabled={!canWrite || saving}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-pembacaan-alkitab`}>Pembacaan Alkitab</Label>
        <Input
          id={`${formId}-pembacaan-alkitab`}
          value={pembacaanAlkitab}
          onChange={(event) => setPembacaanAlkitab(event.target.value)}
          maxLength={500}
          disabled={!canWrite || saving}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-pembacaan-mazmur`}>Pembacaan Mazmur</Label>
        <Input
          id={`${formId}-pembacaan-mazmur`}
          value={pembacaanMazmur}
          onChange={(event) => setPembacaanMazmur(event.target.value)}
          maxLength={500}
          disabled={!canWrite || saving}
          autoComplete="off"
        />
      </div>
      {canWrite && (
        <div>
          <Button type="submit" disabled={saving} focusableWhenDisabled>
            {saving && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
            Simpan
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * Section 6, "Bahan Bacaan & Nyanyian" (brief §16.1): four text fields with
 * their own Simpan (no concurrency control, same stance as Litbang/Kesaksian
 * edits), then an ordered pujian list. Reordering is atomic
 * (`reorder_warta_pujian`, scoped to this warta); optimistic with rollback,
 * same pattern as Linimasa (stage 11a).
 */
export function WartaPujianSection({
  wartaId,
  bahanBacaan,
  pujian,
  canWrite,
}: {
  wartaId: string;
  bahanBacaan: WartaBahanBacaan;
  pujian: WartaPujianRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [reordering, setReordering] = useState(false);
  const [fillingStandard, setFillingStandard] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(pujian.map((item) => [item.id, item]));
  const knownOrder = (pendingOrder ?? pujian.map((item) => item.id)).filter((id) => byId.has(id));
  const newIds = pujian.map((item) => item.id).filter((id) => !knownOrder.includes(id));
  const ordered = [...knownOrder, ...newIds].map((id) => byId.get(id)!);

  function onChanged() {
    router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!canWrite || reordering || !over || active.id === over.id) return;

    const currentIds = ordered.map((item) => item.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = [...currentIds];
    nextIds.splice(oldIndex, 1);
    nextIds.splice(newIndex, 0, String(active.id));

    setPendingOrder(nextIds);
    setReordering(true);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/pujian/reorder`, { method: "POST", body: { ids: nextIds } });
      router.refresh();
    } catch (error) {
      setPendingOrder(currentIds);
      toast.error(errorMessage(error));
    } finally {
      setReordering(false);
    }
  }

  async function fillStandard() {
    if (fillingStandard || pujian.length > 0) return;
    setFillingStandard(true);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/pujian/standar`, { method: "POST" });
      toast.success("Urutan standar ditambahkan");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFillingStandard(false);
    }
  }

  return (
    <WartaSection title="Bahan Bacaan & Nyanyian">
      <div className="flex flex-col gap-6">
        <BahanBacaanFields wartaId={wartaId} values={bahanBacaan} canWrite={canWrite} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Daftar Pujian</h3>
            {canWrite && (
              <div className="flex gap-2">
                {pujian.length === 0 && (
                  <Button type="button" variant="outline" disabled={fillingStandard} onClick={fillStandard} focusableWhenDisabled>
                    {fillingStandard && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
                    Isi urutan standar
                  </Button>
                )}
                <Button type="button" onClick={() => setAddOpen(true)}>
                  <PlusIcon aria-hidden />
                  Tambah Pujian
                </Button>
              </div>
            )}
          </div>

          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pujian untuk warta ini.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              accessibility={{ announcements: buildAnnouncements(ordered), screenReaderInstructions }}
            >
              <SortableContext items={ordered.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <ol aria-label="Daftar pujian" className="flex flex-col gap-3">
                  {ordered.map((item) => (
                    <PujianItem key={item.id} wartaId={wartaId} item={item} access={{ canWrite }} onChanged={onChanged} />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {canWrite && <AddPujianDialog wartaId={wartaId} open={addOpen} onOpenChange={setAddOpen} onSaved={onChanged} />}
      </div>
    </WartaSection>
  );
}
