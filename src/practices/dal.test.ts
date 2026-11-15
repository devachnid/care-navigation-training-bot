import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, memberships, practiceScenarios, practices, scenarios, users } from '@/db/schema';
import { createInvitation, createResetLink, lookupInvitation } from '@/auth/invitations';
import { loadActor } from '@/auth/sessions';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, makeUser, platformAdmin, seedLibrary, signedIn } from '@/test/fixtures';
import {
  changeMemberRole,
  createPractice,
  deactivateMember,
  getMember,
  getPracticeSettings,
  listMembers,
  listMyPractices,
  reactivateMember,
  setMemberApprover,
  setPracticeSuspended,
  switchPractice,
  updatePracticeSettings,
} from './dal';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

describe('createPractice', () => {
  it('copies only active library scenarios in, as drafts', async () => {
    await getDb().update(scenarios).set({ active: false }).where(eq(scenarios.id, 'low-mood'));
    try {
      const r = await createPractice(await platformAdmin(), { name: '  Bryn  Surgery ' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [p] = await getDb().select().from(practices).where(eq(practices.id, r.practiceId));
      expect(p.name).toBe('Bryn Surgery');
      const rows = await getDb().select().from(practiceScenarios).where(eq(practiceScenarios.practiceId, r.practiceId));
      expect(rows.map(s => s.libraryScenarioId).sort()).toEqual(['angina-repeat', 'flashes-floaters', 'sore-throat']);
      expect(rows.every(s => s.revision === 1 && s.approvedRevision === null && s.active)).toBe(true);
      const sore = rows.find(s => s.libraryScenarioId === 'sore-throat')!;
      const [lib] = await getDb().select().from(scenarios).where(eq(scenarios.id, 'sore-throat'));
      expect(sore.correctOutcome).toBe(lib.correctOutcome);
      expect(sore.hiddenFacts).toEqual(lib.hiddenFacts);
      const [logged] = await getDb().select().from(auditLog).where(and(eq(auditLog.action, 'practice.created'), eq(auditLog.practiceId, r.practiceId)));
      expect(logged).toBeDefined();
    } finally {
      await getDb().update(scenarios).set({ active: true }).where(eq(scenarios.id, 'low-mood'));
    }
  });

  it('is for platform admins only; a manager cannot', async () => {
    const { manager } = await makePractice();
    await expect(createPractice(manager.actor, { name: 'Mine' })).rejects.toThrow(ForbiddenError);
    expect(await createPractice(await platformAdmin(), { name: 'x' })).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('suspending a practice takes its members out of it until restored', async () => {
    const { practiceId, manager } = await makePractice();
    const admin = await platformAdmin();
    await expect(setPracticeSuspended(manager.actor, practiceId, true)).rejects.toThrow(ForbiddenError);
    expect(await setPracticeSuspended(admin, practiceId, true)).toEqual({ ok: true });
    expect((await loadActor(manager.token))?.membership).toBeNull();
    expect(await setPracticeSuspended(admin, practiceId, false)).toEqual({ ok: true });
    expect((await loadActor(manager.token))?.membership?.practiceId).toBe(practiceId);
  });
});

describe('practice settings', () => {
  it('a manager reads and changes their own practice only', async () => {
    const mine = await makePractice('Settings Mine');
    const theirs = await makePractice('Settings Theirs');
    expect(await getPracticeSettings(mine.manager.actor)).toEqual({ name: 'Settings Mine', allowDraftScenarios: false, transcriptRetentionDays: null });
    expect(await updatePracticeSettings(mine.manager.actor, { name: 'Renamed', allowDraftScenarios: true, transcriptRetentionDays: 90 })).toEqual({ ok: true });
    expect(await getPracticeSettings(mine.manager.actor)).toEqual({ name: 'Renamed', allowDraftScenarios: true, transcriptRetentionDays: 90 });
    // The other practice is untouched.
    expect(await getPracticeSettings(theirs.manager.actor)).toMatchObject({ name: 'Settings Theirs', allowDraftScenarios: false });
  });

  it('validates and refuses non-managers', async () => {
    const { practiceId, manager } = await makePractice();
    expect(await updatePracticeSettings(manager.actor, { transcriptRetentionDays: 1 })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await updatePracticeSettings(manager.actor, { name: '' })).toMatchObject({ ok: false, code: 'invalid' });
    const approver = await addMember(practiceId, 'trainee', true);
    await expect(getPracticeSettings(approver.actor)).rejects.toThrow(ForbiddenError);
    await expect(updatePracticeSettings(approver.actor, { allowDraftScenarios: true })).rejects.toThrow(ForbiddenError);
    await expect(getPracticeSettings(await platformAdmin())).rejects.toThrow(ForbiddenError);
  });
});

describe('team', () => {
  it('lists only members of the actor practice', async () => {
    const mine = await makePractice();
    const theirs = await makePractice();
    const t = await addMember(mine.practiceId, 'trainee', false, 'Aled');
    const stranger = await addMember(theirs.practiceId, 'trainee', false, 'Stranger');
    const list = await listMembers(mine.manager.actor);
    expect(list.map(m => m.userId).sort()).toEqual([mine.manager.user.id, t.user.id].sort());
    expect(await getMember(mine.manager.actor, stranger.user.id)).toBeNull();
    expect(await getMember(mine.manager.actor, t.user.id)).toMatchObject({ name: 'Aled', role: 'trainee', accountDisabled: false });
    await expect(listMembers(t.actor)).rejects.toThrow(ForbiddenError);
  });

  it("cannot change, deactivate or reactivate another practice's member", async () => {
    const mine = await makePractice();
    const theirs = await makePractice();
    const stranger = await addMember(theirs.practiceId, 'trainee');
    expect(await changeMemberRole(mine.manager.actor, stranger.user.id, 'manager')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await setMemberApprover(mine.manager.actor, stranger.user.id, true)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await deactivateMember(mine.manager.actor, stranger.user.id)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await reactivateMember(mine.manager.actor, stranger.user.id)).toMatchObject({ ok: false, code: 'not_found' });
    const [m] = await getDb().select().from(memberships).where(eq(memberships.userId, stranger.user.id));
    expect(m).toMatchObject({ role: 'trainee', canApproveScenarios: false, deactivatedAt: null });
  });

  it('changes role and approver flag, and logs it', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    expect(await changeMemberRole(manager.actor, t.user.id, 'manager')).toEqual({ ok: true });
    expect(await setMemberApprover(manager.actor, t.user.id, true)).toEqual({ ok: true });
    expect((await loadActor(t.token))?.membership).toMatchObject({ role: 'manager', canApproveScenarios: true });
    const actions = (await getDb().select().from(auditLog).where(eq(auditLog.targetId, t.user.id))).map(a => a.action);
    expect(actions).toEqual(expect.arrayContaining(['member.role_changed', 'member.approver_changed']));
  });

  it('never changes yourself', async () => {
    const { practiceId, manager } = await makePractice();
    await addMember(practiceId, 'manager');
    expect(await changeMemberRole(manager.actor, manager.user.id, 'trainee')).toMatchObject({ ok: false, code: 'conflict' });
    expect(await setMemberApprover(manager.actor, manager.user.id, true)).toMatchObject({ ok: false, code: 'conflict' });
    expect(await deactivateMember(manager.actor, manager.user.id)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('never demotes or deactivates the last active manager', async () => {
    const { practiceId, manager: m1 } = await makePractice();
    const m2 = await addMember(practiceId, 'manager');
    // With two managers, one may demote the other.
    expect(await changeMemberRole(m1.actor, m2.user.id, 'trainee')).toEqual({ ok: true });
    // m1 is now the last active manager. m2's actor was loaded while m2 was a manager, so only the
    // SQL guard stands between it and an unmanaged practice.
    expect(await changeMemberRole(m2.actor, m1.user.id, 'trainee')).toMatchObject({ ok: false, code: 'conflict' });
    expect(await deactivateMember(m2.actor, m1.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    // A manager whose account is disabled does not count as another manager.
    const m3 = await addMember(practiceId, 'manager');
    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, m3.user.id));
    expect(await changeMemberRole(m2.actor, m1.user.id, 'trainee')).toMatchObject({ ok: false, code: 'conflict' });
    const [row] = await getDb().select().from(memberships).where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, m1.user.id)));
    expect(row).toMatchObject({ role: 'manager', deactivatedAt: null });
    // Demoting or deactivating a trainee needs no other manager.
    const t = await addMember(practiceId, 'trainee');
    expect(await deactivateMember(m1.actor, t.user.id)).toEqual({ ok: true });
  });

  it('refuses to remove the only other active manager', async () => {
    const { practiceId, manager } = await makePractice();
    const other = await addMember(practiceId, 'manager');
    // Simulate "other" being the last manager: deactivate the first manager behind the DAL's back.
    await getDb()
      .update(memberships)
      .set({ deactivatedAt: new Date() })
      .where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, manager.user.id)));
    // A stale actor for the deactivated manager still cannot remove the last active one.
    expect(await changeMemberRole(manager.actor, other.user.id, 'trainee')).toMatchObject({ ok: false, code: 'conflict' });
    expect(await deactivateMember(manager.actor, other.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    const [m] = await getDb().select().from(memberships).where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, other.user.id)));
    expect(m).toMatchObject({ role: 'manager', deactivatedAt: null });
  });

  it("deactivating or demoting a manager cancels the unused links they made in this practice, and records it", async () => {
    const { practiceId, manager } = await makePractice();
    const m2 = await addMember(practiceId, 'manager');
    const t = await addMember(practiceId, 'trainee');
    const inv = await createInvitation(m2.actor, { email: 'pending-one@example.com', name: 'Pending', role: 'trainee', canApproveScenarios: false });
    const reset = await createResetLink(m2.actor, t.user.id);
    const mine = await createInvitation(manager.actor, { email: 'pending-two@example.com', name: 'Mine', role: 'trainee', canApproveScenarios: false });
    if (!inv.ok || !reset.ok || !mine.ok) throw new Error('links');
    expect(await changeMemberRole(manager.actor, m2.user.id, 'trainee')).toEqual({ ok: true });
    expect(await lookupInvitation(inv.token)).toBeNull();
    expect(await lookupInvitation(reset.token)).toBeNull();
    expect(await lookupInvitation(mine.token)).not.toBeNull();
    const [roleEntry] = await getDb().select().from(auditLog).where(and(eq(auditLog.action, 'member.role_changed'), eq(auditLog.targetId, m2.user.id)));
    expect(roleEntry.detail).toEqual({ role: 'trainee', revokedLinks: 2 });

    const m3 = await addMember(practiceId, 'manager');
    const inv3 = await createInvitation(m3.actor, { email: 'pending-three@example.com', name: 'P3', role: 'trainee', canApproveScenarios: false });
    if (!inv3.ok) throw new Error('link');
    expect(await deactivateMember(manager.actor, m3.user.id)).toEqual({ ok: true });
    expect(await lookupInvitation(inv3.token)).toBeNull();
    const [deEntry] = await getDb().select().from(auditLog).where(and(eq(auditLog.action, 'member.deactivated'), eq(auditLog.targetId, m3.user.id)));
    expect(deEntry.detail).toEqual({ revokedLinks: 1 });
  });

  it('deactivation takes effect on the next request and reactivation restores it', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    expect(await deactivateMember(manager.actor, t.user.id)).toEqual({ ok: true });
    expect(await deactivateMember(manager.actor, t.user.id)).toEqual({ ok: true });
    expect((await loadActor(t.token))?.membership).toBeNull();
    expect(await reactivateMember(manager.actor, t.user.id)).toEqual({ ok: true });
    expect((await loadActor(t.token))?.membership?.practiceId).toBe(practiceId);
  });
});

describe('my practices', () => {
  it('lists and switches only between the actor’s own active practices', async () => {
    const a = await makePractice('Alpha');
    const b = await makePractice('Beta');
    const c = await makePractice('Gamma');
    const u = await makeUser();
    await getDb().insert(memberships).values([
      { practiceId: a.practiceId, userId: u.id, role: 'trainee' },
      { practiceId: b.practiceId, userId: u.id, role: 'manager' },
    ]);
    const { actor, token } = await signedIn(u.id, a.practiceId);
    expect((await listMyPractices(actor)).map(p => [p.practiceName, p.current])).toEqual([
      ['Alpha', true],
      ['Beta', false],
    ]);
    expect(await switchPractice(actor, token, c.practiceId)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await switchPractice(actor, token, b.practiceId)).toEqual({ ok: true });
    expect((await loadActor(token))?.membership).toMatchObject({ practiceId: b.practiceId, role: 'manager' });
    await getDb().update(practices).set({ suspendedAt: new Date() }).where(eq(practices.id, a.practiceId));
    expect((await listMyPractices(actor)).map(p => p.practiceName)).toEqual(['Beta']);
    expect(await switchPractice(actor, token, a.practiceId)).toMatchObject({ ok: false, code: 'not_found' });
  });
});
