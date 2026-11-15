import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';

const MIGRATIONS = path.resolve(import.meta.dirname, '../../drizzle');

/**
 * A fresh in-process Postgres with the real migrations from `./drizzle` applied.
 * Also makes it the database every data-access function uses (via `setDbForTests`).
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  setDbForTests(db);
  return db;
}

/** Empties every table except the migrations journal. */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    truncate table audit_log, debrief_flags, debriefs, transcript_turns, sessions, practice_scenarios,
      scenarios, invitations, auth_throttle, auth_sessions, memberships, practices, users
    restart identity cascade
  `);
}
