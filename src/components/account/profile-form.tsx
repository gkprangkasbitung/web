"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** "Nama Lengkap" with "Simpan" (brief §9.14). An empty value saves as null. */
export function ProfileForm({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(fullName ?? "");
  const [saved, setSaved] = useState(fullName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ fullName: string | null }>("/api/account/profile", {
        method: "PATCH",
        body: { fullName: value },
      });
      setValue(data.fullName ?? "");
      setSaved(data.fullName ?? "");
      toast.success(data.fullName ? "Nama lengkap disimpan" : "Nama lengkap dikosongkan");
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-nama`}>Nama Lengkap</Label>
        <Input
          id={`${id}-nama`}
          autoComplete="name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
          aria-describedby={`${id}-hint ${id}-error`}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Kosongkan kalau ingin menampilkan email saja.
        </p>
      </div>
      <FormError id={`${id}-error`} message={error} />
      <div>
        <Button type="submit" disabled={pending || value.trim() === saved.trim()} focusableWhenDisabled>
          {pending && <Loader2Icon aria-hidden className="motion-safe:animate-spin" />}
          Simpan
        </Button>
      </div>
    </form>
  );
}
