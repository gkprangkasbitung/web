import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { WartaCreateForm } from "@/components/warta/warta-create-form";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Buat Warta Baru" };

export default async function Page() {
  await requirePermission("warta", "create");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Buat Warta Baru" description="Isi informasi kebaktian dan renungan. Warta disimpan sebagai draft." />
      <WartaCreateForm />
    </div>
  );
}
