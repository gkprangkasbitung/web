import { cn } from "cn";

import { getInitials } from "@/lib/format";

export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-badge-neutral text-xs font-semibold text-badge-neutral-foreground",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
