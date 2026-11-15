import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------------------------------------------------------------------------
// Architecture rule 1: one way in to the database.
//
// - The db client (`@/db/client`, or any path to it) may be imported only by data-access files
//   (`dal.ts`, `*-dal.ts`) under src/ but NOT under src/app, and by src/auth, src/audit, src/db,
//   src/test and tests outside src/app.
// - Database drivers may be imported only in src/db and src/test.
// - Dynamic `import()` and `require()` of either are banned in the same places, and so is a
//   dynamic `import()` of anything but a plain string, which could hide either.
// ---------------------------------------------------------------------------

const DB_CLIENT_MESSAGE =
  "Only data-access modules (src/**/dal.ts, src/**/*-dal.ts, not under src/app), src/auth, src/db, src/audit and tests may use the database. Call a data-access function instead (architecture rule 1).";
const DRIVER_MESSAGE = "Database drivers are used only in src/db (and src/test). Use getDb() from a data-access module (architecture rule 1).";

const CLIENT_PATTERNS = ["**/db/client", "**/db/client.*"];
const DRIVER_PATTERNS = [
  "@neondatabase/*",
  "@electric-sql/pglite",
  "@electric-sql/pglite/*",
  "drizzle-orm/neon-*",
  "drizzle-orm/neon-*/*",
  "drizzle-orm/pglite",
  "drizzle-orm/pglite/*",
  "drizzle-orm/node-postgres",
  "drizzle-orm/node-postgres/*",
  "drizzle-orm/postgres-js",
  "drizzle-orm/postgres-js/*",
  "pg",
  "postgres",
];

// esquery regexes for import()/require() sources.
const CLIENT_RE = "/(^|[/])db[/]client([.]|$)/";
const DRIVER_RE = "/^(@neondatabase[/]|@electric-sql[/]pglite|drizzle-orm[/](neon-|pglite|node-postgres|postgres-js)|pg$|postgres$)/";

const dynamicBans = (sources) => [
  ...sources.flatMap(([re, message]) => [
    { selector: `ImportExpression[source.value=${re}]`, message },
    { selector: `CallExpression[callee.name='require'][arguments.0.value=${re}]`, message },
  ]),
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: "Use a plain string in import(), so the database guard can check it (architecture rule 1).",
  },
];

const SOURCES = ["src/**/*.{ts,tsx,js,jsx,mts,cts}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Everywhere in src except src/db and src/test: no db client, no drivers.
  {
    files: SOURCES,
    ignores: ["src/db/**", "src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: CLIENT_PATTERNS, message: DB_CLIENT_MESSAGE },
            { group: DRIVER_PATTERNS, message: DRIVER_MESSAGE },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...dynamicBans([
          [CLIENT_RE, DB_CLIENT_MESSAGE],
          [DRIVER_RE, DRIVER_MESSAGE],
        ]),
      ],
    },
  },
  // Data-access files (not under src/app), src/auth, src/audit and tests (not under src/app): the db client, still no drivers.
  {
    files: ["src/**/dal.ts", "src/**/*-dal.ts", "src/auth/**/*.ts", "src/audit/**/*.ts", "src/**/*.test.ts"],
    ignores: ["src/app/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: DRIVER_PATTERNS, message: DRIVER_MESSAGE }] }],
      "no-restricted-syntax": ["error", ...dynamicBans([[DRIVER_RE, DRIVER_MESSAGE]])],
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
