import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { debriefs, practices, sessions, transcriptTurns } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement, updateScenario } from '@/scenarios/practice-dal';
import { pickContent } from '@/scenarios/types';
import { createTestDb } from '@/test/db';
import { addMember, deactivate, makePractice, platformAdmin, seedLibrary, suspend } from '@/test/fixtures';
import { loadActor } from '@/auth/sessions';
import {
  MIN_CALL_SECONDS,
  claimDebriefRetry,
  claimForToken,
  endCall,
  getDebrief,
  getDebriefInput,
  getSession,
  getTurns,
  listOwnSessions,
  listPracticeSessions,
  startCall,
  startOfLondonDay,
} from './dal';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});
afterEach(() => {
  delete process.env.DAILY_CALL_LIMIT;
  delete process.env.MAX_CALL_SECONDS;
});

/** A practice with an approved scenario, a trainee and a manager. */
async function setup() {
  const p = await makePractice();
  const approver = await addMember(p.practiceId, 'trainee', true);
  const trainee = await addMember(p.practiceId, 'trainee', false, 'Trainee One');
  const all = await listScenariosForManagement(p.manager.actor);
  const approved = all.find(s => s.libraryScenarioId === 'angina-repeat')!;
  const draft = all.find(s => s.libraryScenarioId === 'sore-throat')!;
  await approveScenario(approver.actor, approved.id, 1);
  return { ...p, approver, trainee, approved, draft };
}

const goodBody = {
  durationSeconds: 95,
  turns: [
    { speaker: 'patient', text: 'Hello, I need my prescription.' },
    { speaker: 'trainee', text: 'Of course, what is your name please?' },
  ],
};

async function startedCall(actor: Parameters<typeof startCall>[0], scenarioId: string, startedSecondsAgo = 120) {
  const r = await startCall(actor, scenarioId, new Date(Date.now() - startedSecondsAgo * 1000));
  if (!r.ok) throw new Error(r.error);
  return r.sessionId;
}

