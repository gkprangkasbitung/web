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

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { MajelisCardRow } from "@/lib/majelis";

import { AddMajelisDialog } from "./add-majelis-dialog";
import { MajelisCard } from "./majelis-card";

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Untuk mengubah urutan, tekan spasi atau enter untuk mengangkat kartu majelis. " +
    "Gunakan tombol panah atas atau bawah untuk memindahkannya, lalu tekan spasi atau enter lagi untuk menaruhnya. " +
    "Tekan escape untuk membatalkan.",
};

function cardName(cards: MajelisCardRow[], id: string): string {
  return cards.find((card) => card.id === id)?.nama ?? "";
}

function buildAnnouncements(cards: MajelisCardRow[]): Announcements {
  return {
    onDragStart: ({ active }) => `Kartu majelis "${cardName(cards, String(active.id))}" diangkat.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `Kartu majelis "${cardName(cards, String(active.id))}" tidak di atas posisi manapun.`;
      const activeIndex = cards.findIndex((card) => card.id === active.id);
      const overIndex = cards.findIndex((card) => card.id === over.id);
      return `Kartu majelis "${cardName(cards, String(active.id))}" dipindahkan ke posisi ${overIndex + 1} dari ${cards.length}, semula posisi ${activeIndex + 1}.`;
    },
    onDragEnd: ({ active, over }) => {
      const name = cardName(cards, String(active.id));
      if (!over) return `Kartu majelis "${name}" dilepas. Urutan tidak berubah.`;
      const overIndex = cards.findIndex((card) => card.id === over.id);
      return `Kartu majelis "${name}" ditaruh di posisi ${overIndex + 1} dari ${cards.length}.`;
    },
    onDragCancel: ({ active }) => `Pengubahan urutan kartu majelis "${cardName(cards, String(active.id))}" dibatalkan.`,
  };
}

/** `/admin/majelis` (brief §14.3): a card list, reorderable like Litbang. Free text, not linked to jemaat. */
export function MajelisManager({
  cards,
  canWrite,
  canDelete,
}: {
  cards: MajelisCardRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const knownOrder = (pendingOrder ?? cards.map((card) => card.id)).filter((id) => cardsById.has(id));
  const newIds = cards.map((card) => card.id).filter((id) => !knownOrder.includes(id));
  const orderedCards = [...knownOrder, ...newIds].map((id) => cardsById.get(id)!);

  function onChanged() {
    router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!canWrite || reordering || !over || active.id === over.id) return;

    const currentIds = orderedCards.map((card) => card.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = [...currentIds];
    nextIds.splice(oldIndex, 1);
    nextIds.splice(newIndex, 0, String(active.id));

    setPendingOrder(nextIds);
    setReordering(true);
    try {
      await apiFetch("/api/admin/majelis/reorder", { method: "POST", body: { ids: nextIds } });
      router.refresh();
    } catch (error) {
      setPendingOrder(currentIds);
      toast.error(errorMessage(error));
    } finally {
      setReordering(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Majelis"
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon aria-hidden />
              Tambah Majelis
            </Button>
          )
        }
      />

      {orderedCards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada majelis.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: buildAnnouncements(orderedCards), screenReaderInstructions }}
        >
          <SortableContext items={orderedCards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-4">
              {orderedCards.map((card) => (
                <MajelisCard key={card.id} card={card} canWrite={canWrite} canDelete={canDelete} onChanged={onChanged} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canWrite && <AddMajelisDialog open={addOpen} onOpenChange={setAddOpen} onSaved={onChanged} />}
    </div>
  );
}
