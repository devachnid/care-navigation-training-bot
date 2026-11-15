import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, invitations, memberships, users } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { PASSWORD, addMember, makePractice, makeUser, platformAdmin, seedLibrary } from '@/test/fixtures';
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
import { createSession, loadActor } from './sessions';
import { signIn } from './sign-in';
import { hashToken } from './tokens';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

const NEW_PASSWORD = 'bara brith and tea';
let n = 0;
const fresh = () => `new-person-${++n}@example.com`;

async function invite(manager: Awaited<ReturnType<typeof makePractice>>['manager'], over: Partial<Parameters<typeof createInvitation>[1]> = {}) {
  const r = await createInvitation(manager.actor, { email: fresh(), name: 'Nia Evans', role: 'trainee', canApproveScenarios: false, ...over });
  if (!r.ok || r.added) throw new Error('expected a link');
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

  it('adds an existing account straight away, with no link', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const existing = await addMember(p1.practiceId, 'trainee');
    const r = await createInvitation(p2.manager.actor, { email: existing.user.email.toUpperCase(), name: 'Whoever', role: 'trainee', canApproveScenarios: false });
    expect(r).toEqual({ ok: true, added: true, userId: existing.user.id });
    const again = await createInvitation(p2.manager.actor, { email: existing.user.email, name: 'Whoever', role: 'trainee', canApproveScenarios: false });
    expect(again).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('will not set a password on an account that already has one', async () => {
    const { manager } = await makePractice();
    const email = fresh();
    const link = await invite(manager, { email });
    await makeUser({ email });
    expect(await acceptInvitation({ token: link.token, password: NEW_PASSWORD, privacyAccepted: true })).toMatchObject({ ok: false, code: 'conflict' });
    expect((await signIn({ email, password: PASSWORD, ip: null })).ok).toBe(true);
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
    expect(r.ok && !r.added).toBe(true);
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

  it('a manager cannot reset someone with an active membership in another practice', async () => {
    const p1 = await makePractice();
    const p2 = await makePractice();
    const t = await addMember(p1.practiceId, 'trainee');
    await getDb().insert(memberships).values({ practiceId: p2.practiceId, userId: t.user.id, role: 'trainee' });
    expect(await createResetLink(p1.manager.actor, t.user.id)).toMatchObject({ ok: false, code: 'conflict' });
    // ...but can once that other membership is deactivated.
    await getDb()
      .update(memberships)
      .set({ deactivatedAt: new Date() })
      .where(and(eq(memberships.practiceId, p2.practiceId), eq(memberships.userId, t.user.id)));
    expect((await createResetLink(p1.manager.actor, t.user.id)).ok).toBe(true);
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
