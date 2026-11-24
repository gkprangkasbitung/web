import type { Metadata } from "next";

import { PemilihanLoadError } from "@/components/pemilihan/load-error";
import { PemilihanManager } from "@/components/pemilihan/pemilihan-manager";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadPemilihanList } from "@/lib/pemilihan/admin-data";
import type { PemilihanRow } from "@/lib/pemilihan/admin-types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pemilihan" };

export default async function Page() {
  const user = await requirePermission("pemilihan", "read");
  const supabase = await createClient();

  let rows: PemilihanRow[];
  try {
    rows = await loadPemilihanList(supabase);
  } catch {
    return <PemilihanLoadError title="Pemilihan" />;
  }

  return (
    <PemilihanManager
      rows={rows}
      canCreate={can(user, "pemilihan", "create")}
      canUpdate={can(user, "pemilihan", "update")}
      canDelete={can(user, "pemilihan", "delete")}
      canBantu={can(user, "pemilihan_bantu", "create")}
    />
  );
}
