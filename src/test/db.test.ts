import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb, queryRows } from '@/db/client';
import { createTestDb } from './db';

describe('test database', () => {
  it('applies the real migrations to PGlite and becomes the db data-access code uses', async () => {
    const db = await createTestDb();
    expect(getDb()).toBe(db);
    const rows = await queryRows<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.map(r => r.table_name)).toEqual([
      'audit_log', 'auth_sessions', 'auth_throttle', 'debrief_flags', 'debriefs', 'invitations', 'memberships',
      'practice_scenarios', 'practices', 'scenarios', 'sessions', 'transcript_turns', 'users',
    ]);
  });
});
