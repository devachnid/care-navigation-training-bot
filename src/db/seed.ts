import { config } from 'dotenv';
import { notInArray } from 'drizzle-orm';
import { scenarios as seedScenarios } from '../scenarios/seed';
import { scenarioSchema } from '../scenarios/types';
import { getDb } from './client';
import { scenarios } from './schema';

config({ path: '.env.local', quiet: true });

async function main() {
  const db = getDb();
  const rows = seedScenarios.map(s => scenarioSchema.parse(s));
  const ids = rows.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate scenario id in seed file');

  for (const row of rows) {
    await db.insert(scenarios).values(row).onConflictDoUpdate({ target: scenarios.id, set: { ...row } });
  }
  // Scenarios removed from the file are hidden, never deleted: past sessions still refer to them.
  await db.update(scenarios).set({ active: false }).where(notInArray(scenarios.id, ids));
  console.log(`${rows.length} scenarios upserted`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
