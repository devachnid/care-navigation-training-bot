import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { debriefFlags, sessions, users } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { assertMember, fail, isUuid, type Result } from '@/policy/result';
import { getDebrief, getSession } from '@/sessions/dal';

export const FLAG_REASON_MAX = 500;

const NOT_FOUND = 'That debrief could not be found.';

/**
 * "Report a problem with this debrief". Anyone who can see the debrief (the caller, or a manager of
 * the practice) can report it. One open report each per debrief: a second one is refused until a
 * manager has dealt with the first. The reason is 1 to 500 characters. Refused once the call's
 * transcript has been deleted under the practice's retention period.
 */
export async function flagDebrief(actor: Actor, sessionId: string, reason: string): Promise<Result<{ flagId: string }>> {
  assertMember(actor, 'sessions.viewOwn');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text) return fail('invalid', 'Say what is wrong with the debrief.');
  if (text.length > FLAG_REASON_MAX) return fail('invalid', `Keep it to ${FLAG_REASON_MAX} characters or fewer.`);
  const session = await getSession(actor, sessionId);
  if (!session || !(await getDebrief(actor, sessionId))) return fail('not_found', NOT_FOUND);
  if (session.transcriptDeletedAt) {
    return fail('conflict', 'The transcript of this call has been deleted, so a problem with its debrief can no longer be reported.');
  }

  // One statement, so two quick clicks cannot make two reports.
  const [row] = await queryRows<{ id: string }>(sql`
    insert into ${debriefFlags} (session_id, practice_id, user_id, reason)
    select ${session.id}::uuid, ${actor.membership.practiceId}::uuid, ${actor.userId}::uuid, ${text}
    where not exists (
      select 1 from ${debriefFlags}
      where ${debriefFlags.sessionId} = ${session.id}::uuid and ${debriefFlags.userId} = ${actor.userId}::uuid
        and ${debriefFlags.resolvedAt} is null
    )
    returning id
  `);
  if (!row) return fail('conflict', 'You have already reported a problem with this debrief.');
  return { ok: true, flagId: row.id };
}

export type MyFlag = { reason: string; createdAt: Date; resolved: boolean };

/** The actor's own latest report on a debrief they can see, or null. */
export async function getMyFlag(actor: Actor, sessionId: string): Promise<MyFlag | null> {
  assertMember(actor, 'sessions.viewOwn');
  if (!isUuid(sessionId) || !(await getSession(actor, sessionId))) return null;
  const [row] = await getDb()
    .select({ reason: debriefFlags.reason, createdAt: debriefFlags.createdAt, resolvedAt: debriefFlags.resolvedAt })
    .from(debriefFlags)
    .where(
      and(
        eq(debriefFlags.sessionId, sessionId),
        eq(debriefFlags.userId, actor.userId),
        eq(debriefFlags.practiceId, actor.membership.practiceId),
      ),
    )
    .orderBy(desc(debriefFlags.createdAt))
    .limit(1);
  return row ? { reason: row.reason, createdAt: row.createdAt, resolved: row.resolvedAt !== null } : null;
}

export type OpenFlag = {
  id: string;
  sessionId: string;
  reason: string;
  createdAt: Date;
  reportedByName: string;
  /** The scenario title of the call. */
  title: string;
  /** Whose call it was. */
  callerName: string;
};

/** Manager: reports in the practice that nobody has dealt with yet, oldest first. */
export async function listOpenFlags(actor: Actor): Promise<OpenFlag[]> {
  assertMember(actor, 'sessions.viewPractice');
  const callers = sql`(select name from ${users} where ${users.id} = ${sessions.userId})`;
  return getDb()
    .select({
      id: debriefFlags.id,
      sessionId: debriefFlags.sessionId,
      reason: debriefFlags.reason,
      createdAt: debriefFlags.createdAt,
      reportedByName: users.name,
      title: sql<string>`${sessions.scenarioSnapshot}->>'title'`,
      callerName: sql<string>`${callers}`,
    })
    .from(debriefFlags)
    .innerJoin(users, eq(users.id, debriefFlags.userId))
    .innerJoin(sessions, eq(sessions.id, debriefFlags.sessionId))
    .where(and(eq(debriefFlags.practiceId, actor.membership.practiceId), isNull(debriefFlags.resolvedAt)))
    .orderBy(debriefFlags.createdAt);
}

/** Manager: marks a report in their practice as dealt with. Another practice's report is "not found". */
export async function resolveFlag(actor: Actor, flagId: string): Promise<Result> {
  assertMember(actor, 'sessions.viewPractice');
  if (!isUuid(flagId)) return fail('not_found', 'That report could not be found.');
  const [row] = await getDb()
    .update(debriefFlags)
    .set({ resolvedAt: new Date(), resolvedBy: actor.userId })
    .where(and(eq(debriefFlags.id, flagId), eq(debriefFlags.practiceId, actor.membership.practiceId), isNull(debriefFlags.resolvedAt)))
    .returning({ id: debriefFlags.id });
  if (!row) return fail('not_found', 'That report could not be found, or has already been dealt with.');
  return { ok: true };
}
