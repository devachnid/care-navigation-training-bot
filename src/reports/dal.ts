import { and, asc, desc, eq, gte, isNull, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { debriefs, memberships, practiceScenarios, sessions, users, type SessionStatus } from '@/db/schema';
import type { RubricScores } from '@/debrief/rubric';
import type { MemberActor } from '@/policy/actor';
import { assertMember } from '@/policy/result';
import type { ScenarioContent } from '@/scenarios/types';
import { periodStart, type Period } from './period';

/**
 * Practice reports (manager only). Definitions used by every function here:
 * - An assessed call is a session in the actor's practice that has a debrief (a call that was too
 *   short has one, with score 0 and no rubric scores). Sessions with no practice (PoC rows) never match.
 * - Unsafe: `debriefs.unsafe_outcome`. Passed: `outcome_correct` and not unsafe. Otherwise not yet.
 * - Staff: people with an active place (not deactivated) in the practice. A person who has since
 *   been deactivated still has their past calls counted in totals, but is not listed as staff.
 * - The scenario's title and difficulty are read from `sessions.scenario_snapshot`, so a scenario
 *   that was edited or hidden later still reports as it was when the call was made.
 * - The period filters on when the call started; the start is inclusive. `now` is for tests.
 */

export type CallResult = 'passed' | 'not_yet' | 'unsafe';

const RESULT = sql<CallResult>`case when ${debriefs.unsafeOutcome} then 'unsafe' when ${debriefs.outcomeCorrect} then 'passed' else 'not_yet' end`;
const ORDER_NEWEST_FIRST = sql`order by ${sessions.startedAt} desc, ${sessions.id} desc`;

/** The practice's assessed calls in the period. Always used with `.from(sessions).innerJoin(debriefs, ...)`. */
function assessedCalls(actor: MemberActor, period: Period, now: Date): SQL {
  const start = periodStart(period, now);
  return and(eq(sessions.practiceId, actor.membership.practiceId), start ? gte(sessions.startedAt, start) : undefined)!;
}
const withDebrief = eq(debriefs.sessionId, sessions.id);

const activeStaff = (actor: MemberActor): SQL =>
  and(eq(memberships.practiceId, actor.membership.practiceId), isNull(memberships.deactivatedAt))!;

// ---------------------------------------------------------------------------

export type Summary = {
  /** Assessed calls in the period, by anyone who has ever been in the practice. */
  calls: number;
  /** Staff (active places only) with at least one call in the period. */
  staffPractised: number;
  /** Everyone with an active place now. */
  totalStaff: number;
  /** Average score, 0 to 100, over assessed calls (a call too short counts as 0). null when there are no calls. */
  averageScore: number | null;
  unsafe: number;
};

export async function getSummary(actor: MemberActor, period: Period, now = new Date()): Promise<Summary> {
  assertMember(actor, 'reports.view');
  const practiceId = actor.membership.practiceId;
  const [row] = await getDb()
    .select({
      calls: sql<number>`count(*)::int`,
      staffPractised: sql<number>`(count(distinct ${sessions.userId}) filter (where exists (
        select 1 from ${memberships} where ${memberships.practiceId} = ${practiceId}::uuid
          and ${memberships.userId} = ${sessions.userId} and ${memberships.deactivatedAt} is null)))::int`,
      totalStaff: sql<number>`(select count(*)::int from ${memberships} where ${activeStaff(actor)})`,
      averageScore: sql<number | null>`round(avg(${debriefs.overallScore}))::int`,
      unsafe: sql<number>`(count(*) filter (where ${debriefs.unsafeOutcome}))::int`,
    })
    .from(sessions)
    .innerJoin(debriefs, withDebrief)
    .where(assessedCalls(actor, period, now));
  return row;
}

// ---------------------------------------------------------------------------

export type MatrixScenario = {
  id: string;
  title: string;
  difficulty: ScenarioContent['difficulty'];
};
export type MatrixCell = {
  /** The result of their latest call on this scenario in the period. */
  result: CallResult;
  bestScore: number;
  attempts: number;
  /** Their latest call on it: where the cell links to. */
  sessionId: string;
};
export type MatrixStaff = {
  userId: string;
  name: string;
  /** Keyed by `MatrixScenario.id`; a scenario they have not tried has no entry. */
  cells: Record<string, MatrixCell>;
};
export type StaffMatrix = { scenarios: MatrixScenario[]; staff: MatrixStaff[] };

/**
 * One row per staff member (active places only, by name) and one column per scenario the practice
 * has active now. A cell is the person's latest call on that scenario in the period. Calls on
 * scenarios that have since been hidden have no column here (they still count in the totals).
 */
export async function getStaffMatrix(actor: MemberActor, period: Period, now = new Date()): Promise<StaffMatrix> {
  assertMember(actor, 'reports.view');
  const db = getDb();
  const mine = db
    .select({
      userId: sql<string>`${sessions.userId}`.as('caller_id'),
      practiceScenarioId: sql<string>`${sessions.practiceScenarioId}`.as('practice_scenario_id'),
      bestScore: sql<number>`max(${debriefs.overallScore})::int`.as('best_score'),
      attempts: sql<number>`count(*)::int`.as('attempts'),
      result: sql<CallResult>`(array_agg(${RESULT} ${ORDER_NEWEST_FIRST}))[1]`.as('result'),
      sessionId: sql<string>`(array_agg(${sessions.id} ${ORDER_NEWEST_FIRST}))[1]`.as('session_id'),
    })
    .from(sessions)
    .innerJoin(debriefs, withDebrief)
    .where(and(assessedCalls(actor, period, now), sql`${sessions.practiceScenarioId} is not null`))
    .groupBy(sessions.userId, sessions.practiceScenarioId)
    .as('mine');

  const [staffRows, scenarioRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        practiceScenarioId: mine.practiceScenarioId,
        bestScore: mine.bestScore,
        attempts: mine.attempts,
        result: mine.result,
        sessionId: mine.sessionId,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(mine, eq(mine.userId, users.id))
      .where(activeStaff(actor))
      .orderBy(sql`lower(${users.name})`, users.id),
    db
      .select({
        id: practiceScenarios.id,
        title: practiceScenarios.title,
        difficulty: practiceScenarios.difficulty,
      })
      .from(practiceScenarios)
      .where(and(eq(practiceScenarios.practiceId, actor.membership.practiceId), eq(practiceScenarios.active, true)))
      .orderBy(
        sql`case ${practiceScenarios.difficulty} when 'easy' then 1 when 'medium' then 2 else 3 end`,
        practiceScenarios.title,
        practiceScenarios.id,
      ),
  ]);

  const columns = new Set(scenarioRows.map(s => s.id));
  const staff = new Map<string, MatrixStaff>();
  for (const r of staffRows) {
    const person = staff.get(r.userId) ?? {
      userId: r.userId,
      name: r.name,
      cells: {},
    };
    staff.set(r.userId, person);
    if (
      r.practiceScenarioId &&
      columns.has(r.practiceScenarioId) &&
      r.result &&
      r.sessionId &&
      r.bestScore !== null &&
      r.attempts !== null
    ) {
      person.cells[r.practiceScenarioId] = {
        result: r.result,
        bestScore: r.bestScore,
        attempts: r.attempts,
        sessionId: r.sessionId,
      };
    }
  }
  return { scenarios: scenarioRows, staff: [...staff.values()] };
}

