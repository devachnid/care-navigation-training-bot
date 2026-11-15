import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, debriefFlags, debriefs, sessions, transcriptTurns } from '@/db/schema';
import { flagDebrief } from '@/debrief/flags-dal';
import { updatePracticeSettings } from '@/practices/dal';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, seedLibrary } from '@/test/fixtures';
import { claimForToken, endCall, getDebrief, getSession, getTurns, saveDebrief, startCall, type DebriefValues } from './dal';
import { deleteExpiredTranscripts } from './retention-dal';

const DAY = 86_400_000;
const NOW = new Date('2026-11-15T12:00:00Z');
const daysBefore = (n: number, extraMs = 0) => new Date(NOW.getTime() - n * DAY - extraMs);

const SCORES = {
  greeting: { score: 2, justification: 'Warm opening.' },
  information: { score: 1, justification: 'Asked some questions.' },
  redFlag: null,
  destination: { score: 2, justification: 'Right place.' },
  role: { score: 1, justification: 'ok' },
  explanation: { score: 1, justification: 'ok' },
  manner: { score: 2, justification: 'Calm.' },
};

const verdict: DebriefValues = {
  overallScore: 72,
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: null,
  rubricScores: SCORES,
  strengths: [{ point: 'Friendly', quote: 'Good morning, how can I help?' }],
  improvements: [{ point: 'Ask more', quote: 'Right.' }],
  quotedMoments: ['Good morning, how can I help?'],
  modelUsed: 'test',
  promptVersion: 'test',
};

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

async function setup(retentionDays: number | null) {
  const p = await makePractice();
  const trainee = await addMember(p.practiceId, 'trainee', false, 'Trainee One');
  const scenario = (await listScenariosForManagement(p.manager.actor))[0];
  await approveScenario((await addMember(p.practiceId, 'trainee', true)).actor, scenario.id, 1);
  if (retentionDays !== null) {
    const r = await updatePracticeSettings(p.manager.actor, { transcriptRetentionDays: retentionDays });
    if (!r.ok) throw new Error(r.error);
  }
  return { ...p, trainee, scenarioId: scenario.id };
}

/** A finished, debriefed call that ended `endedDaysAgo` days before NOW. */
async function call(s: Awaited<ReturnType<typeof setup>>, endedDaysAgo: number, endedExtraMs = 0) {
  const ended = daysBefore(endedDaysAgo, endedExtraMs);
  const started = new Date(ended.getTime() - 120_000);
  const r = await startCall(s.trainee.actor, s.scenarioId, started);
  if (!r.ok) throw new Error(r.error);
  await claimForToken(s.trainee.actor, r.sessionId, started);
  const e = await endCall(
    s.trainee.actor,
    r.sessionId,
    {
      durationSeconds: 100,
      turns: [
        { speaker: 'patient', text: 'Hello.' },
        { speaker: 'trainee', text: 'Good morning, how can I help?' },
      ],
    },
    ended,
  );
  if (!e.ok) throw new Error(e.error);
  await saveDebrief(s.trainee.actor, r.sessionId, verdict);
  await flagDebrief(s.trainee.actor, r.sessionId, 'This is wrong');
  return r.sessionId;
}

const turnCount = async (id: string) => (await getDb().select().from(transcriptTurns).where(eq(transcriptTurns.sessionId, id))).length;
const flagCount = async (id: string) => (await getDb().select().from(debriefFlags).where(eq(debriefFlags.sessionId, id))).length;
const expiredAudit = async (practiceId: string) =>
  (await getDb().select().from(auditLog).where(eq(auditLog.practiceId, practiceId))).filter(a => a.action === 'transcripts.expired');

