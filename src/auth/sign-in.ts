import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { audit } from '@/audit/log';
import type { Actor } from '@/policy/actor';
import { fail, type Result } from '@/policy/result';
import { normaliseEmail } from './email';
import { checkPasswordPolicy, hashPassword, needsRehash, verifyAgainstNothing, verifyPassword } from './password';
import { createSession, defaultPracticeFor, deleteSession, deleteUserSessions, type NewSession } from './sessions';
import { clearSignInAttempts, countSignInAttempt } from './throttle';

/** The one message for unknown email, wrong password, disabled account and too many attempts. */
export const SIGN_IN_FAILED =
  'That email and password do not match an account. Check them and try again. After several tries you will need to wait 15 minutes.';

export type CredentialCheck = { ok: true; userId: string } | { ok: false; code: 'invalid' | 'limit' };

/**
 * Checks an email and password the way sign-in does: the attempt is counted against the throttle
 * first (refused over the limit, before any password check), an unknown email still costs one
 * scrypt, and a disabled account fails like a wrong password. On success the email-and-IP count is
 * cleared and a hash made with older parameters is replaced with one at the current cost.
 * Never changes anything else. Used by sign-in and by accepting an invitation with an existing account.
 */
export async function checkCredentials(rawEmail: string, password: string, ip: string | null): Promise<CredentialCheck> {
  const email = normaliseEmail(rawEmail);
  if (!email || !password || password.length > 1024) return { ok: false, code: 'invalid' };
  if (!(await countSignInAttempt(email, ip))) return { ok: false, code: 'limit' };

  const [user] = await getDb()
    .select({ id: users.id, passwordHash: users.passwordHash, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email));
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await verifyAgainstNothing(password);
  if (!user || !user.passwordHash || !ok || user.disabledAt) return { ok: false, code: 'invalid' };

  await clearSignInAttempts(email, ip);
  if (needsRehash(user.passwordHash)) {
    // Only if the hash has not been changed meanwhile (e.g. a password reset).
    await getDb()
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)));
  }
  return { ok: true, userId: user.id };
}

/**
 * Checks an email and password and starts a new session. The server action sets the cookie from
 * the returned token. Never reveals whether an account exists.
 */
export async function signIn(input: { email: string; password: string; ip: string | null }): Promise<Result<NewSession>> {
  const checked = await checkCredentials(input.email, input.password, input.ip);
  if (!checked.ok) return fail(checked.code, SIGN_IN_FAILED);
  await getDb().update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, checked.userId));
  const session = await createSession(checked.userId, await defaultPracticeFor(checked.userId));
  return { ok: true, ...session };
}

/** Ends the session behind this cookie token. The server action deletes the cookie. */
export async function signOut(token: string | null | undefined): Promise<void> {
  await deleteSession(token);
}

/**
 * Changes the signed-in user's password and signs out their other sessions.
 * `sessionToken` is the current cookie token, which stays signed in.
 */
export async function changePassword(
  actor: Actor,
  input: { currentPassword: string; newPassword: string; sessionToken: string | null },
): Promise<Result> {
  const [user] = await getDb()
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId));
  if (!user) return fail('not_found', 'Your account could not be found. Sign out and sign in again.');
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return fail('invalid', 'Your current password is not right. Check it and try again.');
  }
  const problem = checkPasswordPolicy(input.newPassword, user.email);
  if (problem) return fail('invalid', problem);

  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, actor.userId));
  await deleteUserSessions(actor.userId, input.sessionToken);
  await audit(actor, 'user.password_changed', { type: 'user', id: actor.userId, practiceId: null });
  return { ok: true };
}
