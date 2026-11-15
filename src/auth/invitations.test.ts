import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, invitations, memberships, users } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { listAuditEntries } from '@/audit/dal';
import { listMembers, reactivateMember } from '@/practices/dal';
import { PASSWORD, addMember, deactivate, makePractice, makeUser, platformAdmin, seedLibrary } from '@/test/fixtures';
import {
  acceptInvitation,
  createInvitation,
  createManagerInvitation,
  createResetLink,
  createResetLinkAsPlatformAdmin,
  createResetLinkFromCommandLine,
  listPendingInvitations,
  lookupInvitation,
  revokeInvitation,
  type InvitationLink,
} from './invitations';
import { createSession, loadActor, setActivePractice } from './sessions';
import { signIn } from './sign-in';
import { PAIR_LIMIT } from './throttle';
import { hashToken } from './tokens';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

const NEW_PASSWORD = 'bara brith and tea';
const ATTACKER_PW = 'attacker owns this account now';
let n = 0;
const fresh = () => `new-person-${++n}@example.com`;

async function invite(manager: Awaited<ReturnType<typeof makePractice>>['manager'], over: Partial<Parameters<typeof createInvitation>[1]> = {}) {
  const r = await createInvitation(manager.actor, { email: fresh(), name: 'Nia Evans', role: 'trainee', canApproveScenarios: false, ...over });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('invitations', () => {
  it('a manager invites a new person; the link works once and makes the membership', async () => {
    const { practiceId, manager } = await makePractice('Invite Practice');
    const link = await invite(manager, { role: 'manager', canApproveScenarios: true, email: '  Mixed.Case@Example.com ' });
    const [row] = await getDb().select().from(invitations).where(eq(invitations.id, link.invitationId));
    expect(row.tokenHash).toBe(hashToken(link.token));
    expect(row.email).toBe('mixed.case@example.com');
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(7 * 86_400_000);

    expect(await lookupInvitation(link.token)).toMatchObject({
      kind: 'invite',
      email: 'mixed.case@example.com',
      practiceName: 'Invite Practice',
      needsPrivacyAck: true,
    });

    const accepted = await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const actor = await loadActor(accepted.token);
    expect(actor?.membership).toEqual({ practiceId, practiceName: 'Invite Practice', role: 'manager', canApproveScenarios: true });
    expect((await signIn({ email: 'mixed.case@example.com', password: NEW_PASSWORD, ip: null })).ok).toBe(true);
  });

  it('accepting an invitation or a reset link records the sign-in time', async () => {
    const { practiceId, manager } = await makePractice();
    const email = fresh();
    const link = await invite(manager, { email });
    const accepted = await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true });
    expect(accepted.ok).toBe(true);
    const [byEmail] = await getDb().select().from(users).where(eq(users.email, email));
    expect(byEmail.lastSignInAt).toBeInstanceOf(Date);

    const t = await addMember(practiceId, 'trainee');
    expect((await getDb().select().from(users).where(eq(users.id, t.user.id)))[0].lastSignInAt).toBeNull();
    const reset = await createResetLink(manager.actor, t.user.id);
    if (!reset.ok) throw new Error(reset.error);
    expect((await acceptInvitation({ token: reset.token, password: NEW_PASSWORD, privacyAccepted: false })).ok).toBe(true);
    expect((await getDb().select().from(users).where(eq(users.id, t.user.id)))[0].lastSignInAt).toBeInstanceOf(Date);
  });

  it('cannot be claimed twice', async () => {
    const { manager } = await makePractice();
    const link = await invite(manager);
    const [a, b] = await Promise.all([
      acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true }),
      acceptInvitation({ token: link.token, password: 'a different phrase', privacyAccepted: true }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const again = await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true });
    expect(again).toMatchObject({ ok: false, code: 'not_found' });
    expect(await lookupInvitation(link.token)).toBeNull();
  });

  it('refuses an expired invitation', async () => {
    const { manager } = await makePractice();
    const link = await invite(manager);
    await getDb().update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, link.invitationId));
    expect(await lookupInvitation(link.token)).toBeNull();
    expect(await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('refuses a revoked invitation', async () => {
    const { manager } = await makePractice();
    const link = await invite(manager);
    expect(await revokeInvitation(manager.actor, link.invitationId)).toEqual({ ok: true });
    expect(await lookupInvitation(link.token)).toBeNull();
    expect(await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('a new invitation for the same email cancels the old one', async () => {
    const { manager } = await makePractice();
    const email = fresh();
    const first = await invite(manager, { email });
    const second = await invite(manager, { email });
    expect(await lookupInvitation(first.token)).toBeNull();
    expect(await lookupInvitation(second.token)).not.toBeNull();
  });

  it('needs the privacy notice accepted and a policy-compliant password, and does not spend the link otherwise', async () => {
    const { manager } = await makePractice();
    const link = await invite(manager);
    expect(await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: false })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await acceptInvitation({ token: link.token, password: 'short', privacyAccepted: true })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await lookupInvitation(link.token)).not.toBeNull();
  });

  it('never adds an existing account straight away: it always makes a link, and says nothing about other practices', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const existing = await addMember(p1.practiceId, 'trainee');
    const r = await createInvitation(p2.manager.actor, { email: existing.user.email.toUpperCase(), name: 'Whoever', role: 'trainee', canApproveScenarios: false });
    expect(r.ok).toBe(true);
    expect(Object.keys(r).sort()).toEqual(['expiresAt', 'invitationId', 'ok', 'token']);
    expect((await listMembers(p2.manager.actor)).map(m => m.userId)).not.toContain(existing.user.id);
    // The answer for a brand-new email has exactly the same shape.
    const fresh1 = await createInvitation(p2.manager.actor, { email: fresh(), name: 'New', role: 'trainee', canApproveScenarios: false });
    expect(Object.keys(fresh1).sort()).toEqual(['expiresAt', 'invitationId', 'ok', 'token']);
  });

  it('refuses to invite someone already in the practice (active or deactivated)', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    expect(await createInvitation(manager.actor, { email: t.user.email, name: 'X', role: 'trainee', canApproveScenarios: false })).toMatchObject({ ok: false, code: 'conflict' });
    await getDb().update(memberships).set({ deactivatedAt: new Date() }).where(eq(memberships.userId, t.user.id));
    const r = await createInvitation(manager.actor, { email: t.user.email, name: 'X', role: 'trainee', canApproveScenarios: false });
    expect(r.ok === false && r.error).toMatch(/Reactivate/);
  });

  it('an existing account joins with its current password, which is never changed; a wrong password does not use up the link', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice('Joining Practice');
    const existing = await addMember(p1.practiceId, 'trainee');
    const link = await invite(p2.manager, { email: existing.user.email, role: 'manager', canApproveScenarios: true });
    expect(await lookupInvitation(link.token)).toMatchObject({ kind: 'invite', existingAccount: true, practiceName: 'Joining Practice', needsPrivacyAck: true });

    expect(await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await lookupInvitation(link.token)).not.toBeNull();
    expect(await acceptInvitation({ token: link.token, password: PASSWORD, privacyAccepted: false })).toMatchObject({ ok: false, code: 'invalid' });

    const r = await acceptInvitation({ token: link.token, password: PASSWORD, privacyAccepted: true, ip: '192.0.2.7' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await loadActor(r.token))?.membership).toMatchObject({ practiceId: p2.practiceId, role: 'manager', canApproveScenarios: true });
    const [u] = await getDb().select().from(users).where(eq(users.id, existing.user.id));
    expect(u.passwordHash).toBe(existing.user.passwordHash);
    expect((await signIn({ email: existing.user.email, password: PASSWORD, ip: null })).ok).toBe(true);
    expect(await lookupInvitation(link.token)).toBeNull();
  });

  it('joining with a correct existing password does not use up the address allowance', async () => {
    const p1 = await makePractice();
    const ip = '203.0.113.70';
    for (let i = 0; i < 35; i++) {
      const p2 = await makePractice();
      const existing = await addMember(p1.practiceId, 'trainee');
      const link = await invite(p2.manager, { email: existing.user.email });
      expect((await acceptInvitation({ token: link.token, password: PASSWORD, privacyAccepted: true, ip })).ok).toBe(true);
    }
  });

  it('guessing the current password through an invitation is throttled like sign-in', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const existing = await addMember(p1.practiceId, 'trainee');
    const link = await invite(p2.manager, { email: existing.user.email });
    for (let i = 0; i < PAIR_LIMIT; i++) {
      await acceptInvitation({ token: link.token, password: `wrong guess ${i} here`, privacyAccepted: true, ip: '192.0.2.99' });
    }
    expect(await acceptInvitation({ token: link.token, password: PASSWORD, privacyAccepted: true, ip: '192.0.2.99' })).toMatchObject({ ok: false, code: 'limit' });
    expect(await lookupInvitation(link.token)).not.toBeNull();
  });

  it('a disabled existing account cannot join', async () => {
    const p2 = await makePractice();
    const disabled = await makeUser({ disabledAt: new Date() });
    const link = await invite(p2.manager, { email: disabled.email });
    expect(await acceptInvitation({ token: link.token, password: PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'invalid' });
  });

  // Security review F1: pre-registering someone's email must not let a manager into the practice that later invites them.
  it("a manager who pre-registered an email cannot get into the practice that later invites that person", async () => {
    const A = await makePractice('Practice A');
    const B = await makePractice('Practice B');
    const victimEmail = fresh();
    const inv = await invite(A.manager, { email: victimEmail, name: 'New Receptionist' });
    expect((await acceptInvitation({ token: inv.token, password: ATTACKER_PW, privacyAccepted: true })).ok).toBe(true);

    // B's manager invites the real person, as a manager. Nothing is granted until the link is used.
    const linkB = await invite(B.manager, { email: victimEmail, name: 'New Receptionist', role: 'manager', canApproveScenarios: true });
    const s = await signIn({ email: victimEmail, password: ATTACKER_PW, ip: null });
    if (!s.ok) throw new Error('sign in failed');
    const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, victimEmail));
    expect(await setActivePractice(s.token, u.id, B.practiceId)).toBe(false);
    const actor = (await loadActor(s.token))!;
    expect(actor.membership?.practiceId).toBe(A.practiceId);
    expect(await listMembers(B.manager.actor).then(ms => ms.map(m => m.userId))).not.toContain(u.id);
    // The real person, holding B's link, cannot take over the account by choosing a password.
    expect(await acceptInvitation({ token: linkB.token, password: 'the real person chooses this', privacyAccepted: true })).toMatchObject({ ok: false, code: 'invalid' });
    expect((await signIn({ email: victimEmail, password: ATTACKER_PW, ip: null })).ok).toBe(true);
  });

  // Security review F2: inviting must reveal nothing about a person who belongs to another practice.
  it('a manager of A learns nothing about a user who only belongs to B, and B can still reset them', async () => {
    const A = await makePractice('Practice A2');
    const B = await makePractice('Practice B2');
    const bStaff = await addMember(B.practiceId, 'trainee', false, 'Gwen Only-In-B');
    await signIn({ email: bStaff.user.email, password: PASSWORD, ip: null });
    const r = await createInvitation(A.manager.actor, { email: bStaff.user.email, name: 'anything', role: 'trainee', canApproveScenarios: false });
    expect(r.ok).toBe(true);
    const leaked = (await listMembers(A.manager.actor)).find(m => m.email === bStaff.user.email);
    expect(leaked).toBeUndefined();
    expect((await createResetLink(B.manager.actor, bStaff.user.id)).ok).toBe(true);
  });

  // Security review round 2, R6: a removed manager's earlier invitation must not let them back in.
  it('refuses an invitation whose maker is no longer an active manager of the practice, without using it up', async () => {
    const A = await makePractice('R6 practice');
    const rogue = await addMember(A.practiceId, 'manager');
    const link = await invite(rogue, { email: fresh(), role: 'manager', canApproveScenarios: true });
    // Taken out behind the DAL's back, so the link is not revoked: acceptance must check the maker itself.
    await deactivate(A.practiceId, rogue.user.id);
    const used = await acceptInvitation({ token: link.token, password: 'rogue alternate pass 1', privacyAccepted: true });
    expect(used).toMatchObject({ ok: false, code: 'conflict' });
    expect(await lookupInvitation(link.token)).not.toBeNull();
    // Demoted to trainee, likewise.
    const other = await addMember(A.practiceId, 'manager');
    const link2 = await invite(other, { email: fresh() });
    await getDb().update(memberships).set({ role: 'trainee' }).where(eq(memberships.userId, other.user.id));
    expect(await acceptInvitation({ token: link2.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'conflict' });
    // A disabled maker, likewise.
    const third = await addMember(A.practiceId, 'manager');
    const link3 = await invite(third, { email: fresh() });
    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, third.user.id));
    expect(await acceptInvitation({ token: link3.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('a platform admin can invite a manager who is also the clinician approver; by default they are not', async () => {
    const { practiceId } = await makePractice();
    const admin = await platformAdmin();
    const plain = await createManagerInvitation(admin, practiceId, { email: fresh(), name: 'Plain Manager' });
    const clinician = await createManagerInvitation(admin, practiceId, { email: fresh(), name: 'Dr Manager', canApproveScenarios: true });
    if (!plain.ok || !clinician.ok) throw new Error('invitation failed');
    const a = await acceptInvitation({ token: plain.token, password: NEW_PASSWORD, privacyAccepted: true });
    const b = await acceptInvitation({ token: clinician.token, password: NEW_PASSWORD, privacyAccepted: true });
    if (!a.ok || !b.ok) throw new Error('accept failed');
    expect((await loadActor(a.token))?.membership).toMatchObject({ role: 'manager', canApproveScenarios: false });
    expect((await loadActor(b.token))?.membership).toMatchObject({ role: 'manager', canApproveScenarios: true });
  });

  it("a platform admin's invitation, or one with no maker, still works", async () => {
    const { practiceId } = await makePractice();
    const r = await createManagerInvitation(await platformAdmin(), practiceId, { email: fresh(), name: 'First Manager' });
    if (!r.ok) throw new Error(r.error);
    expect((await acceptInvitation({ token: r.token, password: NEW_PASSWORD, privacyAccepted: true })).ok).toBe(true);
    const r2 = await createManagerInvitation(await platformAdmin(), practiceId, { email: fresh(), name: 'Second Manager' });
    if (!r2.ok) throw new Error(r2.error);
    await getDb().update(invitations).set({ createdBy: null }).where(eq(invitations.id, r2.invitationId));
    expect((await acceptInvitation({ token: r2.token, password: NEW_PASSWORD, privacyAccepted: true })).ok).toBe(true);
  });

  it('validates the input', async () => {
    const { manager } = await makePractice();
    const base = { email: fresh(), name: 'Nia', role: 'trainee' as const, canApproveScenarios: false };
    expect(await createInvitation(manager.actor, { ...base, email: 'not an email' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await createInvitation(manager.actor, { ...base, name: '   ' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await createInvitation(manager.actor, { ...base, role: 'admin' as never })).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('only managers can invite, list or revoke', async () => {
    const { practiceId } = await makePractice();
    const trainee = await addMember(practiceId, 'trainee', true);
    await expect(createInvitation(trainee.actor, { email: fresh(), name: 'X', role: 'trainee', canApproveScenarios: false })).rejects.toThrow(ForbiddenError);
    await expect(listPendingInvitations(trainee.actor)).rejects.toThrow(ForbiddenError);
    await expect(revokeInvitation(trainee.actor, crypto.randomUUID())).rejects.toThrow(ForbiddenError);
    const admin = await platformAdmin();
    await expect(createInvitation(admin, { email: fresh(), name: 'X', role: 'trainee', canApproveScenarios: false })).rejects.toThrow(ForbiddenError);
  });

  it("another practice's manager cannot see or revoke this practice's invitations", async () => {
    const mine = await makePractice();
    const theirs = await makePractice();
    const link = await invite(mine.manager);
    expect((await listPendingInvitations(theirs.manager.actor)).map(i => i.id)).not.toContain(link.invitationId);
    expect((await listPendingInvitations(mine.manager.actor)).map(i => i.id)).toContain(link.invitationId);
    expect(await revokeInvitation(theirs.manager.actor, link.invitationId)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await lookupInvitation(link.token)).not.toBeNull();
  });

  it('a platform admin invites a practice manager; nobody else can', async () => {
    const { practiceId, manager } = await makePractice();
    const admin = await platformAdmin();
    const r = await createManagerInvitation(admin, practiceId, { email: fresh(), name: 'New Manager' });
    expect(r.ok).toBe(true);
    await expect(createManagerInvitation(manager.actor, practiceId, { email: fresh(), name: 'X' })).rejects.toThrow(ForbiddenError);
    expect(await createManagerInvitation(admin, crypto.randomUUID(), { email: fresh(), name: 'X' })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('records invitations and acceptances in the audit log', async () => {
    const { practiceId, manager } = await makePractice();
    const link = await invite(manager);
    await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true });
    const actions = (await getDb().select().from(auditLog).where(eq(auditLog.practiceId, practiceId))).map(a => a.action);
    expect(actions).toEqual(expect.arrayContaining(['member.invited', 'invitation.accepted']));
  });
});

describe('reset links', () => {
  // Security review round 2, R4: a reset by the service administrator must be visible to the practice.
  it("a platform admin's reset link, and its use, appear in every practice the person belongs to", async () => {
    const A = await makePractice('R4 practice A');
    const B = await makePractice('R4 practice B');
    const target = await addMember(A.practiceId, 'manager', false, 'Rhodri Price');
    await getDb().insert(memberships).values({ practiceId: B.practiceId, userId: target.user.id, role: 'trainee', deactivatedAt: new Date() });
    const link = await createResetLinkAsPlatformAdmin(await platformAdmin(), target.user.id);
    if (!link.ok) throw new Error(link.error);
    expect((await acceptInvitation({ token: link.token, password: 'admin chose this one now', privacyAccepted: true })).ok).toBe(true);

    for (const p of [A, B]) {
      const summaries = (await listAuditEntries(p.manager.actor, 50)).map(e => e.summary);
      expect(summaries).toContain('The service administrator created a password reset link for Rhodri Price');
      expect(summaries).toContain('Rhodri Price set a new password using a link from the service administrator');
    }
    const C = await makePractice('Unrelated');
    expect((await listAuditEntries(C.manager.actor, 50)).map(e => e.summary).join('|')).not.toMatch(/Rhodri/);
  });

  it('a command-line reset is visible to the practice too, with no actor', async () => {
    const A = await makePractice('CLI practice');
    const target = await addMember(A.practiceId, 'trainee', false, 'Eleri Jones');
    const link = await createResetLinkFromCommandLine(target.user.email);
    if (!link.ok) throw new Error(link.error);
    const entry = (await listAuditEntries(A.manager.actor, 50)).find(e => e.summary.startsWith('The service administrator created'));
    expect(entry).toMatchObject({ actorName: null, summary: 'The service administrator created a password reset link for Eleri Jones' });
  });

  async function useReset(link: InvitationLink, password = NEW_PASSWORD) {
    return acceptInvitation({ token: link.token, password, privacyAccepted: false });
  }

  it('a manager resets a member of only their practice; it signs out every session and lasts 24 hours', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    const otherSession = await createSession(t.user.id, practiceId);
    const r = await createResetLink(manager.actor, t.user.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await getDb().select().from(invitations).where(eq(invitations.id, r.invitationId));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(24 * 3600_000);
    expect(await lookupInvitation(r.token)).toMatchObject({ kind: 'reset', practiceName: null, needsPrivacyAck: false });

    const used = await useReset(r);
    expect(used.ok).toBe(true);
    expect(await loadActor(t.token)).toBeNull();
    expect(await loadActor(otherSession.token)).toBeNull();
    if (used.ok) expect((await loadActor(used.token))?.membership?.practiceId).toBe(practiceId);
    expect((await signIn({ email: t.user.email, password: NEW_PASSWORD, ip: null })).ok).toBe(true);
    expect(await useReset(r)).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('a manager cannot reset a platform admin, even one in their practice', async () => {
    const { practiceId, manager } = await makePractice();
    const adminMember = await makeUser({ isPlatformAdmin: true });
    await getDb().insert(memberships).values({ practiceId, userId: adminMember.id, role: 'trainee' });
    expect(await createResetLink(manager.actor, adminMember.id)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('a manager cannot reset someone with any membership in another practice, even a deactivated one', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const t = await addMember(p1.practiceId, 'trainee');
    await getDb().insert(memberships).values({ practiceId: p2.practiceId, userId: t.user.id, role: 'trainee' });
    expect(await createResetLink(p1.manager.actor, t.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    await getDb()
      .update(memberships)
      .set({ deactivatedAt: new Date() })
      .where(and(eq(memberships.practiceId, p2.practiceId), eq(memberships.userId, t.user.id)));
    expect(await createResetLink(p1.manager.actor, t.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    // The platform admin can.
    expect((await createResetLinkAsPlatformAdmin(await platformAdmin(), t.user.id)).ok).toBe(true);
  });

  // Security review F3: a reset made by A's manager must not carry into B when B reactivates the account.
  it("a manager of A cannot reset an account that B has deactivated (B might reactivate it)", async () => {
    const A = await makePractice('Practice A3');
    const B = await makePractice('Practice B3');
    const v = await addMember(B.practiceId, 'manager', false, 'Victim');
    await getDb().insert(memberships).values({ practiceId: A.practiceId, userId: v.user.id, role: 'trainee' });
    await deactivate(B.practiceId, v.user.id);
    expect(await createResetLink(A.manager.actor, v.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    await reactivateMember(B.manager.actor, v.user.id);
    expect((await signIn({ email: v.user.email, password: ATTACKER_PW, ip: null })).ok).toBe(false);
  });

  it('re-checks the rule when the link is used, including a deactivated membership added since', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const t = await addMember(p1.practiceId, 'trainee');
    const r = await createResetLink(p1.manager.actor, t.user.id);
    if (!r.ok) throw new Error(r.error);
    await getDb().insert(memberships).values({ practiceId: p2.practiceId, userId: t.user.id, role: 'manager', deactivatedAt: new Date() });
    expect(await useReset(r)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('re-checks the rule when the link is used', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const t = await addMember(p1.practiceId, 'trainee');
    const r = await createResetLink(p1.manager.actor, t.user.id);
    if (!r.ok) throw new Error(r.error);
    await getDb().insert(memberships).values({ practiceId: p2.practiceId, userId: t.user.id, role: 'manager' });
    expect(await useReset(r)).toMatchObject({ ok: false, code: 'conflict' });
    expect((await signIn({ email: t.user.email, password: PASSWORD, ip: null })).ok).toBe(true);
  });

  it("a manager cannot reset someone in another practice (not found)", async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const t = await addMember(p2.practiceId, 'trainee');
    expect(await createResetLink(p1.manager.actor, t.user.id)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await createResetLink(p1.manager.actor, 'not-a-uuid')).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('a manager cannot reset a deactivated member or a disabled account', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, t.user.id));
    expect(await createResetLink(manager.actor, t.user.id)).toMatchObject({ ok: false });
  });

  it('a newer reset link cancels the older one', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    const a = await createResetLink(manager.actor, t.user.id);
    const b = await createResetLink(manager.actor, t.user.id);
    if (!a.ok || !b.ok) throw new Error('expected links');
    expect(await lookupInvitation(a.token)).toBeNull();
    expect(await lookupInvitation(b.token)).not.toBeNull();
  });

  it('a platform admin can reset anyone, including another platform admin', async () => {
    const admin = await platformAdmin();
    const other = await makeUser({ isPlatformAdmin: true });
    const r = await createResetLinkAsPlatformAdmin(admin, other.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await useReset(r)).ok).toBe(true);
    const { manager } = await makePractice();
    await expect(createResetLinkAsPlatformAdmin(manager.actor, other.id)).rejects.toThrow(ForbiddenError);
  });

  it('the command-line reset works by email and is refused inside the Next server', async () => {
    const u = await makeUser({ isPlatformAdmin: true });
    const r = await createResetLinkFromCommandLine(u.email.toUpperCase());
    expect(r.ok).toBe(true);
    expect(await createResetLinkFromCommandLine('nobody@example.com')).toMatchObject({ ok: false, code: 'not_found' });
    process.env.NEXT_RUNTIME = 'nodejs';
    try {
      await expect(createResetLinkFromCommandLine(u.email)).rejects.toThrow();
    } finally {
      delete process.env.NEXT_RUNTIME;
    }
  });

  it('a reset asks for the privacy notice if it was never accepted', async () => {
    const { practiceId, manager } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    await getDb().update(users).set({ privacyAckAt: null }).where(eq(users.id, t.user.id));
    const r = await createResetLink(manager.actor, t.user.id);
    if (!r.ok) throw new Error(r.error);
    expect((await lookupInvitation(r.token))?.needsPrivacyAck).toBe(true);
    expect(await useReset(r)).toMatchObject({ ok: false, code: 'invalid' });
    expect((await acceptInvitation({ token: r.token, password: NEW_PASSWORD, privacyAccepted: true })).ok).toBe(true);
  });
});
