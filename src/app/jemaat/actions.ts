"use server";

import { signOutToPortal } from "@/lib/auth/sign-out";

export async function logoutJemaat(): Promise<void> {
  await signOutToPortal("jemaat");
}
