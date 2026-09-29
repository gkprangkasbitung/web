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
import type { LitbangCardRow } from "@/lib/litbang";

import { AddLitbangDialog } from "./add-litbang-dialog";
import { LitbangCard } from "./litbang-card";

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Untuk mengubah urutan, tekan spasi atau enter untuk mengangkat kartu litbang. " +
    "Gunakan tombol panah atas atau bawah untuk memindahkannya, lalu tekan spasi atau enter lagi untuk menaruhnya. " +
    "Tekan escape untuk membatalkan.",
};

function cardName(cards: LitbangCardRow[], id: string): string {
  return cards.find((card) => card.id === id)?.name ?? "";
}

function buildAnnouncements(cards: LitbangCardRow[]): Announcements {
  return {
    onDragStart: ({ active }) => `Kartu litbang "${cardName(cards, String(active.id))}" diangkat.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `Kartu litbang "${cardName(cards, String(active.id))}" tidak di atas posisi manapun.`;
      const activeIndex = cards.findIndex((card) => card.id === active.id);
      const overIndex = cards.findIndex((card) => card.id === over.id);
      return `Kartu litbang "${cardName(cards, String(active.id))}" dipindahkan ke posisi ${overIndex + 1} dari ${cards.length}, semula posisi ${activeIndex + 1}.`;
    },
    onDragEnd: ({ active, over }) => {
      const name = cardName(cards, String(active.id));
      if (!over) return `Kartu litbang "${name}" dilepas. Urutan tidak berubah.`;
      const overIndex = cards.findIndex((card) => card.id === over.id);
      return `Kartu litbang "${name}" ditaruh di posisi ${overIndex + 1} dari ${cards.length}.`;
    },
    onDragCancel: ({ active }) => `Pengubahan urutan kartu litbang "${cardName(cards, String(active.id))}" dibatalkan.`,
  };
}

/** `/admin/litbang` (brief §9.6): a card list, not a table — reorder is via drag or keyboard. */
export function LitbangManager({ cards, canWrite }: { cards: LitbangCardRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  // Optimistic order, overriding `cards`' own order until the next refresh lands
  // (or reverted immediately on a failed save). Membership (add/delete) is
  // still read live from `cards` each render, so this never goes stale there.
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
      await apiFetch("/api/admin/litbang-template/reorder", { method: "POST", body: { ids: nextIds } });
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
        title="Litbang"
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon aria-hidden />
              Tambah Litbang
            </Button>
          )
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements: buildAnnouncements(orderedCards), screenReaderInstructions }}
      >
        <SortableContext items={orderedCards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {orderedCards.map((card) => (
              <LitbangCard key={card.id} card={card} canWrite={canWrite} onChanged={onChanged} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {canWrite && <AddLitbangDialog open={addOpen} onOpenChange={setAddOpen} onSaved={onChanged} />}
    </div>
  );
}
