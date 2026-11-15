import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { memberships } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { endCall, saveDebrief, startCall, type DebriefValues } from '@/sessions/dal';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, makeUser, seedLibrary, signedIn } from '@/test/fixtures';
import { listMemberProgress, listTeamStats } from './team-dal';

const ITEM = { score: 1, justification: 'ok' };
const RUBRIC_SCORES = { greeting: ITEM, information: ITEM, redFlag: null, destination: ITEM, role: ITEM, explanation: ITEM, manner: ITEM };

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

const verdict = (over: Partial<DebriefValues>): DebriefValues => ({
  overallScore: 70,
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: null,
  rubricScores: RUBRIC_SCORES,
  strengths: [],
  improvements: [],
  quotedMoments: [],
  modelUsed: 'test',
  promptVersion: 'test',
  ...over,
});

async function assessedCall(actor: Parameters<typeof startCall>[0], scenarioId: string, minutesAgo: number, over: Partial<DebriefValues> = {}) {
  const started = await startCall(actor, scenarioId, new Date(Date.now() - minutesAgo * 60_000));
  if (!started.ok) throw new Error(started.error);
  await endCall(actor, started.sessionId, {
    durationSeconds: 100,
    turns: [
      { speaker: 'patient', text: 'Hello.' },
      { speaker: 'trainee', text: 'Good morning, how can I help?' },
    ],
  });
  await saveDebrief(actor, started.sessionId, verdict(over));
  return started.sessionId;
}

async function setup() {
  const p = await makePractice();
  const approver = await addMember(p.practiceId, 'trainee', true);
  const trainee = await addMember(p.practiceId, 'trainee', false, 'Trainee One');
  const quiet = await addMember(p.practiceId, 'trainee', false, 'Quiet Person');
  const all = await listScenariosForManagement(p.manager.actor);
  const a = all.find(s => s.libraryScenarioId === 'angina-repeat')!;
  const b = all.find(s => s.libraryScenarioId === 'sore-throat')!;
  await approveScenario(approver.actor, a.id, 1);
  await approveScenario(approver.actor, b.id, 1);
  return { ...p, approver, trainee, quiet, a, b };
}

