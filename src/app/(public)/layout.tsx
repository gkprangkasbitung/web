import { PublicShell } from "@/components/public/public-shell";

/**
 * The public site (brief §8). No `loading.tsx` anywhere in this group: a
 * Suspense boundary would start streaming with status 200, and `notFound()`
 * on `/warta/[slug]` must answer a real 404.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
