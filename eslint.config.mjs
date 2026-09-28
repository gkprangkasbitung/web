import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // "Today" must be computed in Asia/Jakarta (brief §11); use lib/dates.ts.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
          message:
            "Don't derive dates with toISOString().slice(); use today()/addDays() from @/lib/dates (Asia/Jakarta).",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/types/database.ts", "supabase/**"]),
]);
