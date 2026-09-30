import "server-only";

import type { DataTableState } from "@/components/data-table/search-params";
import type { ActivityLogRow } from "@/lib/activity-log-table";
import { ACTIVITY_MODULES, type ActivityModule } from "@/lib/activity-modules";
import { escapeLike } from "@/lib/api-mutation";
import { jakartaTimestampBounds, type DateRange } from "@/lib/dates";
import type { ServerSupabase } from "@/lib/supabase/server";

export type ActivityLogPage = {
  rows: ActivityLogRow[];
  total: number;
  /** The page actually returned (0-based); may be lower than requested. */
  pageIndex: number;
};

function moduleFilter(state: DataTableState): ActivityModule | null {
  const value = state.columnFilters.find((f) => f.id === "module")?.value;
  // Single-select in the UI (brief §9.13); only a known module is accepted.
  const first = Array.isArray(value) ? value[0] : undefined;
  return typeof first === "string" && (ACTIVITY_MODULES as readonly string[]).includes(first)
    ? (first as ActivityModule)
    : null;
}

/**
 * One server-side page of Log Aktivitas (brief §9.13): search over activity
 * and email through `search_activity_logs` (a bound parameter, wildcards
 * escaped), then module, WIB date range (end date through 23:59:59), order,
 * and range applied by PostgREST. `state` comes from
 * `parseTableSearchParams`, which already limits `size` to 10/20/50/100 and
 * `sort` to the whitelisted columns. A page past the end falls back to the
 * last page.
 */
export async function loadActivityLogPage(
  supabase: ServerSupabase,
  state: DataTableState,
): Promise<{ data: ActivityLogPage | null; error: string | null }> {
  const search = state.globalFilter.trim();
  const moduleKey = moduleFilter(state);
  const range = state.columnFilters.find((f) => f.id === "created_at")?.value as Partial<DateRange> | undefined;
  const bounds = jakartaTimestampBounds(range ?? {});
  const sort = state.sorting[0] ?? { id: "created_at", desc: true };
  const { pageSize } = state.pagination;

  const query = (pageIndex: number) => {
    let q = supabase
      .rpc("search_activity_logs", search ? { p_search: escapeLike(search) } : {}, { count: "exact" })
      .select("id, created_at, user_email, module, activity, ip_address");
    if (moduleKey) q = q.eq("module", moduleKey);
    if (bounds.gte) q = q.gte("created_at", bounds.gte);
    if (bounds.lt) q = q.lt("created_at", bounds.lt);
    q = q.order(sort.id, { ascending: !sort.desc });
    if (sort.id !== "created_at") q = q.order("created_at", { ascending: false });
    return q.order("id", { ascending: false }).range(pageIndex * pageSize, pageIndex * pageSize + pageSize - 1);
  };

  let pageIndex = state.pagination.pageIndex;
  let result = await query(pageIndex);

  // PostgREST answers 416 (PGRST103) for an offset past the end.
  if (result.error?.code === "PGRST103" || (!result.error && result.data.length === 0 && pageIndex > 0)) {
    const countOnly = await query(0);
    if (countOnly.error) return { data: null, error: countOnly.error.message };
    const total = countOnly.count ?? 0;
    pageIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
    result = pageIndex === 0 ? countOnly : await query(pageIndex);
  }
  if (result.error) return { data: null, error: result.error.message };

  return { data: { rows: result.data, total: result.count ?? 0, pageIndex }, error: null };
}
