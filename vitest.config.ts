import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["src/**/*.test.ts"] },
      },
      {
        // Component tests run in jsdom with Testing Library matchers.
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
