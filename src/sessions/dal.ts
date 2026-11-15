import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, queryRows } from '@/db/client';
import { debriefs, practiceScenarios, sessions, transcriptTurns, users, type SessionStatus } from '@/db/schema';
import type { Actor, MemberActor } from '@/policy/actor';
import { can } from '@/policy/can';
import { assertMember, fail, isUuid, type Result } from '@/policy/result';
import { callableScenarioWhere } from '@/scenarios/practice-dal';
import { pickContent, type ScenarioSnapshot } from '@/scenarios/types';
import type { QuotedPoint, RubricScores } from '@/debrief/rubric';

// ---------------------------------------------------------------------------
// Limits (design section 7)
// ---------------------------------------------------------------------------

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Calls a user can start per day (Europe/London calendar day), across all their practices. */
export const dailyCallLimit = () => envInt('DAILY_CALL_LIMIT', 25);
/** A call is hung up at this many seconds. */
export const maxCallSeconds = () => envInt('MAX_CALL_SECONDS', 600);
/** Shorter than this, or the trainee never spoke: a fail with a score of 0. */
export const MIN_CALL_SECONDS = 20;
/** Voice tokens per call: the first connection plus two reconnections. */
export const MAX_TOKEN_MINTS = 3;
/** No voice token for a call created longer ago than this. */
export const TOKEN_WINDOW_MINUTES = 60;
/** Debrief runs per call: the automatic one plus two retries. */
export const MAX_DEBRIEF_ATTEMPTS = 3;
/** Total characters of transcript accepted when a call ends. */
export const MAX_TRANSCRIPT_CHARS = 60_000;

/** Midnight at the start of `now`'s day in Europe/London, as an instant. */
export function startOfLondonDay(now: Date): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // London is UTC+0 or UTC+1.
  for (const offset of [0, 3_600_000]) {
    const t = utcMidnight - offset;
    if (clock.format(t) === '00:00' && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(t) === day) return new Date(t);
  }
  return new Date(utcMidnight);
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** The caller's own call in their active practice. */
const ownedBy = (actor: MemberActor): SQL =>
  and(eq(sessions.practiceId, actor.membership.practiceId), eq(sessions.userId, actor.userId))!;

/** Own calls, or every call in the practice for someone with `sessions.viewPractice`. Legacy rows never match. */
const viewableBy = (actor: MemberActor): SQL =>
  can(actor, 'sessions.viewPractice') ? eq(sessions.practiceId, actor.membership.practiceId) : ownedBy(actor);

const NOT_FOUND = 'That call could not be found.';

// ---------------------------------------------------------------------------
// Starting and running a call
// ---------------------------------------------------------------------------

/**
 * Starts a call on a scenario the actor can see, storing the scenario as it is now. Refused when
 * the user has started `DAILY_CALL_LIMIT` calls today; the count and the insert are one statement.
 */
export async function startCall(actor: Actor, practiceScenarioId: string, now = new Date()): Promise<Result<{ sessionId: string }>> {
  assertMember(actor, 'calls.take');
  if (!isUuid(practiceScenarioId)) return fail('not_found', 'That scenario could not be found.');
  const [s] = await getDb()
    .select()
    .from(practiceScenarios)
    .where(and(eq(practiceScenarios.id, practiceScenarioId), callableScenarioWhere(actor)));
  if (!s) return fail('not_found', 'That scenario could not be found.');

  const snapshot: ScenarioSnapshot = {
    ...pickContent(s),
    practiceScenarioId: s.id,
    libraryScenarioId: s.libraryScenarioId,
    revision: s.revision,
    approved: s.approvedRevision === s.revision,
  };
  const limit = dailyCallLimit();
  const [row] = await queryRows<{ id: string }>(sql`
    insert into ${sessions} (practice_id, user_id, practice_scenario_id, scenario_snapshot, started_at, status)
    select ${actor.membership.practiceId}::uuid, ${actor.userId}::uuid, ${s.id}::uuid, ${JSON.stringify(snapshot)}::jsonb,
      ${now.toISOString()}::timestamptz, 'created'
    where (select count(*) from ${sessions}
           where ${sessions.userId} = ${actor.userId} and ${sessions.startedAt} >= ${startOfLondonDay(now).toISOString()}::timestamptz) < ${limit}
    returning id
  `);
  if (!row) {
    const calls = limit === 1 ? '1 call' : `${limit} calls`;
    return fail('limit', `You have started ${calls} today, which is the daily limit. You can practise again tomorrow.`);
  }
  return { ok: true, sessionId: row.id };
}

