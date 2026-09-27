import { describe, expect, it } from "vitest";

import { INITIAL_TABLE_STATE, parseTableSearchParams, tableStateToSearchParams, type TableParamsConfig } from "./search-params";

const config: TableParamsConfig = {
  sortable: ["created_at", "module"],
  filters: { module: "set", created_at: "dateRange", user_email: "text" },
};

describe("table search params", () => {
  it("parses defaults from empty params", () => {
    expect(parseTableSearchParams({}, config)).toEqual(INITIAL_TABLE_STATE);
  });

  it("round-trips sort, filters, search, and pagination", () => {
    const state = {
      sorting: [{ id: "created_at", desc: true }],
      columnFilters: [
        { id: "module", value: ["warta", "auth"] },
        { id: "created_at", value: { start: "2025-09-01", end: "2025-09-30" } },
        { id: "user_email", value: "admin@" },
      ],
      globalFilter: "hapus",
      pagination: { pageIndex: 2, pageSize: 50 },
    };
    const params = tableStateToSearchParams(state, config);
    expect(params.toString()).toBe(
      "page=3&size=50&sort=created_at.desc&q=hapus&module=warta&module=auth&created_at=2025-09-01%7E2025-09-30&user_email=admin%40",
    );
    expect(parseTableSearchParams(params, config)).toEqual(state);
  });

  it("falls back on invalid values", () => {
    const state = parseTableSearchParams(
      { page: "-4", size: "37", sort: "password.asc", created_at: "2025-09-30~2025-09-01", q: "  " },
      config,
    );
    expect(state).toEqual(INITIAL_TABLE_STATE);
    expect(parseTableSearchParams({ page: "2.5", sort: "module.sideways" }, config)).toEqual(INITIAL_TABLE_STATE);
  });

  it("accepts open-ended date ranges and drops invalid dates", () => {
    expect(parseTableSearchParams({ created_at: "~2025-09-30" }, config).columnFilters).toEqual([
      { id: "created_at", value: { end: "2025-09-30" } },
    ]);
    expect(parseTableSearchParams({ created_at: "2025-02-30~" }, config).columnFilters).toEqual([]);
  });

  it("refuses filter ids that clash with reserved params", () => {
    expect(() => parseTableSearchParams({}, { filters: { page: "text" } })).toThrow(/reserved/);
  });
});
