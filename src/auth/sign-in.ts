import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { audit } from '@/audit/log';
import type { Actor } from '@/policy/actor';
import { fail, type Result } from '@/policy/result';
import { normaliseEmail } from './email';
import { checkPasswordPolicy, hashPassword, verifyAgainstNothing, verifyPassword } from './password';
import { createSession, defaultPracticeFor, deleteSession, deleteUserSessions, type NewSession } from './sessions';
import { clearEmailThrottle, isThrottled, recordFailedSignIn } from './throttle';

/** The one message for unknown email, wrong password, disabled account and too many attempts. */
export const SIGN_IN_FAILED =
  'That email and password do not match an account. Check them and try again. After several tries you will need to wait 15 minutes.';

/**
 * Checks an email and password and starts a new session. The server action sets the cookie from
 * the returned token. Never reveals whether an account exists.
 */
export async function signIn(input: { email: string; password: string; ip: string | null }): Promise<Result<NewSession>> {
  const email = normaliseEmail(input.email);
  const password = input.password;
  if (!email || !password || password.length > 1024) return fail('invalid', SIGN_IN_FAILED);

  if (await isThrottled(email, input.ip)) return fail('limit', SIGN_IN_FAILED);

  const [user] = await getDb()
    .select({ id: users.id, passwordHash: users.passwordHash, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email));

  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await verifyAgainstNothing(password);
  if (!user || !ok || user.disabledAt) {
    await recordFailedSignIn(email, input.ip);
    return fail('invalid', SIGN_IN_FAILED);
  }

  await clearEmailThrottle(email);
  await getDb().update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(user.id, await defaultPracticeFor(user.id));
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
