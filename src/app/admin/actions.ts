"use server";

import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity-log";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function logout(): Promise<void> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  // Log while the session is still valid: RLS only accepts the user's own rows.
  if (user) await logActivity({ supabase, user, module: "auth", activity: "Logout" });
  await supabase.auth.signOut();
  redirect("/login");
}
