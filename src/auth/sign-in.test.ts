import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { PASSWORD, addMember, makePractice, makeUser, seedLibrary } from '@/test/fixtures';
import { createSession, loadActor } from './sessions';
import { SIGN_IN_FAILED, changePassword, signIn, signOut } from './sign-in';
import { EMAIL_LIMIT } from './throttle';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

describe('signIn', () => {
  it('signs in with the right password, whatever the case and spacing of the email, into their practice', async () => {
    const { practiceId, manager } = await makePractice();
    const r = await signIn({ email: `  ${manager.user.email.toUpperCase()} `, password: PASSWORD, ip: '192.0.2.1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const actor = await loadActor(r.token);
    expect(actor?.membership?.practiceId).toBe(practiceId);
    const [u] = await getDb().select().from(users).where(eq(users.id, manager.user.id));
    expect(u.lastSignInAt).not.toBeNull();
  });

  it('issues a new token on every sign-in', async () => {
    const u = await makeUser();
    const a = await signIn({ email: u.email, password: PASSWORD, ip: null });
    const b = await signIn({ email: u.email, password: PASSWORD, ip: null });
    expect(a.ok && b.ok && a.token !== b.token).toBe(true);
  });

  it('gives one message for unknown email, wrong password, no password and disabled account', async () => {
    const u = await makeUser();
    const disabled = await makeUser({ disabledAt: new Date() });
    const noPassword = await makeUser({ passwordHash: null });
    const results = [
      await signIn({ email: 'nobody@example.com', password: PASSWORD, ip: null }),
      await signIn({ email: u.email, password: 'wrong password here', ip: null }),
      await signIn({ email: disabled.email, password: PASSWORD, ip: null }),
      await signIn({ email: noPassword.email, password: PASSWORD, ip: null }),
    ];
    for (const r of results) expect(r).toEqual({ ok: false, code: 'invalid', error: SIGN_IN_FAILED });
  });

  it('refuses even the right password once the email is throttled, with the same message', async () => {
    const u = await makeUser();
    for (let i = 0; i < EMAIL_LIMIT; i++) await signIn({ email: u.email, password: 'wrong password here', ip: null });
    const r = await signIn({ email: u.email, password: PASSWORD, ip: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(SIGN_IN_FAILED);
  });

  it('counts failures for unknown emails too', async () => {
    for (let i = 0; i < EMAIL_LIMIT; i++) await signIn({ email: 'ghost@example.com', password: 'x', ip: null });
    const r = await signIn({ email: 'ghost@example.com', password: 'x', ip: null });
    expect(r.ok === false && r.code).toBe('limit');
  });

  it('signs in a user with no membership (platform admin) with no practice', async () => {
    const u = await makeUser({ isPlatformAdmin: true });
    const r = await signIn({ email: u.email, password: PASSWORD, ip: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await loadActor(r.token))?.membership).toBeNull();
  });
});

describe('signOut', () => {
  it('ends the session', async () => {
    const u = await makeUser();
    const s = await createSession(u.id, null);
    await signOut(s.token);
    expect(await loadActor(s.token)).toBeNull();
  });
});

describe('changePassword', () => {
  it('needs the current password and the policy, then signs out other sessions only', async () => {
    const { practiceId } = await makePractice();
    const t = await addMember(practiceId, 'trainee');
    const other = await createSession(t.user.id, practiceId);

    expect(await changePassword(t.actor, { currentPassword: 'not it at all', newPassword: 'a whole new phrase', sessionToken: t.token })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await changePassword(t.actor, { currentPassword: PASSWORD, newPassword: 'short', sessionToken: t.token })).toMatchObject({ ok: false, code: 'invalid' });

    expect(await changePassword(t.actor, { currentPassword: PASSWORD, newPassword: 'a whole new phrase', sessionToken: t.token })).toEqual({ ok: true });
    expect(await loadActor(other.token)).toBeNull();
    expect(await loadActor(t.token)).not.toBeNull();
    expect((await signIn({ email: t.user.email, password: 'a whole new phrase', ip: null })).ok).toBe(true);
    expect((await signIn({ email: t.user.email, password: PASSWORD, ip: null })).ok).toBe(false);
    const logged = await getDb().select().from(auditLog).where(eq(auditLog.action, 'user.password_changed'));
    expect(logged.some(l => l.targetId === t.user.id)).toBe(true);
  });
});
