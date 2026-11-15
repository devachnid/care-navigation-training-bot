import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { debriefs, memberships, practiceScenarios, sessions } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { assertMember, isUuid } from '@/policy/result';

/** How one person is doing, counting only assessed calls made in the actor's practice. */
export type TeamStats = {
  userId: string;
  /** Calls with a debrief (including a call too short to assess, which scores 0). */
  calls: number;
  lastCallAt: Date | null;
  /** Mean score, rounded, 0 to 100. Null when there are no assessed calls. */
  averageScore: number | null;
  /** Calls where the red flag was missed or the outcome was unsafe. */
  unsafeOutcomes: number;
};

/**
 * Manager: one row for every person who belongs to the actor's practice (including deactivated
 * people), with zeros for someone who has made no assessed calls. One query, grouped by user.
 * Calls made in other practices by the same person are not counted.
 */
export async function listTeamStats(actor: Actor): Promise<TeamStats[]> {
  assertMember(actor, 'team.manage');
  const practiceId = actor.membership.practiceId;
  return getDb()
    .select({
      userId: memberships.userId,
      calls: sql<number>`count(${debriefs.id})::int`,
      lastCallAt: sql<Date | null>`max(${sessions.startedAt}) filter (where ${debriefs.id} is not null)`.mapWith(sessions.startedAt),
      averageScore: sql<number | null>`round(avg(${debriefs.overallScore}))::int`,
      unsafeOutcomes: sql<number>`(count(*) filter (where ${debriefs.unsafeOutcome}))::int`,
    })
    .from(memberships)
    .leftJoin(sessions, and(eq(sessions.userId, memberships.userId), eq(sessions.practiceId, memberships.practiceId)))
    .leftJoin(debriefs, eq(debriefs.sessionId, sessions.id))
    .where(eq(memberships.practiceId, practiceId))
    .groupBy(memberships.userId);
}

export type MemberScenarioProgress = {
  practiceScenarioId: string;
  title: string;
  attempts: number;
  bestScore: number;
  /** The most recent assessed call: `unsafe` if unsafe, `passed` if the outcome was correct, otherwise `not_yet`. */
  latest: 'passed' | 'not_yet' | 'unsafe';
  lastCallAt: Date;
};

/**
 * Manager: one person's progress on each scenario, in the actor's practice. Someone who is not in
 * the practice (or a malformed id) gives an empty list, the same as someone with no calls.
 */
export async function listMemberProgress(actor: Actor, userId: string): Promise<MemberScenarioProgress[]> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return [];
  const practiceId = actor.membership.practiceId;
  const rows = await getDb()
    .select({
      practiceScenarioId: sessions.practiceScenarioId,
      title: practiceScenarios.title,
      attempts: sql<number>`count(*)::int`,
      bestScore: sql<number>`max(${debriefs.overallScore})::int`,
      latest: sql<MemberScenarioProgress['latest']>`(array_agg(
        case when ${debriefs.unsafeOutcome} then 'unsafe' when ${debriefs.outcomeCorrect} then 'passed' else 'not_yet' end
        order by ${sessions.startedAt} desc, ${sessions.id} desc
      ))[1]`,
      lastCallAt: sql<Date>`max(${sessions.startedAt})`.mapWith(sessions.startedAt),
    })
    .from(sessions)
    .innerJoin(debriefs, eq(debriefs.sessionId, sessions.id))
    .innerJoin(practiceScenarios, and(eq(practiceScenarios.id, sessions.practiceScenarioId), eq(practiceScenarios.practiceId, practiceId)))
    .where(and(eq(sessions.practiceId, practiceId), eq(sessions.userId, userId)))
    .groupBy(sessions.practiceScenarioId, practiceScenarios.title)
    .orderBy(practiceScenarios.title);
  return rows.map(r => ({ ...r, practiceScenarioId: r.practiceScenarioId! }));
}