describe('startCall', () => {
  it('stores a snapshot of the scenario as it is now', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    const s = await getSession(trainee.actor, id);
    expect(s).toMatchObject({ status: 'created', isOwn: true, practiceScenarioId: approved.id });
    expect(s!.scenario).toMatchObject({ practiceScenarioId: approved.id, libraryScenarioId: 'angina-repeat', revision: 1, approved: true });
    expect(s!.scenario.correctOutcome.length).toBeGreaterThan(0);
  });

  it('enforces scenario visibility: a trainee cannot start a draft, a manager or approver can', async () => {
    const { trainee, approver, manager, draft } = await setup();
    expect(await startCall(trainee.actor, draft.id)).toMatchObject({ ok: false, code: 'not_found' });
    expect((await startCall(approver.actor, draft.id)).ok).toBe(true);
    expect((await startCall(manager.actor, draft.id)).ok).toBe(true);
  });

  it('refuses a scenario from another practice, and needs calls.take', async () => {
    const mine = await setup();
    const theirs = await setup();
    expect(await startCall(mine.manager.actor, theirs.approved.id)).toMatchObject({ ok: false, code: 'not_found' });
    await expect(startCall(await platformAdmin(), mine.approved.id)).rejects.toThrow(ForbiddenError);
  });

  it('a deactivated member or a suspended practice cannot start calls (the actor has no membership)', async () => {
    const { practiceId, trainee, manager, approved } = await setup();
    await deactivate(practiceId, trainee.user.id);
    const deactivated = (await loadActor(trainee.token))!;
    await expect(startCall(deactivated, approved.id)).rejects.toThrow(ForbiddenError);
    await suspend(practiceId);
    const suspended = (await loadActor(manager.token))!;
    await expect(startCall(suspended, approved.id)).rejects.toThrow(ForbiddenError);
  });

  it('enforces the daily call limit per user, by London calendar day', async () => {
    process.env.DAILY_CALL_LIMIT = '3';
    const { trainee, manager, approved } = await setup();
    const day = new Date('2026-07-01T10:00:00Z');
    for (let i = 0; i < 3; i++) expect((await startCall(trainee.actor, approved.id, day)).ok).toBe(true);
    const refused = await startCall(trainee.actor, approved.id, day);
    expect(refused).toMatchObject({ ok: false, code: 'limit' });
    if (!refused.ok) expect(refused.error).toContain('3 calls today');
    // Someone else is unaffected.
    expect((await startCall(manager.actor, approved.id, day)).ok).toBe(true);
    // 23:30 UTC on 1 July is 00:30 on 2 July in London (BST): a new day.
    expect((await startCall(trainee.actor, approved.id, new Date('2026-07-01T23:30:00Z'))).ok).toBe(true);
  });

  it('London day boundaries are right in winter and summer', () => {
    expect(startOfLondonDay(new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(startOfLondonDay(new Date('2026-07-15T12:00:00Z')).toISOString()).toBe('2026-07-14T23:00:00.000Z');
    expect(startOfLondonDay(new Date('2026-07-14T23:30:00Z')).toISOString()).toBe('2026-07-14T23:00:00.000Z');
    // The day the clocks go forward (29 March 2026): midnight was still GMT.
    expect(startOfLondonDay(new Date('2026-03-29T15:00:00Z')).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    // The day the clocks go back (25 October 2026): midnight was BST.
    expect(startOfLondonDay(new Date('2026-10-25T15:00:00Z')).toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});

describe('claimForToken', () => {
  it('works for the caller on an unfinished call, and not after it ends', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    const r = await claimForToken(trainee.actor, id);
    expect(r.ok && r.snapshot.practiceScenarioId).toBe(approved.id);
    expect((await getSession(trainee.actor, id))?.status).toBe('in_call');
    await endCall(trainee.actor, id, goodBody);
    expect(await claimForToken(trainee.actor, id)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('is refused once the call has run past the maximum length', async () => {
    process.env.MAX_CALL_SECONDS = '60';
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id, 120);
    expect(await claimForToken(trainee.actor, id)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it("is refused for someone else's call, even a manager's", async () => {
    const { trainee, manager, approved } = await setup();
    const other = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    expect(await claimForToken(manager.actor, id)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await claimForToken(other.manager.actor, id)).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('endCall', () => {
  it('saves the transcript and asks for a debrief', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    expect(await endCall(trainee.actor, id, goodBody)).toEqual({ ok: true, status: 'debriefing', needsDebrief: true });
    expect((await getTurns(trainee.actor, id))!.map(t => t.speaker)).toEqual(['patient', 'trainee']);
    const s = await getSession(trainee.actor, id);
    expect(s).toMatchObject({ status: 'debriefing', durationSeconds: 95 });
  });

  it('a call under 20 seconds is a fail with a score of 0 and no debrief run', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    expect(await endCall(trainee.actor, id, { ...goodBody, durationSeconds: MIN_CALL_SECONDS - 1 })).toEqual({
      ok: true,
      status: 'too_short',
      needsDebrief: false,
    });
    expect(await getDebrief(trainee.actor, id)).toMatchObject({ overallScore: 0, outcomeCorrect: false, rubricScores: null, promptVersion: null });
  });

  it('a call where the trainee never spoke is a fail with a score of 0', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    const r = await endCall(trainee.actor, id, { durationSeconds: 300, turns: [{ speaker: 'patient', text: 'Hello? Hello?' }] });
    expect(r).toEqual({ ok: true, status: 'too_short', needsDebrief: false });
    expect((await getDebrief(trainee.actor, id))?.overallScore).toBe(0);
  });

  it('does not trust the browser clock beyond the time since the call started', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id, 10);
    expect(await endCall(trainee.actor, id, { ...goodBody, durationSeconds: 600 })).toMatchObject({ status: 'too_short' });
    expect((await getSession(trainee.actor, id))!.durationSeconds).toBeLessThanOrEqual(11);
  });

  it('a repeated end saves nothing twice', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    await endCall(trainee.actor, id, goodBody);
    expect(await endCall(trainee.actor, id, goodBody)).toEqual({ ok: true, status: 'debriefing', needsDebrief: false });
    expect(await getDb().select().from(transcriptTurns).where(eq(transcriptTurns.sessionId, id))).toHaveLength(2);
  });

  it("cannot end someone else's call, in this practice or another", async () => {
    const { trainee, manager, approved } = await setup();
    const other = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    expect(await endCall(manager.actor, id, goodBody)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await endCall(other.trainee.actor, id, goodBody)).toMatchObject({ ok: false, code: 'not_found' });
    expect((await getSession(trainee.actor, id))?.status).toBe('created');
  });

  it('rejects an invalid body', async () => {
    const { trainee, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    expect(await endCall(trainee.actor, id, { durationSeconds: -1, turns: [] })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await endCall(trainee.actor, id, null)).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('reading calls', () => {
  it('a trainee sees only their own calls; a manager sees every call in the practice', async () => {
    const { trainee, approver, manager, approved } = await setup();
    const mine = await startedCall(trainee.actor, approved.id);
    const theirs = await startedCall(approver.actor, approved.id);
    await endCall(trainee.actor, mine, goodBody);

    expect((await listOwnSessions(trainee.actor)).map(s => s.id)).toEqual([mine]);
    expect(await getSession(trainee.actor, theirs)).toBeNull();
    expect(await getTurns(trainee.actor, theirs)).toBeNull();

    const asManager = await getSession(manager.actor, mine);
    expect(asManager).toMatchObject({ isOwn: false, userName: 'Trainee One' });
    expect(await getTurns(manager.actor, mine)).toHaveLength(2);
    expect((await listPracticeSessions(manager.actor)).map(s => s.id).sort()).toEqual([mine, theirs].sort());
    expect((await listPracticeSessions(manager.actor, { userId: trainee.user.id })).map(s => s.id)).toEqual([mine]);
    expect((await listOwnSessions(trainee.actor))[0]).toMatchObject({ title: approved.title, status: 'debriefing', score: null });
    await expect(listPracticeSessions(trainee.actor)).rejects.toThrow(ForbiddenError);
  });

  it("a manager of another practice cannot read this practice's calls, transcripts or debriefs", async () => {
    const mine = await setup();
    const theirs = await setup();
    const id = await startedCall(mine.trainee.actor, mine.approved.id);
    await endCall(mine.trainee.actor, id, { ...goodBody, durationSeconds: 5 });
    expect(await getDebrief(mine.trainee.actor, id)).not.toBeNull();
    expect(await getSession(theirs.manager.actor, id)).toBeNull();
    expect(await getTurns(theirs.manager.actor, id)).toBeNull();
    expect(await getDebrief(theirs.manager.actor, id)).toBeNull();
    expect(await listPracticeSessions(theirs.manager.actor, { userId: mine.trainee.user.id })).toEqual([]);
  });

  it('calls stay in the practice they were made in when the user switches practice', async () => {
    const a = await setup();
    const id = await startedCall(a.trainee.actor, a.approved.id);
    const b = await makePractice();
    const elsewhere = { ...a.trainee.actor, membership: { ...a.trainee.actor.membership!, practiceId: b.practiceId } };
    expect(await getSession(elsewhere, id)).toBeNull();
    expect(await listOwnSessions(elsewhere)).toEqual([]);
  });

  it('legacy PoC rows (no practice) are never shown', async () => {
    const { manager } = await setup();
    const [legacy] = await getDb().insert(sessions).values({ traineeName: 'Old Name', scenarioId: 'sore-throat' }).returning();
    expect(await getSession(manager.actor, legacy.id)).toBeNull();
    expect((await listPracticeSessions(manager.actor)).map(s => s.id)).not.toContain(legacy.id);
  });

  it('malformed ids are simply not found', async () => {
    const { trainee } = await setup();
    expect(await getSession(trainee.actor, 'nope')).toBeNull();
    expect(await getTurns(trainee.actor, "1' or '1'='1")).toBeNull();
    expect(await getDebrief(trainee.actor, '')).toBeNull();
  });
});

describe('snapshots and debrief bookkeeping', () => {
  it('editing the scenario after the call does not change what the call is judged against', async () => {
    const { trainee, manager, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    await endCall(trainee.actor, id, goodBody);
    const lib = (await import('@/scenarios/seed')).scenarios.find(s => s.id === 'angina-repeat')!;
    await updateScenario(manager.actor, approved.id, { ...pickContent(lib), correctOutcome: 'Something new' });
    const input = await getDebriefInput(trainee.actor, id);
    expect(input?.scenario.correctOutcome).toBe(lib.correctOutcome);
    expect(input?.scenario.revision).toBe(1);
    expect(input?.turns).toHaveLength(2);
  });

  it('only the caller can retry a failed debrief', async () => {
    const { trainee, manager, approved } = await setup();
    const id = await startedCall(trainee.actor, approved.id);
    await endCall(trainee.actor, id, goodBody);
    await getDb().update(sessions).set({ status: 'failed' }).where(eq(sessions.id, id));
    expect(await claimDebriefRetry(manager.actor, id)).toBe(false);
    expect(await claimDebriefRetry(trainee.actor, id)).toBe(true);
    expect(await claimDebriefRetry(trainee.actor, id)).toBe(false);
    expect(await getDb().select().from(debriefs).where(eq(debriefs.sessionId, id))).toHaveLength(0);
  });

  it('a practice that allows drafts lets trainees call drafts, recorded as unapproved', async () => {
    const { practiceId, trainee, draft } = await setup();
    await getDb().update(practices).set({ allowDraftScenarios: true }).where(eq(practices.id, practiceId));
    const id = await startedCall(trainee.actor, draft.id);
    expect((await getSession(trainee.actor, id))?.scenario.approved).toBe(false);
  });
});
