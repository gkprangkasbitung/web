import type { TableParamsConfig } from "@/components/data-table/search-params";

/**
 * Log Aktivitas's URL table state (brief §9.13), shared by the server page
 * (parseTableSearchParams) and the client table (useUrlTableState). Only
 * these columns may be sorted; `module` and `created_at` are the filters.
 */
export const ACTIVITY_LOG_TABLE_CONFIG = {
  sortable: ["created_at", "module"],
  filters: { module: "set", created_at: "dateRange" },
} as const satisfies TableParamsConfig;

export type ActivityLogRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  module: string;
  activity: string;
  ip_address: string | null;
};