describe('listTeamStats', () => {
  it('has a row for everyone in the practice, with zeros for people who have made no calls', async () => {
    const { manager, trainee, quiet } = await setup();
    const stats = await listTeamStats(manager.actor);
    expect(stats).toHaveLength(4);
    expect(stats.find(s => s.userId === quiet.user.id)).toEqual({
      userId: quiet.user.id,
      calls: 0,
      lastCallAt: null,
      averageScore: null,
      unsafeOutcomes: 0,
    });
    expect(stats.find(s => s.userId === trainee.user.id)?.calls).toBe(0);
  });

  it('counts assessed calls, averages the score, finds the last call and counts unsafe outcomes', async () => {
    const { manager, trainee, a, b } = await setup();
    await assessedCall(trainee.actor, a.id, 60, { overallScore: 40, outcomeCorrect: false });
    await assessedCall(trainee.actor, a.id, 30, { overallScore: 90 });
    const last = await assessedCall(trainee.actor, b.id, 10, { overallScore: 20, outcomeCorrect: false, unsafeOutcome: true });
    expect(last).toBeTruthy();
    const row = (await listTeamStats(manager.actor)).find(s => s.userId === trainee.user.id)!;
    expect(row.calls).toBe(3);
    expect(row.averageScore).toBe(50);
    expect(row.unsafeOutcomes).toBe(1);
    expect(row.lastCallAt).toBeInstanceOf(Date);
    expect(Date.now() - row.lastCallAt!.getTime()).toBeLessThan(11 * 60_000);
    expect(Date.now() - row.lastCallAt!.getTime()).toBeGreaterThan(9 * 60_000);
  });

  it('does not count a call that was started but never assessed', async () => {
    const { manager, trainee, a } = await setup();
    await assessedCall(trainee.actor, a.id, 30, { overallScore: 80 });
    await startCall(trainee.actor, a.id);
    const row = (await listTeamStats(manager.actor)).find(s => s.userId === trainee.user.id)!;
    expect(row.calls).toBe(1);
    expect(Date.now() - row.lastCallAt!.getTime()).toBeGreaterThan(29 * 60_000);
  });

  it('counts only calls made in this practice, for someone who belongs to two', async () => {
    const one = await setup();
    const two = await setup();
    const floater = await makeUser({ name: 'Floater' });
    await getDb()
      .insert(memberships)
      .values([
        { practiceId: one.practiceId, userId: floater.id, role: 'trainee' },
        { practiceId: two.practiceId, userId: floater.id, role: 'trainee' },
      ]);
    const inOne = (await signedIn(floater.id, one.practiceId)).actor;
    const inTwo = (await signedIn(floater.id, two.practiceId)).actor;
    await assessedCall(inOne, one.a.id, 10, { overallScore: 60 });
    await assessedCall(inTwo, two.a.id, 10, { overallScore: 100 });
    await assessedCall(inTwo, two.a.id, 20, { overallScore: 100 });
    const mineOne = (await listTeamStats(one.manager.actor)).find(s => s.userId === floater.id)!;
    const mineTwo = (await listTeamStats(two.manager.actor)).find(s => s.userId === floater.id)!;
    expect([mineOne.calls, mineOne.averageScore]).toEqual([1, 60]);
    expect([mineTwo.calls, mineTwo.averageScore]).toEqual([2, 100]);
  });

  it("never lists another practice's people or calls", async () => {
    const mine = await setup();
    const theirs = await setup();
    await assessedCall(theirs.trainee.actor, theirs.a.id, 10, { overallScore: 100 });
    const stats = await listTeamStats(mine.manager.actor);
    expect(stats.map(s => s.userId)).not.toContain(theirs.trainee.user.id);
    expect(stats.every(s => s.calls === 0)).toBe(true);
  });

  it('is for managers only', async () => {
    const { trainee, approver } = await setup();
    await expect(listTeamStats(trainee.actor)).rejects.toThrow(ForbiddenError);
    await expect(listTeamStats(approver.actor)).rejects.toThrow(ForbiddenError);
  });
});

describe('listMemberProgress', () => {
  it('gives attempts, best score and latest result for each scenario, by title', async () => {
    const { manager, trainee, a, b } = await setup();
    await assessedCall(trainee.actor, a.id, 30, { overallScore: 40, outcomeCorrect: false });
    await assessedCall(trainee.actor, a.id, 20, { overallScore: 90 });
    await assessedCall(trainee.actor, a.id, 10, { overallScore: 60, outcomeCorrect: false });
    await assessedCall(trainee.actor, b.id, 5, { overallScore: 20, outcomeCorrect: false, unsafeOutcome: true });
    const rows = await listMemberProgress(manager.actor, trainee.user.id);
    expect(rows).toHaveLength(2);
    const forA = rows.find(r => r.practiceScenarioId === a.id)!;
    const forB = rows.find(r => r.practiceScenarioId === b.id)!;
    expect(forA).toMatchObject({ title: a.title, attempts: 3, bestScore: 90, latest: 'not_yet' });
    expect(forB).toMatchObject({ attempts: 1, bestScore: 20, latest: 'unsafe' });
    expect(forA.lastCallAt).toBeInstanceOf(Date);
  });

  it('is empty for someone with no calls, a malformed id, or someone in another practice', async () => {
    const mine = await setup();
    const theirs = await setup();
    await assessedCall(theirs.trainee.actor, theirs.a.id, 10, { overallScore: 100 });
    expect(await listMemberProgress(mine.manager.actor, mine.quiet.user.id)).toEqual([]);
    expect(await listMemberProgress(mine.manager.actor, 'not-an-id')).toEqual([]);
    expect(await listMemberProgress(mine.manager.actor, theirs.trainee.user.id)).toEqual([]);
  });

  it('is for managers only', async () => {
    const { trainee, quiet } = await setup();
    await expect(listMemberProgress(trainee.actor, quiet.user.id)).rejects.toThrow(ForbiddenError);
  });
});
