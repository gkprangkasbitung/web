"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { LITBANG_DESKRIPSI_PLACEHOLDER } from "@/lib/litbang";
import type { WartaLitbangItemRow } from "@/lib/warta";

import { WartaSection } from "./warta-section";

function WartaLitbangCard({
  wartaId,
  item,
  index,
  canWrite,
}: {
  wartaId: string;
  item: WartaLitbangItemRow;
  index: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const id = useId();
  // Initialized once; later refreshes don't overwrite an edit in progress (stage 8's card convention).
  const [deskripsi, setDeskripsi] = useState(item.deskripsi ?? "");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    setPending(true);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/litbang/${item.id}`, { method: "PATCH", body: { deskripsi } });
      toast.success("Litbang disimpan");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-lg border p-4">
      <form onSubmit={save} className="flex flex-col gap-3">
        <h3 id={`${id}-name`} className="font-medium">
          <span className="text-muted-foreground tabular-nums">{index + 1}. </span>
          {item.name}
        </h3>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-deskripsi`}>Deskripsi</Label>
          <Textarea
            id={`${id}-deskripsi`}
            aria-describedby={`${id}-name`}
            value={deskripsi}
            onChange={(event) => setDeskripsi(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={canWrite ? LITBANG_DESKRIPSI_PLACEHOLDER : undefined}
            disabled={!canWrite || pending}
          />
        </div>
        {canWrite && (
          <div>
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
          </div>
        )}
      </form>
    </li>
  );
}

/**
 * Section 3, "Bidang Litbang" (brief §9.4): this warta's own copy of the
 * cards, taken when it was created. Only deskripsi is editable (the name is
 * fixed in the DB too, 0026); the template and other warta never change.
 */
export function WartaLitbangSection({
  wartaId,
  items,
  canWrite,
}: {
  wartaId: string;
  items: WartaLitbangItemRow[];
  canWrite: boolean;
}) {
  return (
    <WartaSection
      title="Bidang Litbang"
      description="Salinan kartu Litbang milik warta ini. Perubahan di sini tidak mengubah template atau warta lain."
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada Litbang untuk warta ini.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <WartaLitbangCard key={item.id} wartaId={wartaId} item={item} index={index} canWrite={canWrite} />
          ))}
        </ol>
      )}
    </WartaSection>
  );
}
