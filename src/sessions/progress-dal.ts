import { sql } from 'drizzle-orm';
import { queryRows } from '@/db/client';
import { debriefs, sessions } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { assertMember } from '@/policy/result';

/** How the person's latest assessed call on a scenario went. */
export type LatestResult = 'passed' | 'not_yet' | 'unsafe';

export type ScenarioProgress = {
  practiceScenarioId: string;
  /** Calls on this scenario that were assessed (including a call too short to assess, which scores 0). */
  attempts: number;
  /** Highest score, 0 to 100. */
  bestScore: number;
  /** `unsafe` if the red flag was missed or the outcome was unsafe; `passed` if the outcome was correct; otherwise `not_yet`. */
  latest: LatestResult;
};

/**
 * The actor's own progress on each scenario, in their active practice. One entry per scenario they
 * have at least one assessed call on, keyed by `practiceScenarioId`. Calls that never finished,
 * or whose debrief failed, are not attempts. Never shows another person's calls, or another practice's.
 */
export async function listMyProgress(actor: Actor): Promise<Map<string, ScenarioProgress>> {
  assertMember(actor, 'sessions.viewOwn');
  const rows = await queryRows<{ practiceScenarioId: string; attempts: number; bestScore: number; latest: LatestResult }>(sql`
    select
      ${sessions.practiceScenarioId} as "practiceScenarioId",
      count(*)::int as attempts,
      max(${debriefs.overallScore})::int as "bestScore",
      (array_agg(
        case when ${debriefs.unsafeOutcome} then 'unsafe' when ${debriefs.outcomeCorrect} then 'passed' else 'not_yet' end
        order by ${sessions.startedAt} desc, ${sessions.id} desc
      ))[1] as latest
    from ${sessions}
    join ${debriefs} on ${debriefs.sessionId} = ${sessions.id}
    where ${sessions.practiceId} = ${actor.membership.practiceId}::uuid
      and ${sessions.userId} = ${actor.userId}::uuid
      and ${sessions.practiceScenarioId} is not null
    group by ${sessions.practiceScenarioId}
  `);
  return new Map(rows.map(r => [r.practiceScenarioId, r]));
}