describe('deleteExpiredTranscripts', () => {
  it('clears the transcript, quotes and reports of an expired call but keeps the scores', async () => {
    const s = await setup(90);
    const old = await call(s, 100);
    const recent = await call(s, 80);
    expect(await turnCount(old)).toBe(2);
    expect(await flagCount(old)).toBe(1);

    const result = await deleteExpiredTranscripts(NOW);
    expect(result.sessions).toBeGreaterThanOrEqual(1);

    expect(await turnCount(old)).toBe(0);
    expect(await flagCount(old)).toBe(0);
    const d = await getDebrief(s.trainee.actor, old);
    expect(d).toMatchObject({ overallScore: 72, outcomeCorrect: true, unsafeOutcome: false, rubricScores: SCORES });
    expect(d!.strengths).toEqual([]);
    expect(d!.improvements).toEqual([]);
    expect(d!.quotedMoments).toEqual([]);
    expect(await getTurns(s.trainee.actor, old)).toEqual([]);
    const marked = await getSession(s.trainee.actor, old);
    expect(marked!.transcriptDeletedAt).toEqual(NOW);
    expect(marked!.retentionDays).toBe(90);

    // The newer call is untouched.
    expect(await turnCount(recent)).toBe(2);
    expect(await flagCount(recent)).toBe(1);
    expect((await getDebrief(s.trainee.actor, recent))!.strengths).toHaveLength(1);
    expect((await getSession(s.trainee.actor, recent))!.transcriptDeletedAt).toBeNull();
  });

  it('writes one audit entry per practice with the count, and a second run changes nothing', async () => {
    const s = await setup(30);
    await call(s, 40);
    await call(s, 50);
    await deleteExpiredTranscripts(NOW);
    const entries = await expiredAudit(s.practiceId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: null, targetType: 'practice', targetId: s.practiceId, detail: { sessions: 2, retentionDays: 30 } });

    expect(await deleteExpiredTranscripts(NOW)).toEqual({ sessions: 0 });
    expect(await expiredAudit(s.practiceId)).toHaveLength(1);
  });

  it('keeps a call that ended exactly the retention period ago, and deletes one a moment older', async () => {
    const s = await setup(90);
    const exactly = await call(s, 90);
    const justOver = await call(s, 90, 1000);
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(exactly)).toBe(2);
    expect(await turnCount(justOver)).toBe(0);
  });

  it('never touches a practice that keeps transcripts', async () => {
    const s = await setup(null);
    const id = await call(s, 1000);
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(id)).toBe(2);
    expect((await getSession(s.trainee.actor, id))!.transcriptDeletedAt).toBeNull();
    expect(await expiredAudit(s.practiceId)).toHaveLength(0);
  });

  it('uses each practice\'s own period', async () => {
    const a = await setup(90);
    const b = await setup(365);
    const inA = await call(a, 120);
    const inB = await call(b, 120);
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(inA)).toBe(0);
    expect(await turnCount(inB)).toBe(2);
    expect((await expiredAudit(b.practiceId)).length).toBe(0);
  });

  it('leaves calls still in progress alone', async () => {
    const s = await setup(30);
    const started = daysBefore(100);
    const r = await startCall(s.trainee.actor, s.scenarioId, started);
    if (!r.ok) throw new Error(r.error);
    await claimForToken(s.trainee.actor, r.sessionId, started);
    // A call stuck waiting for its debrief has a transcript too.
    await getDb().insert(transcriptTurns).values({ sessionId: r.sessionId, speaker: 'trainee', text: 'Hello', sequence: 0 });
    await getDb().update(sessions).set({ endedAt: daysBefore(99), status: 'debriefing' }).where(eq(sessions.id, r.sessionId));
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(r.sessionId)).toBe(1);
    await getDb().update(sessions).set({ endedAt: null, status: 'in_call' }).where(eq(sessions.id, r.sessionId));
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(r.sessionId)).toBe(1);
  });

  it('leaves legacy calls with no practice alone', async () => {
    const [legacy] = await getDb()
      .insert(sessions)
      .values({ traineeName: 'Old', startedAt: daysBefore(2000), endedAt: daysBefore(2000), status: 'complete' })
      .returning({ id: sessions.id });
    await getDb().insert(transcriptTurns).values({ sessionId: legacy.id, speaker: 'trainee', text: 'Old call', sequence: 0 });
    await getDb().insert(debriefs).values({ sessionId: legacy.id, ...verdict });
    await deleteExpiredTranscripts(NOW);
    expect(await turnCount(legacy.id)).toBe(1);
    const [d] = await getDb().select().from(debriefs).where(eq(debriefs.sessionId, legacy.id));
    expect(d.strengths).toHaveLength(1);
  });

  it('finishes a half-done run when it is run again', async () => {
    const s = await setup(30);
    const id = await call(s, 60);
    // As if a run stopped after deleting the turns but before the rest.
    await getDb().delete(transcriptTurns).where(eq(transcriptTurns.sessionId, id));
    expect((await getDebrief(s.trainee.actor, id))!.strengths).toHaveLength(1);
    await deleteExpiredTranscripts(NOW);
    expect((await getDebrief(s.trainee.actor, id))!.strengths).toEqual([]);
    expect(await flagCount(id)).toBe(0);
    expect((await getSession(s.trainee.actor, id))!.transcriptDeletedAt).not.toBeNull();
  });

  it("does not show another practice's deleted note to this practice's people", async () => {
    const a = await setup(30);
    const b = await setup(null);
    const id = await call(a, 60);
    await deleteExpiredTranscripts(NOW);
    expect(await getSession(b.trainee.actor, id)).toBeNull();
    expect(await getSession(b.manager.actor, id)).toBeNull();
  });
});
