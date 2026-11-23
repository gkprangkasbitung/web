import { Skeleton } from "@/components/ui/skeleton";

/** One shared skeleton for every page under `/jemaat` (brief §2), while the layout's sidebar/bottom nav render as usual. */
export default function JemaatLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-32 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-32 w-full max-w-xl rounded-xl" />
    </div>
  );
}