/**
 * Counts a voice token for the actor's own unfinished call (the first one moves it from `created`
 * to `in_call`) and returns the snapshot to build the caller from. One UPDATE does the check and
 * the count, so at most 3 tokens are ever minted per call, and none once the call has ended or
 * more than 60 minutes after it was created.
 */
export async function claimForToken(actor: Actor, sessionId: string, now = new Date()): Promise<Result<{ snapshot: ScenarioSnapshot }>> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return fail('not_found', NOT_FOUND);
  const createdAfter = new Date(now.getTime() - TOKEN_WINDOW_MINUTES * 60_000);
  const [row] = await getDb()
    .update(sessions)
    .set({ status: 'in_call', tokenMints: sql`${sessions.tokenMints} + 1` })
    .where(
      and(
        eq(sessions.id, sessionId),
        ownedBy(actor),
        inArray(sessions.status, ['created', 'in_call']),
        sql`${sessions.tokenMints} < ${MAX_TOKEN_MINTS}`,
        sql`${sessions.startedAt} > ${createdAfter.toISOString()}::timestamptz`,
      ),
    )
    .returning({ snapshot: sessions.scenarioSnapshot });
  if (row?.snapshot) return { ok: true, snapshot: row.snapshot };
  const [current] = await getDb()
    .select({ status: sessions.status, tokenMints: sessions.tokenMints })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), ownedBy(actor)));
  if (!current) return fail('not_found', NOT_FOUND);
  if (current.status !== 'created' && current.status !== 'in_call') return fail('conflict', 'This call has already ended. Start a new call.');
  if (current.tokenMints >= MAX_TOKEN_MINTS) return fail('conflict', 'This call cannot be reconnected again. Start a new call.');
  return fail('conflict', 'This call was set up more than an hour ago. Start a new call.');
}

export const endCallBodySchema = z
  .object({
    durationSeconds: z.number().min(0).max(3600),
    turns: z
      .array(
        z.object({
          speaker: z.enum(['trainee', 'patient']),
          text: z.string().trim().min(1).max(4000),
        }),
      )
      .max(400),
  })
  .refine(b => b.turns.reduce((n, t) => n + t.text.length, 0) <= MAX_TRANSCRIPT_CHARS, {
    message: `The transcript is longer than ${MAX_TRANSCRIPT_CHARS} characters.`,
    path: ['turns'],
  });
export type EndCallBody = z.infer<typeof endCallBodySchema>;

export type EndCallOutcome = {
  status: SessionStatus;
  /** True when the caller should now run the debrief (`runDebrief(actor, sessionId)`). */
  needsDebrief: boolean;
};

/**
 * Saves the transcript when the actor's own call ends. The call is claimed with one UPDATE so a
 * repeated request cannot save it twice. Only a call that actually connected (`in_call`, i.e. a
 * voice token was minted) can go on to a debrief: ending a call still in `created` records it as
 * too short whatever the body says, and keeps no transcript. A call under 20 seconds, or where the
 * trainee never spoke, is recorded as a fail with a score of 0 and no debrief is run.
 * Audio is never stored.
 */
