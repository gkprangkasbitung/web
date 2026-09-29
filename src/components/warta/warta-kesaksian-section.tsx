"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { WartaKesaksianItemRow } from "@/lib/warta";

import { WartaSection } from "./warta-section";

function KesaksianFields({
  id,
  judul,
  deskripsi,
  onJudulChange,
  onDeskripsiChange,
  disabled,
  judulInvalid,
  errorId,
}: {
  id: string;
  judul: string;
  deskripsi: string;
  onJudulChange: (value: string) => void;
  onDeskripsiChange: (value: string) => void;
  disabled: boolean;
  judulInvalid: boolean;
  errorId: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-judul`}>
          Judul{" "}
          <span className="text-muted-foreground" aria-hidden>
            *
          </span>
        </Label>
        <Input
          id={`${id}-judul`}
          value={judul}
          onChange={(event) => onJudulChange(event.target.value)}
          maxLength={200}
          autoComplete="off"
          required
          disabled={disabled}
          aria-invalid={judulInvalid || undefined}
          aria-describedby={judulInvalid ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-deskripsi`}>Deskripsi</Label>
        <Textarea
          id={`${id}-deskripsi`}
          value={deskripsi}
          onChange={(event) => onDeskripsiChange(event.target.value)}
          rows={3}
          maxLength={5000}
          disabled={disabled}
        />
      </div>
    </>
  );
}

function KesaksianItem({
  wartaId,
  item,
  canWrite,
}: {
  wartaId: string;
  item: WartaKesaksianItemRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const errorId = `${id}-error`;
  // Initialized once; later refreshes don't overwrite an edit in progress.
  const [judul, setJudul] = useState(item.judul);
  const [deskripsi, setDeskripsi] = useState(item.deskripsi ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    if (!judul.trim()) {
      setError("Judul wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/kesaksian/${item.id}`, { method: "PATCH", body: { judul, deskripsi } });
      toast.success("Kesaksian disimpan");
      router.refresh();
    } catch (saveError) {
      toast.error(errorMessage(saveError));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/kesaksian/${item.id}`, { method: "DELETE" });
      toast.success("Kesaksian dihapus");
      router.refresh();
    } catch (removeError) {
      toast.error(errorMessage(removeError));
      throw removeError;
    }
  }

  return (
    <li className="rounded-lg border p-4">
      <form noValidate onSubmit={save} className="flex flex-col gap-3">
        <KesaksianFields
          id={id}
          judul={judul}
          deskripsi={deskripsi}
          onJudulChange={setJudul}
          onDeskripsiChange={setDeskripsi}
          disabled={!canWrite || pending}
          judulInvalid={error !== null}
          errorId={errorId}
        />
        <FormError id={errorId} message={error} />
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteOpen(true)} focusableWhenDisabled>
              Hapus
            </Button>
          </div>
        )}
      </form>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus "${item.judul}"?`}
        onConfirm={remove}
      />
    </li>
  );
}

function AddKesaksianForm({ wartaId }: { wartaId: string }) {
  const router = useRouter();
  const id = useId();
  const errorId = `${id}-error`;
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [judulInvalid, setJudulInvalid] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!judul.trim()) {
      setError("Judul wajib diisi.");
      setJudulInvalid(true);
      return;
    }
    setPending(true);
    setError(null);
    setJudulInvalid(false);
    try {
      await apiFetch(`/api/admin/warta/${wartaId}/kesaksian`, { method: "POST", body: { judul, deskripsi } });
      toast.success("Kesaksian ditambahkan");
      setJudul("");
      setDeskripsi("");
      router.refresh();
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={add}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-lg border border-dashed p-4"
    >
      <h3 id={`${id}-title`} className="font-medium">
        Tambah Item Baru
      </h3>
      <KesaksianFields
        id={id}
        judul={judul}
        deskripsi={deskripsi}
        onJudulChange={setJudul}
        onDeskripsiChange={setDeskripsi}
        disabled={pending}
        judulInvalid={judulInvalid}
        errorId={errorId}
      />
      <FormError id={errorId} message={error} />
      <div>
        <Button type="submit" disabled={pending} focusableWhenDisabled>
          {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
          Tambah
        </Button>
      </div>
    </form>
  );
}

/** Section 5, "Bidang Kesaksian dan Keesaan" (brief §9.4): an open-ended list, edited in place; new items go last. */
export function WartaKesaksianSection({
  wartaId,
  items,
  canWrite,
}: {
  wartaId: string;
  items: WartaKesaksianItemRow[];
  canWrite: boolean;
}) {
  return (
    <WartaSection title="Bidang Kesaksian dan Keesaan">
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada kesaksian untuk warta ini.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <KesaksianItem key={item.id} wartaId={wartaId} item={item} canWrite={canWrite} />
            ))}
          </ul>
        )}
        {canWrite && <AddKesaksianForm wartaId={wartaId} />}
      </div>
    </WartaSection>
  );
}
