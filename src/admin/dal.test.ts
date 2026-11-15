import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { invitations, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createManagerInvitation } from '@/auth/invitations';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { addMember, deactivate, makePractice, platformAdmin, seedLibrary, suspend } from '@/test/fixtures';
import {
  getPracticeDetail,
  getPracticeUsageByMonth,
  getServiceSummary,
  listPendingManagerInvitations,
  listPracticePeople,
  listPractices,
  revokeManagerInvitation,
} from './dal';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

const NOW = new Date('2026-11-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function addCall(practiceId: string, userId: string, startedAt: Date, seconds: number | null, status: 'complete' | 'created' | 'too_short' = 'complete') {
  await getDb().insert(sessions).values({ practiceId, userId, startedAt, durationSeconds: seconds, status });
}

describe('every function needs platform.admin', () => {
  it('refuses a manager and a trainee', async () => {
    const p = await makePractice();
    const trainee = await addMember(p.practiceId, 'trainee');
    for (const actor of [p.manager.actor, trainee.actor]) {
      await expect(getServiceSummary(actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPractices(actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getPracticeDetail(actor, p.practiceId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPracticePeople(actor, p.practiceId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPendingManagerInvitations(actor, p.practiceId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(revokeManagerInvitation(actor, p.practiceId, p.practiceId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getPracticeUsageByMonth(actor, p.practiceId)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe('usage numbers', () => {
  it('counts started calls and rounds the minutes, per practice and for the whole service', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Usage Surgery');
    const other = await makePractice('Other Usage Surgery');
    const t = await addMember(p.practiceId, 'trainee');
    const o = await addMember(other.practiceId, 'trainee');
    await addCall(p.practiceId, t.user.id, daysAgo(2), 90); // this month, 1.5 min
    await addCall(p.practiceId, t.user.id, daysAgo(10), 100); // this month, 1.67 min
    await addCall(p.practiceId, t.user.id, daysAgo(20), 600); // last 30 days, October
    await addCall(p.practiceId, t.user.id, daysAgo(40), 300); // outside 30 days
    await addCall(p.practiceId, t.user.id, daysAgo(1), null, 'created'); // never started: not counted
    await addCall(other.practiceId, o.user.id, daysAgo(1), 60);

    const rows = await listPractices(admin, NOW);
    const mine = rows.find(r => r.id === p.practiceId)!;
    expect(mine).toMatchObject({ name: 'Usage Surgery', suspended: false, activeStaff: 2, calls30: 3, voiceMinutes30: 13 });
    expect(mine.lastCallAt?.toISOString()).toBe(daysAgo(2).toISOString());
    expect(rows.find(r => r.id === other.practiceId)).toMatchObject({ calls30: 1, voiceMinutes30: 1 });

    const usage = await getPracticeUsageByMonth(admin, p.practiceId, NOW);
    expect(usage.map(u => u.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(usage.at(-1)).toMatchObject({ label: 'November 2026', calls: 2, voiceMinutes: 3 });
    expect(usage.at(-2)).toMatchObject({ month: '2026-10', calls: 2, voiceMinutes: 15 });
    expect(usage[0]).toMatchObject({ calls: 0, voiceMinutes: 0 });
  });

  it('uses London months: a call just after midnight on 1 November (UTC+0) and in summer time', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Month Edge Surgery');
    const t = await addMember(p.practiceId, 'trainee');
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    await addCall(p.practiceId, t.user.id, new Date('2026-06-30T23:30:00Z'), 60);
    const usage = await getPracticeUsageByMonth(admin, p.practiceId, new Date('2026-07-15T12:00:00Z'));
    expect(usage.find(u => u.month === '2026-07')?.calls).toBe(1);
    expect(usage.find(u => u.month === '2026-06')?.calls).toBe(0);
  });

  it('the service summary covers this calendar month only and counts staff and practices', async () => {
    const admin = await platformAdmin();
    const before = await getServiceSummary(admin, NOW);
    const p = await makePractice('Summary Surgery');
    const t = await addMember(p.practiceId, 'trainee');
    const gone = await addMember(p.practiceId, 'trainee');
    await deactivate(p.practiceId, gone.user.id);
    await addCall(p.practiceId, t.user.id, daysAgo(1), 120);
    await addCall(p.practiceId, t.user.id, daysAgo(30), 600); // October
    await suspend(p.practiceId);
    const after = await getServiceSummary(admin, NOW);
    expect(after.practices - before.practices).toBe(1);
    expect(after.suspendedPractices - before.suspendedPractices).toBe(1);
    expect(after.activeStaff - before.activeStaff).toBe(2); // manager + t, not the deactivated one
    expect(after.calls - before.calls).toBe(1);
    expect(after.voiceMinutes - before.voiceMinutes).toBe(2);
  });

  it('returns no call content', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Privacy Surgery');
    const t = await addMember(p.practiceId, 'trainee');
    await addCall(p.practiceId, t.user.id, daysAgo(1), 120);
    const everything = JSON.stringify([
      await listPractices(admin, NOW),
      await getPracticeUsageByMonth(admin, p.practiceId, NOW),
      await listPracticePeople(admin, p.practiceId),
    ]);
    expect(everything).not.toMatch(/transcript|debrief|score|snapshot/i);
  });
});

describe('practice details', () => {
  it('treats a malformed or unknown id as not found', async () => {
    const admin = await platformAdmin();
    expect(await getPracticeDetail(admin, 'nope')).toBeNull();
    expect(await getPracticeDetail(admin, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await listPracticePeople(admin, 'nope')).toEqual([]);
    expect(await getPracticeUsageByMonth(admin, 'nope')).toEqual([]);
  });

  it('lists the people of that practice only, active first', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('People Surgery');
    const q = await makePractice('Elsewhere Surgery');
    const a = await addMember(p.practiceId, 'trainee', true, 'Zed Approver');
    const b = await addMember(p.practiceId, 'trainee', false, 'Ann Left');
    await deactivate(p.practiceId, b.user.id);
    await addMember(q.practiceId, 'trainee', false, 'Not Here');
    const people = await listPracticePeople(admin, p.practiceId);
    expect(people.map(x => x.name)).toEqual(['manager person', 'Zed Approver', 'Ann Left']);
    expect(people.find(x => x.userId === a.user.id)).toMatchObject({ canApproveScenarios: true, active: true });
    expect(people.find(x => x.userId === b.user.id)).toMatchObject({ active: false, disabled: false });
    expect(people.some(x => x.name === 'Not Here')).toBe(false);
  });
});

describe('manager invitations', () => {
  async function invite(practiceId: string, email: string) {
    const r = await createManagerInvitation(await platformAdmin(), practiceId, { email, name: 'New Manager' });
    if (!r.ok) throw new Error(r.error);
    if (!('invitationId' in r)) throw new Error('expected a link');
    return r;
  }

  it('lists pending manager invitations for the practice and not others', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Invite Surgery');
    const q = await makePractice('Invite Elsewhere');
    await invite(p.practiceId, 'one@example.com');
    await invite(q.practiceId, 'two@example.com');
    const mine = await listPendingManagerInvitations(admin, p.practiceId);
    expect(mine.map(i => i.email)).toEqual(['one@example.com']);
    expect(await listPendingManagerInvitations(admin, p.practiceId, new Date(Date.now() + 8 * 86_400_000))).toEqual([]);
  });

  it('revokes an unused invitation, only through its own practice', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Revoke Surgery');
    const q = await makePractice('Revoke Elsewhere');
    await invite(p.practiceId, 'revoke@example.com');
    const [pending] = await listPendingManagerInvitations(admin, p.practiceId);
    expect((await revokeManagerInvitation(admin, q.practiceId, pending.id)).ok).toBe(false);
    expect(await listPendingManagerInvitations(admin, p.practiceId)).toHaveLength(1);
    expect((await revokeManagerInvitation(admin, p.practiceId, pending.id)).ok).toBe(true);
    expect(await listPendingManagerInvitations(admin, p.practiceId)).toEqual([]);
    expect((await revokeManagerInvitation(admin, p.practiceId, pending.id)).ok).toBe(false);
  });

  it('does not revoke an invitation that was already used', async () => {
    const admin = await platformAdmin();
    const p = await makePractice('Used Surgery');
    const r = await invite(p.practiceId, 'used@example.com');
    await getDb().update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, r.invitationId));
    expect((await revokeManagerInvitation(admin, p.practiceId, r.invitationId)).ok).toBe(false);
  });
});