export async function endCall(actor: Actor, sessionId: string, body: unknown, now = new Date()): Promise<Result<EndCallOutcome>> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return fail('not_found', NOT_FOUND);
  const parsed = endCallBodySchema.safeParse(body);
  if (!parsed.success) return fail('invalid', 'The call could not be saved because the transcript was not valid.');
  const { turns } = parsed.data;
  const db = getDb();

  const [current] = await db
    .select({ status: sessions.status, startedAt: sessions.startedAt })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), ownedBy(actor)));
  if (!current) return fail('not_found', NOT_FOUND);

  // The browser's clock is not trusted beyond the time the session has existed.
  const sinceStart = Math.max(0, (now.getTime() - current.startedAt.getTime()) / 1000);
  if (current.status !== 'created' && current.status !== 'in_call') return { ok: true, status: current.status, needsDebrief: false };
  const connected = current.status === 'in_call';
  const durationSeconds = connected ? Math.round(Math.min(parsed.data.durationSeconds, sinceStart)) : 0;
  const tooShort = !connected || durationSeconds < MIN_CALL_SECONDS || !turns.some(t => t.speaker === 'trainee');
  const status: SessionStatus = tooShort ? 'too_short' : 'debriefing';

  // Claimed only from the status read above, so a token minted in between cannot be skipped over.
  const [claimed] = await db
    .update(sessions)
    .set({ status, endedAt: now, durationSeconds, ...(tooShort ? {} : { debriefAttempts: 1 }) })
    .where(and(eq(sessions.id, sessionId), ownedBy(actor), eq(sessions.status, current.status)))
    .returning({ id: sessions.id });
  if (!claimed) {
    const [after] = await db.select({ status: sessions.status }).from(sessions).where(and(eq(sessions.id, sessionId), ownedBy(actor)));
    return { ok: true, status: after?.status ?? current.status, needsDebrief: false };
  }

  if (connected && turns.length > 0) {
    await db.insert(transcriptTurns).values(turns.map((t, i) => ({ sessionId, speaker: t.speaker, text: t.text, sequence: i })));
  }
  if (tooShort) {
    await db
      .insert(debriefs)
      .values({
        sessionId,
        overallScore: 0,
        outcomeCorrect: false,
        unsafeOutcome: false,
        redFlagHandled: null,
        rubricScores: null,
        strengths: [],
        improvements: [],
        quotedMoments: [],
        modelUsed: 'none (call too short)',
        promptVersion: null,
      })
      .onConflictDoNothing({ target: debriefs.sessionId });
    return { ok: true, status, needsDebrief: false };
  }
  return { ok: true, status, needsDebrief: true };
}

// ---------------------------------------------------------------------------
// Reading calls
// ---------------------------------------------------------------------------

export type CallSession = {
  id: string;
  userId: string;
  userName: string;
  /** The actor made this call (rather than viewing it as a manager). */
  isOwn: boolean;
  practiceScenarioId: string | null;
  scenario: ScenarioSnapshot;
  status: SessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  /** How many more times a failed debrief can be tried again (0 once used up). */
  debriefRetriesLeft: number;
};

/** A call the actor made, or any call in their practice for a manager. Null otherwise. */
export async function getSession(actor: Actor, sessionId: string): Promise<CallSession | null> {
  assertMember(actor, 'sessions.viewOwn');
  if (!isUuid(sessionId)) return null;
  const [row] = await getDb()
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userName: users.name,
      practiceScenarioId: sessions.practiceScenarioId,
      scenario: sessions.scenarioSnapshot,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      durationSeconds: sessions.durationSeconds,
      debriefAttempts: sessions.debriefAttempts,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), viewableBy(actor)));
  if (!row || !row.userId || !row.scenario) return null;
  const { debriefAttempts, ...rest } = row;
  return {
    ...rest,
    userId: row.userId,
    scenario: row.scenario,
    isOwn: row.userId === actor.userId,
    debriefRetriesLeft: Math.max(0, MAX_DEBRIEF_ATTEMPTS - debriefAttempts),
  };
}

export type SessionListItem = {
  id: string;
  userId: string;
  userName: string;
  title: string;
  startedAt: Date;
  durationSeconds: number | null;
  status: SessionStatus;
  score: number | null;
  unsafe: boolean | null;
};

async function listSessions(where: SQL, limit: number): Promise<SessionListItem[]> {
  const rows = await getDb()
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userName: users.name,
      title: sql<string>`${sessions.scenarioSnapshot}->>'title'`,
      startedAt: sessions.startedAt,
      durationSeconds: sessions.durationSeconds,
      status: sessions.status,
      score: debriefs.overallScore,
      unsafe: debriefs.unsafeOutcome,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(debriefs, eq(debriefs.sessionId, sessions.id))
    .where(where)
    .orderBy(desc(sessions.startedAt))
    .limit(Math.min(Math.max(1, Math.floor(limit)), 500));
  return rows.map(r => ({ ...r, userId: r.userId! }));
}

/** The actor's own calls in their active practice, newest first. */
export async function listOwnSessions(actor: Actor, limit = 200): Promise<SessionListItem[]> {
  assertMember(actor, 'sessions.viewOwn');
  return listSessions(ownedBy(actor), limit);
}

/** Manager: calls in the practice, optionally one person's, newest first. */
export async function listPracticeSessions(actor: Actor, opts: { userId?: string; limit?: number } = {}): Promise<SessionListItem[]> {
  assertMember(actor, 'sessions.viewPractice');
  if (opts.userId !== undefined && !isUuid(opts.userId)) return [];
  return listSessions(
    and(eq(sessions.practiceId, actor.membership.practiceId), opts.userId ? eq(sessions.userId, opts.userId) : undefined)!,
    opts.limit ?? 200,
  );
}

