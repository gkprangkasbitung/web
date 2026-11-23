"use server";

import { redirect } from "next/navigation";

import { logActivity, quote } from "@/lib/activity-log";
import { accountLabel, isJemaat, isStaff } from "@/lib/auth/portal";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { signOutToPortal } from "@/lib/auth/sign-out";
import { loadMyJemaat } from "@/lib/jemaat-portal";
import { deleteAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function logoutJemaat(): Promise<void> {
  await signOutToPortal("jemaat");
}

export type HapusAkunResult = { error: string };

/**
 * "Hapus akun login" (brief §17.4): deletes the signed-in jemaat's own auth
 * user. The jemaat record stays; the profile (and with it profiles.jemaat_id)
 * goes with the user. Staff accounts are refused: they are managed in
 * Pengguna. Redirects to /portal on success.
 */
export async function hapusAkunLogin(): Promise<HapusAkunResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Sesi kamu sudah berakhir. Silakan masuk kembali." };
  if (isStaff(user)) {
    return { error: "Akun pengurus tidak bisa dihapus dari Portal Jemaat. Hubungi super admin." };
  }
  if (!isJemaat(user)) return { error: "Akun ini belum terhubung ke data jemaat." };
  if (user.wajibGantiPassword) return { error: "Ganti password sementara terlebih dahulu." };

  const supabase = await createClient();
  const nama = (await loadMyJemaat(supabase))?.nama ?? accountLabel(user);

  // Logged before the delete: afterwards, RLS (user_id = auth.uid()), the
  // user_id foreign key, and 0028's email trigger can no longer accept a row
  // for this user, and the service role is reserved for invites and deletes
  // (brief §3). A failed delete adds a second row saying so.
  await logActivity({ supabase, user, module: "akun", activity: `Menghapus akun login Portal Jemaat ${quote(nama)}` });

  const result = await deleteAuthUser(user.id);
  if (!result.ok) {
    console.error("[akun] Deleting the jemaat's auth user failed:", result.message);
    await logActivity({
      supabase,
      user,
      module: "akun",
      activity: `Gagal menghapus akun login Portal Jemaat ${quote(nama)}`,
    });
    return { error: "Akun gagal dihapus. Coba lagi, atau hubungi sekretariat." };
  }

  // The user and its sessions are gone; this only clears the cookies.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) console.error("[akun] Clearing the session cookies failed:", signOutError.message);
  redirect("/portal");
}
