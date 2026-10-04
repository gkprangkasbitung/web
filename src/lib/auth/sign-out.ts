import "server-only";

import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";

import { PORTAL_LABEL, type PortalArea } from "./portal";
import { getAuthenticatedUser } from "./session";

/**
 * "Keluar" from either portal (or from /portal itself): logs it, signs out,
 * and returns to /portal (stage 11f). Logs while the session is still valid:
 * RLS only accepts the user's own rows.
 */
export async function signOutToPortal(area: PortalArea | null): Promise<never> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  if (user) {
    await logActivity({
      supabase,
      user,
      module: "auth",
      activity: area ? `Logout dari ${PORTAL_LABEL[area]}` : "Logout",
    });
  }
  await supabase.auth.signOut();
  redirect("/portal");
}
