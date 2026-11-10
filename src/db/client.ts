import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(url), { schema });
}

let instance: ReturnType<typeof create> | undefined;

/** Lazily created so importing this module never needs the env var (e.g. during build analysis). */
export function getDb() {
  return (instance ??= create());
}
