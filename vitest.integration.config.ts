import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Route handlers against the local Supabase stack (`supabase start`), run with
 * `pnpm test:integration`. Kept out of `pnpm test` because it needs the stack.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // One Supabase stack, shared rows: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
