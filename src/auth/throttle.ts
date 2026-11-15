import { inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authThrottle } from '@/db/schema';

export const THROTTLE_WINDOW_MS = 15 * 60_000;
export const EMAIL_LIMIT = 8;
export const IP_LIMIT = 30;

export const emailKey = (email: string) => `email:${email}`;
export const ipKey = (ip: string) => `ip:${ip}`;

const limitFor = (key: string) => (key.startsWith('ip:') ? IP_LIMIT : EMAIL_LIMIT);

function keysFor(email: string, ip: string | null): string[] {
  return ip ? [emailKey(email), ipKey(ip)] : [emailKey(email)];
}

/** True if either the email or the IP has had too many failed sign-ins in the current window. */
export async function isThrottled(email: string, ip: string | null, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - THROTTLE_WINDOW_MS);
  const rows = await getDb()
    .select()
    .from(authThrottle)
    .where(inArray(authThrottle.key, keysFor(email, ip)));
  return rows.some(r => r.windowStartedAt > cutoff && r.count >= limitFor(r.key));
}

/**
 * Counts one failed sign-in against the email and the IP. Each key is one atomic upsert: a new
 * window starts when the old one has run out, otherwise the count goes up.
 */
export async function recordFailedSignIn(email: string, ip: string | null, now = new Date()): Promise<void> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - THROTTLE_WINDOW_MS);
  const expired = sql`${authThrottle.windowStartedAt} <= ${cutoff.toISOString()}::timestamptz`;
  for (const key of keysFor(email, ip)) {
    await db
      .insert(authThrottle)
      .values({ key, count: 1, windowStartedAt: now })
      .onConflictDoUpdate({
        target: authThrottle.key,
        set: {
          count: sql`case when ${expired} then 1 else ${authThrottle.count} + 1 end`,
          windowStartedAt: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${authThrottle.windowStartedAt} end`,
        },
      });
  }
  // Housekeeping: windows that ended a day ago are of no use.
  await db.delete(authThrottle).where(lt(authThrottle.windowStartedAt, new Date(now.getTime() - 86_400_000)));
}

/** After a successful sign-in the email's count starts again. The IP's does not. */
export async function clearEmailThrottle(email: string): Promise<void> {
  await getDb().delete(authThrottle).where(inArray(authThrottle.key, [emailKey(email)]));
}
