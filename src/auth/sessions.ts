import { and, asc, eq, gt, isNull, lte, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authSessions, memberships, practices, users } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { hashToken, isWellFormedToken, newToken } from './tokens';

/** A session lasts this long from sign-in and is never extended: reception desktops are shared. */
export const SESSION_HOURS = 12;

export type NewSession = { token: string; expiresAt: Date };

/**
 * The practice a fresh sign-in acts in: the user's oldest active membership of an unsuspended
 * practice, or null. They can switch from their account page.
 */
export async function defaultPracticeFor(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ practiceId: memberships.practiceId })
    .from(memberships)
    .innerJoin(practices, eq(practices.id, memberships.practiceId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(practices.suspendedAt)))
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .limit(1);
  return row?.practiceId ?? null;
}

/** Issues a new session token. Only its hash is stored; the token goes in the cookie. */
export async function createSession(userId: string, activePracticeId: string | null, now = new Date()): Promise<NewSession> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000);
  const db = getDb();
  // Housekeeping: this user's expired sessions are of no further use.
  await db.delete(authSessions).where(and(eq(authSessions.userId, userId), lte(authSessions.expiresAt, now)));
  await db.insert(authSessions).values({ tokenHash: hashToken(token), userId, activePracticeId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

/**
 * The actor for a session token, in one query, or null if the token is unknown, expired, or the
 * user is disabled. A deactivated membership or a suspended practice leaves `membership` null:
 * signed in, but not in that practice.
 */
export async function loadActor(token: string | null | undefined, now = new Date()): Promise<Actor | null> {
  if (!isWellFormedToken(token)) return null;
  const [row] = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isPlatformAdmin: users.isPlatformAdmin,
      practiceId: practices.id,
      practiceName: practices.name,
      role: memberships.role,
      canApproveScenarios: memberships.canApproveScenarios,
    })
    .from(authSessions)
    .innerJoin(users, and(eq(users.id, authSessions.userId), isNull(users.disabledAt)))
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, authSessions.userId),
        eq(memberships.practiceId, authSessions.activePracticeId),
        isNull(memberships.deactivatedAt),
      ),
    )
    .leftJoin(practices, and(eq(practices.id, memberships.practiceId), isNull(practices.suspendedAt)))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, now)));
  if (!row) return null;
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    isPlatformAdmin: row.isPlatformAdmin,
    membership:
      row.practiceId && row.practiceName && row.role
        ? {
            practiceId: row.practiceId,
            practiceName: row.practiceName,
            role: row.role,
            canApproveScenarios: row.canApproveScenarios ?? false,
          }
        : null,
  };
}

/** Ends one session (sign out). */
export async function deleteSession(token: string | null | undefined): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await getDb().delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}

/** Ends every session of a user except, optionally, the one making the request. */
export async function deleteUserSessions(userId: string, exceptToken?: string | null): Promise<void> {
  const keep = isWellFormedToken(exceptToken) ? hashToken(exceptToken) : null;
  await getDb()
    .delete(authSessions)
    .where(and(eq(authSessions.userId, userId), keep ? ne(authSessions.tokenHash, keep) : undefined));
}

/** Points a session at another practice; only one the session's own user is an active member of. */
export async function setActivePractice(token: string, userId: string, practiceId: string): Promise<boolean> {
  if (!isWellFormedToken(token)) return false;
  const db = getDb();
  const [ok] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(practices, eq(practices.id, memberships.practiceId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.practiceId, practiceId),
        isNull(memberships.deactivatedAt),
        isNull(practices.suspendedAt),
      ),
    );
  if (!ok) return false;
  const updated = await db
    .update(authSessions)
    .set({ activePracticeId: practiceId })
    .where(and(eq(authSessions.tokenHash, hashToken(token)), eq(authSessions.userId, userId)))
    .returning({ id: authSessions.id });
  return updated.length === 1;
}

