import { cn } from "cn";

import { avatarColorIndex, getInitials } from "@/lib/format";

/** A calm background chosen deterministically from the name (brief §9.9), not from the row's identity. */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const index = avatarColorIndex(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
      style={{
        backgroundColor: `var(--avatar-${index})`,
        color: `var(--avatar-${index}-foreground)`,
      }}
    >
      {getInitials(name)}
    </span>
  );
}
