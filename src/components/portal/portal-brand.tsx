import { cn } from "cn";
import Link from "next/link";

/** "GKP Rangkasbitung" with the round mark, linking to the public site. */
export function PortalBrand({ tone = "default", className }: { tone?: "default" | "onBrand"; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3 text-[17px] font-semibold hover:opacity-90", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[34px] shrink-0 items-center justify-center rounded-full",
          tone === "onBrand" ? "border-[1.5px] border-brand-foreground" : "bg-brand text-brand-foreground",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M12 3v18M6 9h12" />
        </svg>
      </span>
      GKP Rangkasbitung
    </Link>
  );
}
