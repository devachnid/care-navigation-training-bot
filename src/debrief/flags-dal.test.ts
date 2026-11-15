import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { debriefFlags } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { claimForToken, endCall, saveDebrief, startCall } from '@/sessions/dal';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, platformAdmin, seedLibrary } from '@/test/fixtures';
import { FLAG_REASON_MAX, flagDebrief, getMyFlag, listOpenFlags, resolveFlag } from './flags-dal';

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

/** A practice with a trainee who has one debriefed call. */
async function setup() {
  const p = await makePractice();
  const approver = await addMember(p.practiceId, 'trainee', true);
  const trainee = await addMember(p.practiceId, 'trainee', false, 'Trainee One');
  const colleague = await addMember(p.practiceId, 'trainee', false, 'Colleague');
  const angina = (await listScenariosForManagement(p.manager.actor)).find(x => x.libraryScenarioId === 'angina-repeat')!;
  await approveScenario(approver.actor, angina.id, 1);
  const startedAt = new Date(Date.now() - 120_000);
  const started = await startCall(trainee.actor, angina.id, startedAt);
  if (!started.ok) throw new Error(started.error);
  // The voice connection opened (only a connected call can be debriefed).
  await claimForToken(trainee.actor, started.sessionId, startedAt);
  const sessionId = started.sessionId;
  await endCall(trainee.actor, sessionId, {
    durationSeconds: 90,
    turns: [
      { speaker: 'patient', text: 'Hello.' },
      { speaker: 'trainee', text: 'Good morning.' },
    ],
  });
  await saveDebrief(trainee.actor, sessionId, {
    overallScore: 55,
    outcomeCorrect: true,
    unsafeOutcome: false,
    redFlagHandled: null,
    rubricScores: RUBRIC_SCORES,
    strengths: [],
    improvements: [],
    quotedMoments: [],
    modelUsed: 'test',
    promptVersion: 'test',
  });
  return { ...p, approver, trainee, colleague, sessionId };
}

describe('flagDebrief', () => {
  it('stores a report from the caller, and shows it back to them', async () => {
    const { trainee, sessionId } = await setup();
    const r = await flagDebrief(trainee.actor, sessionId, '  It said I missed the red flag but I did not.  ');
    expect(r.ok).toBe(true);
    expect(await getMyFlag(trainee.actor, sessionId)).toMatchObject({
      reason: 'It said I missed the red flag but I did not.',
      resolved: false,
    });
  });

  it('lets a manager of the practice report a debrief of someone else', async () => {
    const { manager, trainee, sessionId } = await setup();
    expect((await flagDebrief(manager.actor, sessionId, 'The score looks wrong.')).ok).toBe(true);
    expect(await getMyFlag(trainee.actor, sessionId)).toBeNull();
  });

  it('needs a reason of 1 to 500 characters', async () => {
    const { trainee, sessionId } = await setup();
    expect(await flagDebrief(trainee.actor, sessionId, '   ')).toMatchObject({ ok: false, code: 'invalid' });
    expect(await flagDebrief(trainee.actor, sessionId, 'x'.repeat(FLAG_REASON_MAX + 1))).toMatchObject({ ok: false, code: 'invalid' });
    expect((await flagDebrief(trainee.actor, sessionId, 'x'.repeat(FLAG_REASON_MAX))).ok).toBe(true);
  });

  it('refuses a second open report from the same person, and allows one after it is dealt with', async () => {
    const { trainee, manager, sessionId } = await setup();
    await flagDebrief(trainee.actor, sessionId, 'First.');
    expect(await flagDebrief(trainee.actor, sessionId, 'Second.')).toMatchObject({ ok: false, code: 'conflict' });
    const [open] = await listOpenFlags(manager.actor);
    await resolveFlag(manager.actor, open.id);
    expect((await flagDebrief(trainee.actor, sessionId, 'Third.')).ok).toBe(true);
  });

  it("is not found for a colleague's call, for another practice, and for a call with no debrief", async () => {
    const { colleague, sessionId, practiceId } = await setup();
    expect(await flagDebrief(colleague.actor, sessionId, 'Not mine.')).toMatchObject({ ok: false, code: 'not_found' });
    const other = await setup();
    expect(await flagDebrief(other.manager.actor, sessionId, 'Not mine.')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await flagDebrief(other.trainee.actor, sessionId, 'Not mine.')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await flagDebrief(colleague.actor, '00000000-0000-4000-8000-000000000000', 'x')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await flagDebrief(colleague.actor, 'nonsense', 'x')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await getDb().select().from(debriefFlags).where(eq(debriefFlags.practiceId, practiceId))).toHaveLength(0);
  });

  it('needs sessions.viewOwn', async () => {
    const { sessionId } = await setup();
    await expect(flagDebrief(await platformAdmin(), sessionId, 'x')).rejects.toThrow(ForbiddenError);
  });
});

