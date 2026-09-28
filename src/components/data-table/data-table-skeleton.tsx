import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder body rows while a table loads. */
export function DataTableSkeletonRows({ columnCount, rowCount = 5 }: { columnCount: number; rowCount?: number }) {
  return Array.from({ length: rowCount }, (_, row) => (
    <tr key={row} className="h-12 border-b last:border-0">
      {Array.from({ length: columnCount }, (_, column) => (
        <td key={column} className="px-3">
          <Skeleton className={column === 0 ? "h-4 w-32" : "h-4 w-20"} />
        </td>
      ))}
    </tr>
  ));
}

/** A whole table placeholder, for a route's `loading.tsx`. */
export function DataTableSkeleton({
  columnCount,
  rowCount = 5,
  withToolbar = true,
}: {
  columnCount: number;
  rowCount?: number;
  withToolbar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Memuat…</span>
      {withToolbar && (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full">
          <tbody>
            <tr className="h-10 border-b">
              {Array.from({ length: columnCount }, (_, column) => (
                <td key={column} className="px-3">
                  <Skeleton className="h-3 w-16" />
                </td>
              ))}
            </tr>
            <DataTableSkeletonRows columnCount={columnCount} rowCount={rowCount} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
