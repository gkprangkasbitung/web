import { cn } from "cn";
import { CircleAlertIcon, InfoIcon } from "lucide-react";

/**
 * Tinted notice box from docs/design/portal-login-*.html. `error` is
 * announced right away (role="alert"); `info` politely (role="status").
 * Renders an empty live region when there is no message, so a message that
 * appears later is still announced.
 */
export function PortalAlert({
  id,
  tone,
  children,
  className,
}: {
  id?: string;
  tone: "error" | "info";
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? CircleAlertIcon : InfoIcon;
  return (
    <div id={id} role={tone === "error" ? "alert" : "status"} className={cn("empty:hidden", className)}>
      {children ? (
        <p
          className={cn(
            "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed",
            tone === "error"
              ? "bg-badge-destructive text-badge-destructive-foreground"
              : "bg-badge-accent text-badge-accent-foreground",
          )}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          <span>{children}</span>
        </p>
      ) : null}
    </div>
  );
}