export type Turn = { speaker: 'trainee' | 'patient'; text: string; sequence: number };

/** The transcript of a call the actor may view (see getSession). Null if they may not. */
export async function getTurns(actor: Actor, sessionId: string): Promise<Turn[] | null> {
  assertMember(actor, 'sessions.viewOwn');
  if (!isUuid(sessionId)) return null;
  const [visible] = await getDb().select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), viewableBy(actor)));
  if (!visible) return null;
  return getDb()
    .select({ speaker: transcriptTurns.speaker, text: transcriptTurns.text, sequence: transcriptTurns.sequence })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.sequence));
}

export type Debrief = typeof debriefs.$inferSelect;

/** The debrief of a call the actor may view, or null (none yet, or not theirs to see). */
export async function getDebrief(actor: Actor, sessionId: string): Promise<Debrief | null> {
  assertMember(actor, 'sessions.viewOwn');
  if (!isUuid(sessionId)) return null;
  const [row] = await getDb()
    .select({ d: debriefs })
    .from(debriefs)
    .innerJoin(sessions, eq(sessions.id, debriefs.sessionId))
    .where(and(eq(debriefs.sessionId, sessionId), viewableBy(actor)));
  return row?.d ?? null;
}

// ---------------------------------------------------------------------------
// Debrief bookkeeping (used by src/debrief/run.ts; the caller's own call only)
// ---------------------------------------------------------------------------

/** What the assessor needs: the snapshot and transcript of the actor's own call awaiting a debrief. */
export async function getDebriefInput(actor: Actor, sessionId: string): Promise<{ scenario: ScenarioSnapshot; turns: Turn[] } | null> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return null;
  const [row] = await getDb()
    .select({ scenario: sessions.scenarioSnapshot })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), ownedBy(actor), eq(sessions.status, 'debriefing')));
  if (!row?.scenario) return null;
  const turns = await getDb()
    .select({ speaker: transcriptTurns.speaker, text: transcriptTurns.text, sequence: transcriptTurns.sequence })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.sequence));
  return { scenario: row.scenario, turns };
}

export type DebriefValues = {
  overallScore: number;
  outcomeCorrect: boolean;
  unsafeOutcome: boolean;
  redFlagHandled: boolean | null;
  rubricScores: RubricScores;
  strengths: QuotedPoint[];
  improvements: QuotedPoint[];
  quotedMoments: string[];
  modelUsed: string;
  promptVersion: string;
};

/** Stores the debrief for the actor's own call and marks it complete. A second save is ignored. */
export async function saveDebrief(actor: Actor, sessionId: string, values: DebriefValues): Promise<boolean> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return false;
  const [mine] = await getDb().select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), ownedBy(actor)));
  if (!mine) return false;
  await getDb().insert(debriefs).values({ sessionId, ...values }).onConflictDoNothing({ target: debriefs.sessionId });
  await getDb()
    .update(sessions)
    .set({ status: 'complete' })
    .where(and(eq(sessions.id, sessionId), ownedBy(actor), eq(sessions.status, 'debriefing')));
  return true;
}

export async function markDebriefFailed(actor: Actor, sessionId: string): Promise<void> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return;
  await getDb()
    .update(sessions)
    .set({ status: 'failed' })
    .where(and(eq(sessions.id, sessionId), ownedBy(actor), eq(sessions.status, 'debriefing')));
}

/**
 * Moves the actor's own failed debrief back to "debriefing" so it can be tried again, at most
 * twice after the automatic run (`MAX_DEBRIEF_ATTEMPTS` in all). True if claimed.
 */
export async function claimDebriefRetry(actor: Actor, sessionId: string): Promise<boolean> {
  assertMember(actor, 'calls.take');
  if (!isUuid(sessionId)) return false;
  const rows = await getDb()
    .update(sessions)
    .set({ status: 'debriefing', debriefAttempts: sql`${sessions.debriefAttempts} + 1` })
    .where(
      and(
        eq(sessions.id, sessionId),
        ownedBy(actor),
        eq(sessions.status, 'failed'),
        sql`${sessions.debriefAttempts} < ${MAX_DEBRIEF_ATTEMPTS}`,
      ),
    )
    .returning({ id: sessions.id });
  return rows.length === 1;
}
