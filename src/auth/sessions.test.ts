import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { authSessions, users } from '@/db/schema';
import { addMember, deactivate, makePractice, makeUser, seedLibrary, suspend } from '@/test/fixtures';
import { createTestDb } from '@/test/db';
import { hashToken } from './tokens';
import { SESSION_HOURS, createSession, defaultPracticeFor, deleteSession, deleteUserSessions, loadActor, setActivePractice } from './sessions';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

describe('sign-in sessions', () => {
  it('stores only the hash of the token and lasts 12 hours', async () => {
    const u = await makeUser();
    const now = new Date('2026-11-15T09:00:00Z');
    const { token, expiresAt } = await createSession(u.id, null, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_HOURS * 3600_000);
    const rows = await getDb().select().from(authSessions).where(eq(authSessions.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('loads the actor with their active membership', async () => {
    const { practiceId, manager } = await makePractice('Actor Practice');
    expect(manager.actor).toEqual({
      userId: manager.user.id,
      name: manager.user.name,
      email: manager.user.email,
      isPlatformAdmin: false,
      membership: { practiceId, practiceName: 'Actor Practice', role: 'manager', canApproveScenarios: false },
    });
  });

  it('expires after 12 hours and is not extended', async () => {
    const u = await makeUser();
    const start = new Date();
    const { token } = await createSession(u.id, null, start);
    expect(await loadActor(token, new Date(start.getTime() + SESSION_HOURS * 3600_000 - 1000))).not.toBeNull();
    expect(await loadActor(token, new Date(start.getTime() + SESSION_HOURS * 3600_000))).toBeNull();
  });

  it('rejects unknown, malformed and missing tokens', async () => {
    expect(await loadActor(undefined)).toBeNull();
    expect(await loadActor('nope')).toBeNull();
    expect(await loadActor('A'.repeat(43))).toBeNull();
  });

  it('treats a disabled user as not signed in', async () => {
    const { practiceId } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, t.user.id));
    expect(await loadActor(t.token)).toBeNull();
  });

  it('a deactivated membership leaves the user signed in but not in the practice', async () => {
    const { practiceId } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    await deactivate(practiceId, t.user.id);
    const actor = await loadActor(t.token);
    expect(actor?.userId).toBe(t.user.id);
    expect(actor?.membership).toBeNull();
  });

  it('a suspended practice leaves its members signed in but not in the practice', async () => {
    const { practiceId, manager } = await makePractice();
    await suspend(practiceId);
    expect((await loadActor(manager.token))?.membership).toBeNull();
  });

  it('sign-out deletes only that session; deleteUserSessions can keep the current one', async () => {
    const u = await makeUser();
    const a = await createSession(u.id, null);
    const b = await createSession(u.id, null);
    const c = await createSession(u.id, null);
    await deleteSession(a.token);
    expect(await loadActor(a.token)).toBeNull();
    expect(await loadActor(b.token)).not.toBeNull();
    await deleteUserSessions(u.id, c.token);
    expect(await loadActor(b.token)).toBeNull();
    expect(await loadActor(c.token)).not.toBeNull();
  });

  it('default practice is the oldest active membership of an unsuspended practice', async () => {
    const p1 = await makePractice('First');
    const p2 = await makePractice('Second');
    const u = await makeUser();
    const { memberships } = await import('@/db/schema');
    await getDb().insert(memberships).values({ practiceId: p1.practiceId, userId: u.id, role: 'trainee', createdAt: new Date('2026-01-01') });
    await getDb().insert(memberships).values({ practiceId: p2.practiceId, userId: u.id, role: 'trainee', createdAt: new Date('2026-02-01') });
    expect(await defaultPracticeFor(u.id)).toBe(p1.practiceId);
    await suspend(p1.practiceId);
    expect(await defaultPracticeFor(u.id)).toBe(p2.practiceId);
    await deactivate(p2.practiceId, u.id);
    expect(await defaultPracticeFor(u.id)).toBeNull();
  });

  it('switching practice only reaches practices the user is an active member of', async () => {
    const mine = await makePractice('Mine');
    const other = await makePractice('Other');
    const u = await addMember(mine.practiceId, 'trainee');
    expect(await setActivePractice(u.token, u.user.id, other.practiceId)).toBe(false);
    // Someone else's token cannot be switched either.
    expect(await setActivePractice(other.manager.token, u.user.id, mine.practiceId)).toBe(false);
    expect((await loadActor(u.token))?.membership?.practiceId).toBe(mine.practiceId);
  });
});
