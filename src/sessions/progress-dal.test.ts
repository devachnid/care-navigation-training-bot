import { beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { createTestDb } from '@/test/db';
import { getDb } from '@/db/client';
import { memberships } from '@/db/schema';
import { addMember, makePractice, makeUser, platformAdmin, seedLibrary, signedIn } from '@/test/fixtures';
import { claimForToken, endCall, saveDebrief, startCall, type DebriefValues } from './dal';
import { listMyProgress } from './progress-dal';

const RUBRIC_SCORES = {
  greeting: { score: 1, justification: 'ok' },
  information: { score: 1, justification: 'ok' },
  redFlag: null,
  destination: { score: 1, justification: 'ok' },
  role: { score: 1, justification: 'ok' },
  explanation: { score: 1, justification: 'ok' },
  manner: { score: 1, justification: 'ok' },
};

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

/** A finished, debriefed call, started `minutesAgo` minutes ago. */
async function assessedCall(actor: Parameters<typeof startCall>[0], scenarioId: string, minutesAgo: number, over: Partial<DebriefValues>) {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  const started = await startCall(actor, scenarioId, at);
  if (!started.ok) throw new Error(started.error);
  // The voice connection opened (only a connected call can be debriefed).
  await claimForToken(actor, started.sessionId, at);
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
  const all = await listScenariosForManagement(p.manager.actor);
  const [a, b] = [all.find(s => s.libraryScenarioId === 'angina-repeat')!, all.find(s => s.libraryScenarioId === 'sore-throat')!];
  await approveScenario(approver.actor, a.id, 1);
  await approveScenario(approver.actor, b.id, 1);
  return { ...p, approver, trainee, a, b };
}

describe('listMyProgress', () => {
  it('counts attempts, takes the best score and the latest result per scenario', async () => {
    const { trainee, a, b } = await setup();
    await assessedCall(trainee.actor, a.id, 30, { overallScore: 40, outcomeCorrect: false });
    await assessedCall(trainee.actor, a.id, 20, { overallScore: 90, outcomeCorrect: true });
    await assessedCall(trainee.actor, a.id, 10, { overallScore: 60, outcomeCorrect: false });
    await assessedCall(trainee.actor, b.id, 5, { overallScore: 20, outcomeCorrect: false, unsafeOutcome: true });
    const p = await listMyProgress(trainee.actor);
    expect(p.get(a.id)).toMatchObject({ attempts: 3, bestScore: 90, latest: 'not_yet' });
    expect(p.get(b.id)).toMatchObject({ attempts: 1, bestScore: 20, latest: 'unsafe' });
  });

  it('latest follows the most recent call, not the best', async () => {
    const { trainee, a } = await setup();
    await assessedCall(trainee.actor, a.id, 20, { overallScore: 30, outcomeCorrect: false });
    await assessedCall(trainee.actor, a.id, 10, { overallScore: 80, outcomeCorrect: true });
    expect((await listMyProgress(trainee.actor)).get(a.id)).toMatchObject({ attempts: 2, latest: 'passed' });
  });

  it('does not count calls that were never assessed', async () => {
    const { trainee, a } = await setup();
    const started = await startCall(trainee.actor, a.id);
    expect(started.ok).toBe(true);
    expect((await listMyProgress(trainee.actor)).has(a.id)).toBe(false);
  });

  it("shows only the actor's own calls, not a colleague's", async () => {
    const { trainee, approver, manager, a } = await setup();
    await assessedCall(approver.actor, a.id, 10, { overallScore: 100 });
    await assessedCall(manager.actor, a.id, 10, { overallScore: 100 });
    expect((await listMyProgress(trainee.actor)).size).toBe(0);
    expect((await listMyProgress(approver.actor)).get(a.id)?.attempts).toBe(1);
  });

  it("never shows another practice's calls", async () => {
    const mine = await setup();
    const theirs = await setup();
    await assessedCall(theirs.trainee.actor, theirs.a.id, 10, { overallScore: 100 });
    expect((await listMyProgress(mine.trainee.actor)).size).toBe(0);
    expect((await listMyProgress(theirs.manager.actor)).size).toBe(0);
  });

  it('for someone in two practices, shows only the active practice', async () => {
    const one = await setup();
    const two = await setup();
    const user = await makeUser({ name: 'Floater' });
    await getDb()
      .insert(memberships)
      .values([
        { practiceId: one.practiceId, userId: user.id, role: 'trainee' },
        { practiceId: two.practiceId, userId: user.id, role: 'trainee' },
      ]);
    const inOne = (await signedIn(user.id, one.practiceId)).actor;
    const inTwo = (await signedIn(user.id, two.practiceId)).actor;
    await assessedCall(inTwo, two.a.id, 10, { overallScore: 75 });
    expect((await listMyProgress(inOne)).size).toBe(0);
    expect((await listMyProgress(inTwo)).get(two.a.id)?.attempts).toBe(1);
  });

  it('needs sessions.viewOwn', async () => {
    await expect(listMyProgress(await platformAdmin())).rejects.toThrow(ForbiddenError);
  });
});
