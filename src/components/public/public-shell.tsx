import { today } from "@/lib/dates";
import type { SosialMedia } from "@/lib/public/site-content";

import { PublicHeader } from "./public-header";

/**
 * The public site's shell (brief §8, docs/design/*.html): a header, a
 * footer "© {year} GKP Rangkasbitung." with the social links from Profil
 * Gereja (docs/design/beranda.html "Ikuti kami"; hidden when none is set),
 * `lang="id"` (root layout). The
 * header itself is a client component (see `public-header.tsx`); everything
 * else here stays a plain Server Component, since none of it is interactive.
 */
const SOCIAL_LABELS = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" } as const;

export function PublicShell({ sosialMedia, children }: { sosialMedia: SosialMedia | null; children: React.ReactNode }) {
  // The year in WIB, not UTC: on 1 January before 07:00 WIB UTC is still last year.
  const year = today().slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#konten"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50"
      >
        Langsung ke konten
      </a>

      <PublicHeader />

      <main id="konten" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="bg-brand text-brand-muted">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-8">
          <span className="font-semibold text-brand-foreground">GKP Rangkasbitung</span>
          {sosialMedia && (
            <nav aria-label="Sosial media" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-semibold text-brand-foreground">Ikuti kami</span>
              {(Object.keys(SOCIAL_LABELS) as (keyof SosialMedia)[]).map((platform) => {
                const url = sosialMedia[platform];
                return (
                  url && (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm underline-offset-4 outline-none hover:text-brand-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {SOCIAL_LABELS[platform]}
                      <span className="sr-only"> (tab baru)</span>
                    </a>
                  )
                );
              })}
            </nav>
          )}
          <span>© {year} GKP Rangkasbitung.</span>
        </div>
      </footer>
    </div>
  );
}

/** Page width and padding for public pages: 16px on mobile, 32px on desktop (brief §2). */
export function PublicContainer({ narrow = false, children }: { narrow?: boolean; children: React.ReactNode }) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-10 px-4 py-8 md:px-8 md:py-12 ${narrow ? "max-w-3xl" : "max-w-5xl"}`}>
      {children}
    </div>
  );
}

/** A simple light title, used only on `/warta` (no dark title band there, matching warta-detail.html's plain header). */
export function PublicPageHeader({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-serif text-4xl font-normal tracking-tight text-balance">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}

/**
 * The dark "page-title band" (brief §9c instruction A), shared by Tentang
 * Kami, Jadwal Ibadah, and Kontak: breadcrumb, H1, one-line description.
 * Sits flush under the brand header with no visible seam between them.
 */
export function PublicPageTitleBand({
  breadcrumb,
  title,
  description,
}: {
  breadcrumb: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="bg-brand text-brand-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-12 md:px-8 md:py-16">
        <span className="text-sm text-brand-muted">{breadcrumb}</span>
        <h1 className="font-serif text-4xl font-normal tracking-tight text-balance md:text-6xl">{title}</h1>
        {description && <p className="max-w-2xl text-base text-brand-muted md:text-lg">{description}</p>}
      </div>
    </div>
  );
}

/**
 * A block of content the church still has to supply (brief §1, §12.4). The
 * visitor sees a neutral "being prepared" note; the call site carries a
 * `TODO(konten)` comment saying what belongs there. Never fill these with
 * invented church facts.
 */
export function PlaceholderBlock({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-input p-5">
      {title && <p className="font-medium">{title}</p>}
      <p className="text-sm text-muted-foreground">{children ?? "Konten sedang disiapkan."}</p>
    </div>
  );
}

/** A labelled `<section>` with an `h2`, the building block of every public page. */
export function PublicSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-serif text-2xl font-normal tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
