import { PublicShell } from "@/components/public/public-shell";
import { loadSosialMedia } from "@/lib/public/site-content";

/**
 * The public site (brief §8). No `loading.tsx` anywhere in this group: a
 * Suspense boundary would start streaming with status 200, and `notFound()`
 * on `/warta/[slug]` must answer a real 404.
 *
 * The footer's social links come from Profil Gereja (stage 11a), so every
 * public page renders per request, like the data pages already did (9b).
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell sosialMedia={await loadSosialMedia()}>{children}</PublicShell>;
}
