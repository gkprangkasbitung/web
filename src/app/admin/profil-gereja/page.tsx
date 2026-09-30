import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { ProfilGerejaEditor } from "@/components/profil-gereja/profil-gereja-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadProfilGerejaAdmin } from "@/lib/profil-gereja-routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil Gereja" };

const DESCRIPTION = "Isi halaman Beranda, Tentang Kami, dan Kontak di situs publik. Bagian yang kosong tidak ditampilkan.";

/** Brief §14.1: `situs:read` to open; each section checks its own write permission. */
export default async function Page() {
  const user = await requirePermission("situs", "read");
  const supabase = await createClient();
  const { data, error } = await loadProfilGerejaAdmin(supabase);

  if (!data) {
    console.error("[/admin/profil-gereja] Failed to load:", error);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Profil Gereja" description={DESCRIPTION} />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa saat lagi.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profil Gereja" description={DESCRIPTION} />
      <ProfilGerejaEditor
        data={data}
        access={{
          canUpdate: can(user, "situs", "update"),
          canCreate: can(user, "situs", "create"),
          canDelete: can(user, "situs", "delete"),
          canEditRekening: can(user, "situs_rekening", "update"),
        }}
      />
    </div>
  );
}
