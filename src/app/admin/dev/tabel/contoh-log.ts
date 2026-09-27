import type { TableParamsConfig, DataTableState } from "@/components/data-table/search-params";
import { ACTIVITY_MODULES, type ActivityModule } from "@/lib/activity-modules";
import { jakartaTimestampBounds, type DateRange } from "@/lib/dates";

/**
 * Fictional activity rows for the server-side table demo, standing in for
 * `activity_log` until stage 10. Emails use the reserved `.test` domain and
 * IPs the TEST-NET range.
 */
export type ContohLog = {
  id: string;
  created_at: string;
  user_email: string;
  module: ActivityModule;
  activity: string;
  ip_address: string;
};

export const CONTOH_LOG_CONFIG = {
  sortable: ["created_at", "module"],
  filters: { module: "set", created_at: "dateRange" },
} as const satisfies TableParamsConfig;

const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("id");

const BASE = Date.parse("2025-09-14T02:30:00Z");
const EMAILS = ["contoh-admin@gkp.test", "contoh-editor@gkp.test", "contoh-super@gkp.test"];

const ROWS: ContohLog[] = Array.from({ length: 137 }, (_, i) => {
  const moduleKey = ACTIVITY_MODULES[(i * 5) % ACTIVITY_MODULES.length]!;
  return {
    id: `log-${i + 1}`,
    created_at: new Date(BASE - i * 7 * 3_600_000 - (i % 4) * 11 * 60_000).toISOString(),
    user_email: EMAILS[i % EMAILS.length]!,
    module: moduleKey,
    activity: `Contoh aktivitas ${i + 1} di modul ${moduleKey}`,
    ip_address: `192.0.2.${(i % 250) + 1}`,
  };
});

/** What the stage 10 query will do in SQL: filter, order, count, and slice one page. */
export async function queryContohLog(state: DataTableState): Promise<{ rows: ContohLog[]; total: number }> {
  // A little latency so the loading skeleton is visible.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const query = normalizeSearch(state.globalFilter);
  const modules = state.columnFilters.find((f) => f.id === "module")?.value as (string | null)[] | undefined;
  const range = state.columnFilters.find((f) => f.id === "created_at")?.value as Partial<DateRange> | undefined;
  const bounds = jakartaTimestampBounds(range ?? {});

  let rows = ROWS.filter(
    (row) =>
      (!query || normalizeSearch(`${row.activity} ${row.user_email}`).includes(query)) &&
      (!modules || modules.includes(row.module)) &&
      (!bounds.gte || Date.parse(row.created_at) >= Date.parse(bounds.gte)) &&
      (!bounds.lt || Date.parse(row.created_at) < Date.parse(bounds.lt)),
  );

  // Unsorted means the default: newest first.
  const sort = state.sorting[0] ?? { id: "created_at", desc: true };
  rows = [...rows].sort((a, b) => {
    const key = sort.id as keyof ContohLog;
    const result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : b.created_at.localeCompare(a.created_at);
    return sort.desc ? -result : result;
  });

  const { pageIndex, pageSize } = state.pagination;
  return { rows: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), total: rows.length };
}
