import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DB_CLIENT_MESSAGE =
  "Only data-access modules (src/**/dal.ts, src/**/*-dal.ts), src/auth, src/db, src/audit and tests may use the database. Call a data-access function instead (architecture rule 1).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Architecture rule 1: one way in to the database.
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mts,cts}"],
    ignores: [
      "src/**/dal.ts",
      "src/**/*-dal.ts",
      "src/auth/**",
      "src/db/**",
      "src/audit/**",
      "src/test/**",
      "src/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // Matches "@/db/client" and any relative path to it.
          patterns: [{ group: ["**/db/client", "**/db/client.*"], message: DB_CLIENT_MESSAGE }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees: other checkouts of this repo, linted from their own root.
    ".claude/**",
  ]),
]);

export default eslintConfig;
