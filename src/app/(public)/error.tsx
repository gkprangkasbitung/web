"use client";

import { Button } from "@/components/ui/button";

/** A failed load on a public page: a plain message and a retry, never a blank screen (brief §2). */
export default function PublicError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-8 md:py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Gagal memuat halaman</h1>
      <p className="text-muted-foreground">Terjadi gangguan saat memuat halaman ini. Coba lagi beberapa saat lagi.</p>
      <div>
        <Button onClick={() => retry()}>Coba lagi</Button>
      </div>
    </div>
  );
}
