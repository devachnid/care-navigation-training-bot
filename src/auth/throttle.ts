import { eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authThrottle } from '@/db/schema';

export const THROTTLE_WINDOW_MS = 15 * 60_000;
/** Attempts per email and IP together (or per email alone when there is no IP). */
export const PAIR_LIMIT = 8;
/** Backstop per email, whatever the IP: stops guessing spread across many addresses. */
export const EMAIL_LIMIT = 100;
/** Attempts per IP, whatever the email. */
export const IP_LIMIT = 30;
/** Wrong setup codes, under one fixed key. */
export const SETUP_LIMIT = 5;

type Key = { key: string; limit: number };

const pairKey = (email: string, ip: string | null) => `pair:${email}|${ip ?? ''}`;

function signInKeys(email: string, ip: string | null): Key[] {
  const keys: Key[] = [
    { key: pairKey(email, ip), limit: PAIR_LIMIT },
    { key: `email:${email}`, limit: EMAIL_LIMIT },
  ];
  if (ip) keys.push({ key: `ip:${ip}`, limit: IP_LIMIT });
  return keys;
}

/**
 * Counts one attempt against each key and says whether every key is still within its limit.
 * Each key is one atomic upsert returning the new count (a new window starts when the old one has
 * run out), so concurrent attempts cannot all slip under the limit: the count comes first, the
 * expensive check after.
 */
async function countAttempt(keys: Key[], now: Date): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - THROTTLE_WINDOW_MS);
  const expired = sql`${authThrottle.windowStartedAt} <= ${cutoff.toISOString()}::timestamptz`;
  let allowed = true;
  for (const { key, limit } of keys) {
    const [row] = await db
      .insert(authThrottle)
      .values({ key, count: 1, windowStartedAt: now })
      .onConflictDoUpdate({
        target: authThrottle.key,
        set: {
          count: sql`case when ${expired} then 1 else ${authThrottle.count} + 1 end`,
          windowStartedAt: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${authThrottle.windowStartedAt} end`,
        },
      })
      .returning({ count: authThrottle.count });
    if (!row || row.count > limit) allowed = false;
  }
  // Housekeeping: windows that ended a day ago are of no use.
  await db.delete(authThrottle).where(lt(authThrottle.windowStartedAt, new Date(now.getTime() - 86_400_000)));
  return allowed;
}

/** Call before checking a password. False means refuse, with the same message as a wrong password. */
export async function countSignInAttempt(email: string, ip: string | null, now = new Date()): Promise<boolean> {
  return countAttempt(signInKeys(email, ip), now);
}

/**
 * After a correct password (sign-in, joining with an existing account, changing a password): the
 * email-and-IP count starts again, and the attempt is given back on the per-email and per-IP keys
 * (one atomic decrement each, never below zero). So only failures build up there, and a whole
 * practice signing in from one public IP at the start of a shift does not lock itself out.
 */
export async function recordSuccessfulSignIn(email: string, ip: string | null): Promise<void> {
  const db = getDb();
  await db.delete(authThrottle).where(eq(authThrottle.key, pairKey(email, ip)));
  const keys = ip ? [`email:${email}`, `ip:${ip}`] : [`email:${email}`];
  await db
    .update(authThrottle)
    .set({ count: sql`greatest(${authThrottle.count} - 1, 0)` })
    .where(inArray(authThrottle.key, keys));
}

/** Call before checking a setup code. False means refuse. */
export async function countSetupAttempt(now = new Date()): Promise<boolean> {
  return countAttempt([{ key: 'setup', limit: SETUP_LIMIT }], now);
}
