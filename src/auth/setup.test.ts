import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { practiceScenarios, users } from '@/db/schema';
import { createTestDb, truncateAll } from '@/test/db';
import { SETUP_LIMIT } from './throttle';
import { seedLibrary } from '@/test/fixtures';
import { loadActor } from './sessions';
import { isSetupOpen, runSetup, type SetupInput } from './setup';

beforeAll(async () => {
  await createTestDb();
});
beforeEach(async () => {
  await truncateAll(getDb());
  await seedLibrary();
  process.env.SETUP_CODE = CODE;
});
afterEach(() => {
  delete process.env.SETUP_CODE;
});

const CODE = 'first-run-code-that-is-long-enough';

const input: SetupInput = {
  setupCode: CODE,
  name: 'Rhian Morgan',
  email: 'Rhian@Example.com',
  password: 'llanelli harbour wall',
  practiceName: 'Ty Gwyn Surgery',
  privacyAccepted: true,
};

describe('first-run setup', () => {
  it('creates the platform admin, the first practice with the library as drafts, and a manager membership', async () => {
    expect(await isSetupOpen()).toBe(true);
    const r = await runSetup(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const actor = await loadActor(r.token);
    expect(actor).toMatchObject({ email: 'rhian@example.com', isPlatformAdmin: true, membership: { role: 'manager', practiceName: 'Ty Gwyn Surgery' } });
    const copied = await getDb().select().from(practiceScenarios).where(eq(practiceScenarios.practiceId, actor!.membership!.practiceId));
    expect(copied).toHaveLength(4);
    expect(copied.every(s => s.revision === 1 && s.approvedRevision === null)).toBe(true);
    expect(await isSetupOpen()).toBe(false);
  });

  it('works only once', async () => {
    expect((await runSetup(input)).ok).toBe(true);
    expect(await runSetup({ ...input, email: 'second@example.com' })).toMatchObject({ ok: false, code: 'conflict' });
    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  it('needs SETUP_CODE set and matched', async () => {
    delete process.env.SETUP_CODE;
    expect(await runSetup(input)).toMatchObject({ ok: false, code: 'conflict' });
    process.env.SETUP_CODE = CODE;
    expect(await runSetup({ ...input, setupCode: 'guess' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await isSetupOpen()).toBe(true);
  });

  it('stays closed while SETUP_CODE is shorter than 20 characters', async () => {
    process.env.SETUP_CODE = 'short-code-19-chars';
    expect(process.env.SETUP_CODE.length).toBe(19);
    expect(await isSetupOpen()).toBe(false);
    expect(await runSetup({ ...input, setupCode: 'short-code-19-chars' })).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('throttles setup attempts: after 5 in 15 minutes even the right code is refused', async () => {
    for (let i = 0; i < SETUP_LIMIT; i++) {
      expect(await runSetup({ ...input, setupCode: `wrong guess number ${i} padded out` })).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(await runSetup(input)).toMatchObject({ ok: false, code: 'limit' });
    expect(await isSetupOpen()).toBe(true);
  });

  it('checks the password policy, practice name and privacy notice before creating anything', async () => {
    expect(await runSetup({ ...input, password: 'short' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await runSetup({ ...input, practiceName: ' ' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await runSetup({ ...input, privacyAccepted: false })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await isSetupOpen()).toBe(true);
  });
});
