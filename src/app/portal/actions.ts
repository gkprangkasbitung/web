"use server";

import { signOutToPortal } from "@/lib/auth/sign-out";

/** "Keluar" on /portal, for an account signed in without access to the page it tried. */
export async function logoutFromPortal(): Promise<void> {
  await signOutToPortal(null);
}
