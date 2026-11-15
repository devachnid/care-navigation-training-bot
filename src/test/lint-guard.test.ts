import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Architecture rule 1 is enforced by ESLint (eslint-rules/db-access.mjs). These run the real
// config on snippets "placed" at given paths, so every known way round the guard stays closed.
const ROOT = path.resolve(import.meta.dirname, '../..');
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

async function guardErrors(file: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result.messages.filter(m => m.ruleId === 'local/db-access' || m.ruleId === 'no-restricted-syntax').length;
}

describe('database lint guard', () => {
  it.each([
    ["import { getDb } from '@/db/client';"],
    ["import { getDb } from '@/db/./client';"],
    ["import { getDb } from '@/db//client';"],
    ["import { getDb } from '@/sessions/../db/client';"],
    ["import { getDb } from '../../../db/client';"],
    ["import { getDb } from '@/db/client.ts';"],
    ["export { getDb } from '@/db/./client';"],
    ["export * from '@/db/client';"],
    ["export async function f() { return import('@/db//client'); }"],
    ['export async function f() { return import(`@/db/./client`); }'],
    ['export async function f(n: string) { return import(`@/db/${n}`); }'],
    ["export const m = require('@/db/client');"],
    ["import { neon } from '@neondatabase/serverless';"],
    ["import { drizzle } from 'drizzle-orm/./neon-http';"],
    ["export async function f() { return import('drizzle-orm/pglite'); }"],
  ])('refuses in a page: %s', async code => {
    expect(await guardErrors('src/app/(app)/somewhere/helper.ts', code)).toBeGreaterThan(0);
  });

  it('refuses the client in a dal.ts or a test under src/app', async () => {
    expect(await guardErrors('src/app/(app)/x/dal.ts', "import { getDb } from '@/db/client';")).toBe(1);
    expect(await guardErrors('src/app/(app)/x/thing-dal.ts', "import { getDb } from '../../../db/client';")).toBe(1);
    expect(await guardErrors('src/app/(app)/x/page.test.ts', "import { getDb } from '@/db/client';")).toBe(1);
  });

  it('allows the client, however spelt, in a data-access file outside src/app, but never a driver', async () => {
    expect(await guardErrors('src/sessions/some-dal.ts', "import { getDb } from '@/db/./client';\nimport { queryRows } from '../db/client';")).toBe(0);
    expect(await guardErrors('src/sessions/some-dal.ts', "import { drizzle } from 'drizzle-orm/pglite';")).toBe(1);
    expect(await guardErrors('src/db/client.ts', "import { neon } from '@neondatabase/serverless';")).toBe(0);
  });
});