describe('getMyFlag', () => {
  it("does not reveal a flag on another practice's call", async () => {
    const { trainee, sessionId } = await setup();
    await flagDebrief(trainee.actor, sessionId, 'Mine.');
    const other = await setup();
    expect(await getMyFlag(other.manager.actor, sessionId)).toBeNull();
  });
});

describe('listOpenFlags and resolveFlag', () => {
  it('lists open reports in the practice for a manager, with who and what', async () => {
    const { manager, trainee, sessionId } = await setup();
    await flagDebrief(trainee.actor, sessionId, 'Wrong score.');
    const flags = await listOpenFlags(manager.actor);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ sessionId, reason: 'Wrong score.', reportedByName: 'Trainee One', callerName: 'Trainee One' });
    expect(flags[0].title.length).toBeGreaterThan(0);
  });

  it('is for managers only', async () => {
    const { trainee } = await setup();
    await expect(listOpenFlags(trainee.actor)).rejects.toThrow(ForbiddenError);
    await expect(resolveFlag(trainee.actor, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(ForbiddenError);
  });

  it("does not list another practice's reports", async () => {
    const mine = await setup();
    const theirs = await setup();
    await flagDebrief(theirs.trainee.actor, theirs.sessionId, 'Theirs.');
    expect(await listOpenFlags(mine.manager.actor)).toHaveLength(0);
    expect(await listOpenFlags(theirs.manager.actor)).toHaveLength(1);
  });

  it("resolving another practice's report is not found, and leaves it open", async () => {
    const mine = await setup();
    const theirs = await setup();
    await flagDebrief(theirs.trainee.actor, theirs.sessionId, 'Theirs.');
    const [flag] = await listOpenFlags(theirs.manager.actor);
    expect(await resolveFlag(mine.manager.actor, flag.id)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await listOpenFlags(theirs.manager.actor)).toHaveLength(1);
  });

  it('resolves once: it drops off the list, shows as resolved to the reporter, and cannot be resolved again', async () => {
    const { manager, trainee, sessionId } = await setup();
    await flagDebrief(trainee.actor, sessionId, 'Wrong score.');
    const [flag] = await listOpenFlags(manager.actor);
    expect((await resolveFlag(manager.actor, flag.id)).ok).toBe(true);
    expect(await listOpenFlags(manager.actor)).toHaveLength(0);
    expect(await getMyFlag(trainee.actor, sessionId)).toMatchObject({ resolved: true });
    expect(await resolveFlag(manager.actor, flag.id)).toMatchObject({ ok: false, code: 'not_found' });
    const [row] = await getDb().select().from(debriefFlags).where(eq(debriefFlags.id, flag.id));
    expect(row.resolvedBy).toBe(manager.user.id);
    expect(await resolveFlag(manager.actor, 'nonsense')).toMatchObject({ ok: false, code: 'not_found' });
  });
});
