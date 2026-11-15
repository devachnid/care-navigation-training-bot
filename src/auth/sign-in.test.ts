import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { PASSWORD, addMember, makePractice, makeUser, seedLibrary } from '@/test/fixtures';
import { TEST_PASSWORD_PARAMS, hashPassword, setPasswordCostForTests, verifyPassword } from './password';
import { createSession, loadActor } from './sessions';
import { SIGN_IN_FAILED, changePassword, signIn, signOut } from './sign-in';
import { PAIR_LIMIT } from './throttle';

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
    for (let i = 0; i < PAIR_LIMIT; i++) await signIn({ email: u.email, password: 'wrong password here', ip: null });
    const r = await signIn({ email: u.email, password: PASSWORD, ip: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(SIGN_IN_FAILED);
  });

  it('counts failures for unknown emails too', async () => {
    for (let i = 0; i < PAIR_LIMIT; i++) await signIn({ email: 'ghost@example.com', password: 'x', ip: null });
    const r = await signIn({ email: 'ghost@example.com', password: 'x', ip: null });
    expect(r.ok === false && r.code).toBe('limit');
  });

  // Security review F4: guesses from elsewhere must not lock the real person out.
  it('8 wrong guesses from other addresses do not lock the real user out', async () => {
    const u = await makeUser();
    for (let i = 0; i < PAIR_LIMIT; i++) await signIn({ email: u.email, password: 'wrong guess number ' + i, ip: `10.0.0.${i}` });
    expect((await signIn({ email: u.email, password: PASSWORD, ip: '192.168.1.1' })).ok).toBe(true);
  });

  // Security review F4b: the attempt is counted before the password is checked, so racing requests cannot exceed the limit.
  it('concurrent guesses cannot get more than 8 password checks per 15 minutes', async () => {
    const u = await makeUser();
    const N = 60;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => signIn({ email: u.email, password: i === N - 1 ? PASSWORD : `wrong guess ${i} xx`, ip: null })),
    );
    const checked = results.filter(r => r.ok || r.code === 'invalid').length;
    expect(checked).toBeLessThanOrEqual(PAIR_LIMIT);
  });

  it('a successful sign-in clears the count for that email and address', async () => {
    const u = await makeUser();
    for (let i = 0; i < PAIR_LIMIT - 1; i++) await signIn({ email: u.email, password: 'wrong password here', ip: '192.0.2.50' });
    expect((await signIn({ email: u.email, password: PASSWORD, ip: '192.0.2.50' })).ok).toBe(true);
    for (let i = 0; i < PAIR_LIMIT - 1; i++) await signIn({ email: u.email, password: 'wrong password here', ip: '192.0.2.50' });
    expect((await signIn({ email: u.email, password: PASSWORD, ip: '192.0.2.50' })).ok).toBe(true);
  });

  it('rehashes a password stored with older parameters on a successful sign-in only', async () => {
    setPasswordCostForTests({ N: 2048, r: 8, p: 1 });
    const old = await hashPassword(PASSWORD);
    setPasswordCostForTests(TEST_PASSWORD_PARAMS);
    const u = await makeUser({ passwordHash: old });
    await signIn({ email: u.email, password: 'wrong password here', ip: null });
    expect((await getDb().select().from(users).where(eq(users.id, u.id)))[0].passwordHash).toBe(old);
    expect((await signIn({ email: u.email, password: PASSWORD, ip: null })).ok).toBe(true);
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(after.passwordHash!.split('$')[1]).toBe(String(TEST_PASSWORD_PARAMS.N));
    expect(await verifyPassword(PASSWORD, after.passwordHash)).toBe(true);
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
