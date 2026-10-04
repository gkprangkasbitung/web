"use server";

import { signOutToPortal } from "@/lib/auth/sign-out";

export async function logout(): Promise<void> {
  await signOutToPortal("admin");
}
