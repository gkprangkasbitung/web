"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { WartaDetail } from "@/lib/warta";

import {
  validateWartaInfo,
  WartaInfoFields,
  wartaInfoBody,
  wartaInfoValues,
  type WartaInfoField,
  type WartaInfoValues,
} from "./warta-info-fields";
import { WartaSection } from "./warta-section";

const ERROR_ID = "warta-informasi-error";

/**
 * Section 1, "Informasi & Renungan" (brief §9.4). Optimistic concurrency:
 * the save sends the `updated_at` this form started from, and the server
 * refuses it if someone else saved in between. That base is kept in local
 * state (not read from the `warta` prop), so a refresh triggered by another
 * section can't silently move it forward under the user's unsaved edits.
 */
export function WartaInfoSection({ warta, canWrite }: { warta: WartaDetail; canWrite: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<WartaInfoValues>(() => wartaInfoValues(warta));
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(warta.updatedAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<WartaInfoField | null>(null);

  function setField<F extends WartaInfoField>(field: F, value: WartaInfoValues[F]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;

    const problem = validateWartaInfo(values);
    if (problem) {
      setError(problem.message);
      setInvalidField(problem.field);
      return;
    }

    setPending(true);
    setError(null);
    setInvalidField(null);
    try {
      const data = await apiFetch<{ updatedAt: string }>(`/api/admin/warta/${warta.id}`, {
        method: "PATCH",
        body: { ...wartaInfoBody(values), expectedUpdatedAt: baseUpdatedAt },
      });
      setBaseUpdatedAt(data.updatedAt);
      toast.success("Informasi & Renungan disimpan");
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <WartaSection title="Informasi & Renungan">
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-describedby={error ? ERROR_ID : undefined}>
        <WartaInfoFields
          idPrefix="warta-informasi"
          values={values}
          onValueChange={setField}
          disabled={!canWrite || pending}
          invalidField={invalidField}
          errorId={ERROR_ID}
        />

        <FormError id={ERROR_ID} message={error} />

        {canWrite && (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Simpan Informasi & Renungan
            </Button>
          </div>
        )}
      </form>
    </WartaSection>
  );
}
