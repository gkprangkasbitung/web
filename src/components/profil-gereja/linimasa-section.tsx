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
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { LinimasaRow } from "@/lib/profil-gereja";

import { AddLinimasaDialog } from "./add-linimasa-dialog";
import { LinimasaItem, type LinimasaAccess } from "./linimasa-item";
import { ProfilSection } from "./profil-section";

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Untuk mengubah urutan, tekan spasi atau enter untuk mengangkat peristiwa linimasa. " +
    "Gunakan tombol panah atas atau bawah untuk memindahkannya, lalu tekan spasi atau enter lagi untuk menaruhnya. " +
    "Tekan escape untuk membatalkan.",
};

function itemLabel(items: LinimasaRow[], id: string): string {
  const item = items.find((row) => row.id === id);
  return item ? `${item.tahun} · ${item.teks}` : "";
}

function buildAnnouncements(items: LinimasaRow[]): Announcements {
  const position = (id: unknown) => items.findIndex((row) => row.id === id) + 1;
  return {
    onDragStart: ({ active }) => `Linimasa "${itemLabel(items, String(active.id))}" diangkat.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Linimasa "${itemLabel(items, String(active.id))}" dipindahkan ke posisi ${position(over.id)} dari ${items.length}, semula posisi ${position(active.id)}.`
        : `Linimasa "${itemLabel(items, String(active.id))}" tidak di atas posisi manapun.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Linimasa "${itemLabel(items, String(active.id))}" ditaruh di posisi ${position(over.id)} dari ${items.length}.`
        : `Linimasa "${itemLabel(items, String(active.id))}" dilepas. Urutan tidak berubah.`,
    onDragCancel: ({ active }) => `Pengubahan urutan linimasa "${itemLabel(items, String(active.id))}" dibatalkan.`,
  };
}

/**
 * Linimasa (brief §14.1): an ordered list of { tahun, teks }, reordered by
 * drag or keyboard and saved atomically (`reorder_profil_linimasa`, same
 * contract as Litbang's reorder, stage 8). Optimistic: `pendingOrder`
 * overrides the prop's order until the refresh lands, and rolls back on a
 * failed save.
 */
export function LinimasaSection({ items, access }: { items: LinimasaRow[]; access: LinimasaAccess }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(items.map((item) => [item.id, item]));
  const knownOrder = (pendingOrder ?? items.map((item) => item.id)).filter((id) => byId.has(id));
  const newIds = items.map((item) => item.id).filter((id) => !knownOrder.includes(id));
  const ordered = [...knownOrder, ...newIds].map((id) => byId.get(id)!);

  function onChanged() {
    router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!access.canUpdate || reordering || !over || active.id === over.id) return;

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
      await apiFetch("/api/admin/profil-gereja/linimasa/reorder", { method: "POST", body: { ids: nextIds } });
      router.refresh();
    } catch (error) {
      setPendingOrder(currentIds);
      toast.error(errorMessage(error));
    } finally {
      setReordering(false);
    }
  }

  return (
    <ProfilSection
      title="Linimasa"
      description="Peristiwa penting dalam perjalanan jemaat, tampil berurutan di halaman Tentang Kami."
      actions={
        access.canCreate && (
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <PlusIcon aria-hidden />
            Tambah Linimasa
          </Button>
        )
      }
    >
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada linimasa.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: buildAnnouncements(ordered), screenReaderInstructions }}
        >
          <SortableContext items={ordered.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ol aria-label="Daftar linimasa" className="flex flex-col gap-3">
              {ordered.map((item) => (
                <LinimasaItem key={item.id} item={item} access={access} onChanged={onChanged} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {access.canCreate && <AddLinimasaDialog open={addOpen} onOpenChange={setAddOpen} onSaved={onChanged} />}
    </ProfilSection>
  );
}
