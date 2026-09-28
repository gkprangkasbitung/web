import { CircleAlertIcon } from "lucide-react";

/** Plain-language form error, announced to screen readers. */
export function FormError({ id, message }: { id: string; message: string | null }) {
  return (
    <div id={id} role="alert" aria-live="polite" className="min-h-0 empty:hidden">
      {message && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
