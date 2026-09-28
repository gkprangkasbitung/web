import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { parseTableSearchParams } from "@/components/data-table/search-params";

import { CONTOH_LOG_CONFIG, queryContohLog } from "./contoh-log";
import { ClientTableDemo, InputsDemo, ServerTableDemo } from "./demo-client";

export const metadata: Metadata = { title: "Contoh Tabel (dev)" };

/**
 * Dev-only playground for the shared table pattern (stage 3). The `.dev.tsx`
 * extension keeps it out of production builds (see next.config.ts); the
 * check below is a second guard. It is not linked from the sidebar.
 */
export default async function DevTablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const state = parseTableSearchParams(await searchParams, CONTOH_LOG_CONFIG);
  const { rows, total } = await queryContohLog(state);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Contoh Tabel (dev)"
        description="Halaman uji pola tabel bersama dengan data fiktif. Hanya ada di mode development."
      />
      <ClientTableDemo />
      <ServerTableDemo rows={rows} total={total} />
      <InputsDemo />
    </div>
  );
}
