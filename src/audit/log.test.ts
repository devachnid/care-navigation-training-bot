import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { makePractice, seedLibrary } from '@/test/fixtures';
import { audit } from './log';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

describe('audit', () => {
  it("records the actor and, by default, the actor's practice", async () => {
    const { practiceId, manager } = await makePractice();
    await audit(manager.actor, 'test.thing', { type: 'user', id: 'abc' }, { a: 1 });
    const [row] = await getDb().select().from(auditLog).where(eq(auditLog.action, 'test.thing'));
    expect(row).toMatchObject({ actorUserId: manager.user.id, practiceId, targetType: 'user', targetId: 'abc', detail: { a: 1 } });
  });

  it('can name another practice (platform actions) or none, and allows no actor (command line)', async () => {
    const { practiceId } = await makePractice();
    await audit(null, 'test.cli', { type: 'user', id: 'x', practiceId });
    await audit(null, 'test.none');
    const [cli] = await getDb().select().from(auditLog).where(eq(auditLog.action, 'test.cli'));
    const [none] = await getDb().select().from(auditLog).where(eq(auditLog.action, 'test.none'));
    expect(cli).toMatchObject({ actorUserId: null, practiceId });
    expect(none).toMatchObject({ actorUserId: null, practiceId: null, targetType: null, targetId: null, detail: null });
  });
});
