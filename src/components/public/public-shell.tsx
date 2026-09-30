import Link from "next/link";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { today } from "@/lib/dates";

import { PublicMobileNav, PublicNav } from "./public-nav";

/**
 * The public site's shell (brief §8): a header with the name, the five links,
 * and the theme switcher; the footer "© {year} GKP Rangkasbitung.".
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
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

      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 md:px-8">
          <Link
            href="/"
            className="mr-auto truncate rounded-lg text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            GKP Rangkasbitung
          </Link>
          <PublicNav />
          <ThemeSwitcher />
          <PublicMobileNav />
        </div>
      </header>

      <main id="konten" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground md:px-8">
          © {year} GKP Rangkasbitung.
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

/** A public page's title and one-line description. */
export function PublicPageHeader({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
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
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
