import { cn } from "cn";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { today } from "@/lib/dates";

import { PortalBrand } from "./portal-brand";

/**
 * The two login pages (docs/design/portal-login-jemaat.html and
 * portal-login-admin.html): a side panel with the portal's welcome text on
 * large screens, and the form on the right. Below `lg` only the form column
 * shows. The panel's big line is a <p>, not a heading: it disappears on small
 * screens, so the form's own <h1> is the page heading at every width.
 */
export function PortalSplitLayout({
  variant,
  eyebrow,
  headline,
  description,
  footnote,
  children,
}: {
  variant: "jemaat" | "admin";
  eyebrow: string;
  headline: string;
  description: string;
  /** Bottom line of the panel; defaults to the copyright line. */
  footnote?: string;
  children: React.ReactNode;
}) {
  const onBrand = variant === "jemaat";
  // The year in WIB, like the public footer.
  const year = today().slice(0, 4);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "hidden w-[42%] max-w-[560px] shrink-0 flex-col px-16 py-12 lg:flex",
          onBrand ? "bg-brand text-brand-foreground" : "border-r border-border bg-muted",
        )}
      >
        <PortalBrand tone={onBrand ? "onBrand" : "default"} />
        <div className="mt-auto flex flex-col gap-[18px]">
          {onBrand ? (
            <span className="text-sm tracking-[0.14em] text-brand-muted uppercase">{eyebrow}</span>
          ) : (
            <span className="self-start rounded-full bg-badge-accent px-3 py-1.5 text-[13px] font-medium text-badge-accent-foreground">
              {eyebrow}
            </span>
          )}
          <p className="font-serif text-[52px] leading-[1.05] font-normal">{headline}</p>
          <p className={cn("text-[17px] leading-[1.65]", onBrand ? "text-brand-foreground/85" : "text-foreground/80")}>
            {description}
          </p>
        </div>
        <p className={cn("mt-12 text-[13px]", onBrand ? "text-brand-muted" : "text-muted-foreground")}>
          {footnote ?? `© ${year} GKP Rangkasbitung.`}
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col px-4 py-5 sm:px-8 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/portal"
            className="flex items-center gap-2 rounded-md text-[15px] text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Pilih portal lain
          </Link>
          <ThemeSwitcher />
        </div>
        <div className="flex flex-1 justify-center pt-10 pb-12 lg:items-center lg:pt-0">
          <div className="flex w-full max-w-[420px] flex-col gap-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Title block above each login form. */
export function PortalFormHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-serif text-[34px] leading-tight font-normal sm:text-[40px]">{title}</h1>
      <div className="text-base leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

/** Shared look of the login inputs: 52px tall, 12px radius, 16px text. */
export const portalInputClass = "h-13 rounded-xl px-4 text-base md:text-base";

/** Pill-shaped primary action, 52px tall. */
export const portalButtonClass = "h-13 w-full rounded-full text-base font-medium";

/** Inline text link inside the forms' footnotes. */
export const portalLinkClass =
  "font-medium text-primary underline underline-offset-[3px] hover:opacity-90";
