import Link from "next/link";

import { today } from "@/lib/dates";
import { flattenPublicNav } from "@/lib/public/nav";
import type { FooterContent, SosialMedia } from "@/lib/public/site-content";

import { PublicHeader } from "./public-header";

const SOCIAL_LABELS = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" } as const;

/**
 * The footer's "Jemaat" column (stage 11g): the same `lib/public/nav.ts`
 * config as the header, so the two can't drift apart. Beranda and Kontak are
 * left out (Kontak sits under "Hubungi" below); the "Tentang Kami" dropdown
 * is flattened to its own items.
 */
const JEMAAT_LINKS = flattenPublicNav().filter((link) => link.href !== "/kontak");

const footerLinkClass =
  "w-fit rounded-sm underline-offset-4 outline-none hover:text-footer-heading hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={footerLinkClass}>
      {children}
      <span className="sr-only"> (tab baru)</span>
    </a>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2.5">
      <span className="font-semibold text-footer-heading">{title}</span>
      {children}
    </nav>
  );
}

/**
 * The footer from docs/design/beranda.html, on every public page: the
 * church name and alamat, then "Jemaat", "Hubungi", and "Ikuti kami"
 * columns, and "© {year} GKP Rangkasbitung." below a divider. Its colors
 * are the themed `--footer*` tokens (globals.css), so it follows Terang /
 * Gelap / Sistem and always stands apart from the page background. Alamat,
 * WhatsApp, and the social links come from Profil Gereja and are hidden when
 * unset; "Ikuti kami" is left out when no social link is set.
 */
function PublicFooter({ footer }: { footer: FooterContent }) {
  // The year in WIB, not UTC: on 1 January before 07:00 WIB UTC is still last year.
  const year = today().slice(0, 4);
  const { sosialMedia, alamat, waLink } = footer;

  return (
    <footer className="border-t border-footer-border bg-footer text-sm text-footer-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pt-16 pb-10 md:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:gap-12">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <span className="text-lg font-semibold text-footer-heading">GKP Rangkasbitung</span>
            {alamat && <p className="max-w-xs leading-relaxed whitespace-pre-line">{alamat}</p>}
          </div>
          <FooterColumn title="Jemaat">
            {JEMAAT_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={footerLinkClass}>
                {link.label}
              </Link>
            ))}
          </FooterColumn>
          <FooterColumn title="Hubungi">
            <Link href="/kontak" className={footerLinkClass}>
              Kontak
            </Link>
            {waLink && <ExternalLink href={waLink}>WhatsApp</ExternalLink>}
          </FooterColumn>
          {sosialMedia && (
            <FooterColumn title="Ikuti kami">
              {(Object.keys(SOCIAL_LABELS) as (keyof SosialMedia)[]).map((platform) => {
                const url = sosialMedia[platform];
                return (
                  url && (
                    <ExternalLink key={platform} href={url}>
                      {SOCIAL_LABELS[platform]}
                    </ExternalLink>
                  )
                );
              })}
            </FooterColumn>
          )}
        </div>
        <p className="border-t border-footer-border pt-6 text-footer-muted">© {year} GKP Rangkasbitung.</p>
      </div>
    </footer>
  );
}

/**
 * The public site's shell (brief §8, docs/design/*.html): a skip link, the
 * header, and the footer, with `lang="id"` set by the root layout. The
 * header itself is a client component (see `public-header.tsx`); everything
 * else here stays a plain Server Component, since none of it is interactive.
 */
export function PublicShell({ footer, children }: { footer: FooterContent; children: React.ReactNode }) {
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

      <PublicFooter footer={footer} />
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

/** A simple light title, used only on the public 404 page (every real page has the dark title band). */
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
 * Kami, Jadwal Ibadah, Warta, Warta detail, and Kontak: breadcrumb, an
 * optional eyebrow line (Warta detail's date), H1, one-line description.
 * Sits flush under the brand header with no visible seam between them.
 */
export function PublicPageTitleBand({
  breadcrumb,
  eyebrow,
  title,
  description,
}: {
  breadcrumb: React.ReactNode;
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <header className="bg-brand text-brand-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-12 md:px-8 md:py-16">
        <span className="text-sm text-brand-muted">{breadcrumb}</span>
        {eyebrow && <p className="text-sm font-medium text-brand-foreground">{eyebrow}</p>}
        <h1 className="font-serif text-4xl font-normal tracking-tight text-balance md:text-6xl">{title}</h1>
        {description && <p className="max-w-2xl text-base text-brand-muted md:text-lg">{description}</p>}
      </div>
    </header>
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

/**
 * Beranda's section heading (docs/design/beranda.html): a small uppercase
 * eyebrow over a large serif `h2`. `tone="brand"` is for the dark band.
 */
export function EyebrowHeading({
  id,
  eyebrow,
  title,
  align = "start",
  tone = "default",
}: {
  id: string;
  eyebrow: string;
  title: string;
  align?: "start" | "center";
  tone?: "default" | "brand";
}) {
  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : ""}`}>
      <span
        className={`text-xs font-medium tracking-[0.12em] uppercase md:text-sm ${tone === "brand" ? "text-brand-muted" : "text-primary"}`}
      >
        {eyebrow}
      </span>
      <h2
        id={id}
        className="font-serif text-4xl leading-[1.1] font-normal tracking-tight text-balance md:text-[3.25rem]"
      >
        {title}
      </h2>
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
