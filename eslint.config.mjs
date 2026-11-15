import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import dbAccess from "./eslint-rules/db-access.mjs";

// ---------------------------------------------------------------------------
// Architecture rule 1: one way in to the database (rule in eslint-rules/db-access.mjs).
//
// - The db client (src/db/client, however the path is spelt) may be imported only by data-access
//   files (`dal.ts`, `*-dal.ts`) under src/ but NOT under src/app, and by src/auth, src/audit,
//   src/db, src/test and tests outside src/app.
// - Database drivers may be imported only in src/db and src/test.
// - Static imports, re-exports, `import()`, `require()` and `import x = require()` are all checked,
//   and a dynamic `import()` of anything but a plain string is refused, since it could hide either.
// ---------------------------------------------------------------------------

const NON_LITERAL_IMPORT = {
  selector: "ImportExpression[source.type!='Literal'][source.type!='TemplateLiteral'], ImportExpression > TemplateLiteral[expressions.length>0]",
  message: "Use a plain string in import(), so the database guard can check it (architecture rule 1).",
};

const SOURCES = ["src/**/*.{ts,tsx,js,jsx,mts,cts}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { plugins: { local: dbAccess } },
  // Everywhere in src except src/db and src/test: no db client, no drivers.
  {
    files: SOURCES,
    ignores: ["src/db/**", "src/test/**"],
    rules: {
      "local/db-access": ["error", { allowClient: false }],
      "no-restricted-syntax": ["error", NON_LITERAL_IMPORT],
    },
  },
  // Data-access files (not under src/app), src/auth, src/audit and tests (not under src/app): the db client, still no drivers.
  {
    files: ["src/**/dal.ts", "src/**/*-dal.ts", "src/auth/**/*.ts", "src/audit/**/*.ts", "src/**/*.test.ts"],
    ignores: ["src/app/**"],
    rules: {
      "local/db-access": ["error", { allowClient: true }],
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
