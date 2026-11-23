"use server";

import { revalidatePath } from "next/cache";

import { requireJemaat } from "@/lib/auth/session";
import { ajukanPerubahan, batalkanPengajuan, type PortalMutationResult } from "@/lib/portal/mutations";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Action wrappers for the "Ajukan perubahan data" form and its
 * "Batalkan" button (brief §17.2). Each re-checks the session itself
 * (defense in depth, the same as every admin page re-calling
 * `requirePermission`), builds the user's own session client, and
 * revalidates `/jemaat/profil` on success so the page's own data (the
 * status badge, the disabled "Ajukan perubahan data" button) is current on
 * the next render.
 */

export async function submitPengajuanAction(input: unknown): Promise<PortalMutationResult<{ id: string }>> {
  const user = await requireJemaat();
  const supabase = await createClient();
  const result = await ajukanPerubahan({ supabase, user }, input);
  if (result.ok) revalidatePath("/jemaat/profil");
  return result;
}

export async function batalkanPengajuanAction(id: string): Promise<PortalMutationResult<null>> {
  const user = await requireJemaat();
  const supabase = await createClient();
  const result = await batalkanPengajuan({ supabase, user }, id);
  if (result.ok) revalidatePath("/jemaat/profil");
  return result;
}
