import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * The database handle every data-access function uses. Both the Neon HTTP driver (production)
 * and PGlite (tests) satisfy it. `transaction` is left out on purpose: neon-http has none (architecture rule 4).
 */
export type Db = Omit<PgDatabase<PgQueryResultHKT, typeof schema>, 'transaction'>;

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(url), { schema });
}

let instance: Db | undefined;
let testInstance: Db | undefined;

/** Lazily created so importing this module never needs the env var (e.g. during build analysis). */
export function getDb(): Db {
  if (testInstance) return testInstance;
  return (instance ??= create());
}

/**
 * Points every data-access function at another database (an in-process PGlite from `src/test/db.ts`).
 * Tests only: refuses to run outside vitest so it can never redirect a deployed app.
 */
export function setDbForTests(db: Db | undefined): void {
  if (!process.env.VITEST) throw new Error('setDbForTests is for tests only');
  testInstance = db;
}

/** Runs raw SQL and returns its rows. Both drivers answer `{ rows }`; the shared Db type cannot say so. */
export async function queryRows<T>(query: SQL, db: Db = getDb()): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}