// ---------------------------------------------------------------------------

export type ScenarioRow = {
  practiceScenarioId: string;
  /** From the snapshot of the most recent call in the period. */
  title: string;
  difficulty: ScenarioContent['difficulty'];
  attempts: number;
  /** People who tried it, including anyone since deactivated. */
  people: number;
  passed: number;
  /** Percentage of attempts that passed, 0 to 100, rounded. */
  passRate: number;
  averageScore: number;
  unsafe: number;
};

/** One row per scenario with at least one call in the period (hidden scenarios included), busiest first. */
export async function getScenarioBreakdown(actor: MemberActor, period: Period, now = new Date()): Promise<ScenarioRow[]> {
  assertMember(actor, 'reports.view');
  const rows = await getDb()
    .select({
      practiceScenarioId: sql<string>`${sessions.practiceScenarioId}`,
      title: sql<string>`(array_agg(${sessions.scenarioSnapshot}->>'title' ${ORDER_NEWEST_FIRST}))[1]`,
      difficulty: sql<ScenarioContent['difficulty']>`(array_agg(${sessions.scenarioSnapshot}->>'difficulty' ${ORDER_NEWEST_FIRST}))[1]`,
      attempts: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${sessions.userId})::int`,
      passed: sql<number>`(count(*) filter (where ${debriefs.outcomeCorrect} and not ${debriefs.unsafeOutcome}))::int`,
      averageScore: sql<number>`round(avg(${debriefs.overallScore}))::int`,
      unsafe: sql<number>`(count(*) filter (where ${debriefs.unsafeOutcome}))::int`,
    })
    .from(sessions)
    .innerJoin(debriefs, withDebrief)
    .where(and(assessedCalls(actor, period, now), sql`${sessions.practiceScenarioId} is not null`))
    .groupBy(sessions.practiceScenarioId)
    .orderBy(sql`count(*) desc`, sql`2`, sessions.practiceScenarioId);
  return rows.map(r => ({
    ...r,
    passRate: Math.round((r.passed / r.attempts) * 100),
  }));
}

// ---------------------------------------------------------------------------

export const RECENT_UNSAFE_LIMIT = 20;

export type UnsafeCall = {
  sessionId: string;
  startedAt: Date;
  userId: string;
  userName: string;
  title: string;
};

/** The most recent unsafe outcomes in the period (20 at most), newest first. */
export async function listRecentUnsafe(actor: MemberActor, period: Period, now = new Date()): Promise<UnsafeCall[]> {
  assertMember(actor, 'reports.view');
  return getDb()
    .select({
      sessionId: sessions.id,
      startedAt: sessions.startedAt,
      userId: users.id,
      userName: users.name,
      title: sql<string>`${sessions.scenarioSnapshot}->>'title'`,
    })
    .from(sessions)
    .innerJoin(debriefs, withDebrief)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(assessedCalls(actor, period, now), eq(debriefs.unsafeOutcome, true)))
    .orderBy(desc(sessions.startedAt), desc(sessions.id))
    .limit(RECENT_UNSAFE_LIMIT);
}

// ---------------------------------------------------------------------------

export type ExportRow = {
  sessionId: string;
  startedAt: Date;
  name: string;
  email: string;
  title: string;
  difficulty: ScenarioContent['difficulty'];
  /** Whether the scenario was approved when the call was made; false means a draft. */
  approved: boolean;
  durationSeconds: number | null;
  status: SessionStatus;
  score: number;
  outcomeCorrect: boolean;
  unsafeOutcome: boolean;
  redFlagHandled: boolean | null;
  /** null for a call that was too short. */
  rubricScores: RubricScores | null;
};

/** Every assessed call in the period, oldest first, with who made it. For the CSV download. */
export async function listExportRows(actor: MemberActor, period: Period, now = new Date()): Promise<ExportRow[]> {
  assertMember(actor, 'reports.view');
  return getDb()
    .select({
      sessionId: sessions.id,
      startedAt: sessions.startedAt,
      name: users.name,
      email: users.email,
      title: sql<string>`${sessions.scenarioSnapshot}->>'title'`,
      difficulty: sql<ScenarioContent['difficulty']>`${sessions.scenarioSnapshot}->>'difficulty'`,
      approved: sql<boolean>`coalesce((${sessions.scenarioSnapshot}->>'approved')::boolean, false)`,
      durationSeconds: sessions.durationSeconds,
      status: sessions.status,
      score: debriefs.overallScore,
      outcomeCorrect: debriefs.outcomeCorrect,
      unsafeOutcome: debriefs.unsafeOutcome,
      redFlagHandled: debriefs.redFlagHandled,
      rubricScores: debriefs.rubricScores,
    })
    .from(sessions)
    .innerJoin(debriefs, withDebrief)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(assessedCalls(actor, period, now))
    .orderBy(asc(sessions.startedAt), asc(sessions.id));
}
