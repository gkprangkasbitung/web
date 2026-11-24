import { CircleAlertIcon } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** The page's data couldn't be loaded. */
export function PemilihanLoadError({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Gagal memuat data</AlertTitle>
        <AlertDescription>{message ?? "Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi."}</AlertDescription>
      </Alert>
    </div>
  );
}
