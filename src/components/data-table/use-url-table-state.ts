"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import {
  parseTableSearchParams,
  tableStateToSearchParams,
  type DataTableState,
  type TableParamsConfig,
} from "./search-params";
import type { ServerTableOptions } from "./use-data-table";

/**
 * Keeps a server-side table's state in the URL. Every change replaces the
 * search params (other params, such as `?error=`, are kept), and the server
 * page re-renders with `parseTableSearchParams(searchParams, config)`.
 * Pass a module-level `config` so it stays stable.
 */
export function useUrlTableState(config: TableParamsConfig): Omit<ServerTableOptions, "rowCount"> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const state = useMemo(
    () => parseTableSearchParams(new URLSearchParams(searchParams.toString()), config),
    [searchParams, config],
  );

  function onStateChange(next: DataTableState) {
    const managed = ["page", "size", "sort", "q", ...Object.keys(config.filters ?? {})];
    const params = new URLSearchParams(searchParams.toString());
    for (const key of managed) params.delete(key);
    for (const [key, value] of tableStateToSearchParams(next, config)) params.append(key, value);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { state, onStateChange, isPending };
}
