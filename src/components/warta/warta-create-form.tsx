"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { nextSunday } from "@/lib/dates";
import { WARTA_CREATE_NOTE } from "@/lib/warta";

import {
  validateWartaInfo,
  WartaInfoFields,
  wartaInfoBody,
  wartaInfoValues,
  type WartaInfoField,
  type WartaInfoValues,
} from "./warta-info-fields";

const ERROR_ID = "warta-baru-error";

/** `/admin/warta/new` (brief §9.4): Informasi + Renungan, then straight into the editor. */
export function WartaCreateForm() {
  const router = useRouter();
  // Lazy: "next Sunday" in Asia/Jakarta, computed once when the form mounts.
  const [values, setValues] = useState<WartaInfoValues>(() => wartaInfoValues(undefined, nextSunday()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<WartaInfoField | null>(null);

  function setField<F extends WartaInfoField>(field: F, value: WartaInfoValues[F]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

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
      const data = await apiFetch<{ id: string }>("/api/admin/warta", { method: "POST", body: wartaInfoBody(values) });
      toast.success("Warta berhasil dibuat");
      router.push(`/admin/warta/${data.id}`);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-describedby={error ? ERROR_ID : undefined}>
          <WartaInfoFields
            idPrefix="warta-baru"
            values={values}
            onValueChange={setField}
            disabled={pending}
            invalidField={invalidField}
            errorId={ERROR_ID}
          />

          <p className="text-sm text-muted-foreground">{WARTA_CREATE_NOTE}</p>

          <FormError id={ERROR_ID} message={error} />

          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/warta" className={buttonVariants({ variant: "outline" })}>
              Batal
            </Link>
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
              Buat Warta
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
