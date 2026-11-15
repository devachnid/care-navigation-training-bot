import { beforeAll, describe, expect, it, vi } from 'vitest';
import { approveScenario, listScenariosForManagement, updateScenario } from '@/scenarios/practice-dal';
import { scenarios as library } from '@/scenarios/seed';
import { pickContent } from '@/scenarios/types';
import { endCall, getDebrief, getSession, startCall } from '@/sessions/dal';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, seedLibrary } from '@/test/fixtures';
import { PROMPT_VERSION } from './prompt';
import { runDebrief } from './run';
import type { DebriefResult } from './rubric';

// No network: the assessor model is replaced, and we capture the prompt it was given.
const prompts: string[] = [];
const s = (score: number) => ({ score, justification: 'ok' });
let answer: DebriefResult | Error;
vi.mock('ai', () => ({
  gateway: (id: string) => ({ id }),
  Output: { object: () => ({}) },
  generateText: async ({ prompt }: { prompt: string }) => {
    prompts.push(prompt);
    if (answer instanceof Error) throw answer;
    return { output: answer };
  },
}));

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
  process.env.DEBRIEF_MODEL = 'test/model';
});

async function finishedCall() {
  const p = await makePractice();
  const approver = await addMember(p.practiceId, 'trainee', true);
  const trainee = await addMember(p.practiceId, 'trainee');
  const angina = (await listScenariosForManagement(p.manager.actor)).find(x => x.libraryScenarioId === 'angina-repeat')!;
  await approveScenario(approver.actor, angina.id, 1);
  const started = await startCall(trainee.actor, angina.id, new Date(Date.now() - 120_000));
  if (!started.ok) throw new Error(started.error);
  await endCall(trainee.actor, started.sessionId, {
    durationSeconds: 100,
    turns: [
      { speaker: 'patient', text: "I'm ringing about my spray." },
      { speaker: 'trainee', text: 'Of course, what is the name please?' },
    ],
  });
  return { ...p, trainee, angina, sessionId: started.sessionId };
}

describe('runDebrief against the database', () => {
  it('judges against the snapshot, stores the prompt version and completes the call', async () => {
    const { manager, trainee, angina, sessionId } = await finishedCall();
    const lib = library.find(x => x.id === 'angina-repeat')!;
    await updateScenario(manager.actor, angina.id, { ...pickContent(lib), correctOutcome: 'EDITED AFTER THE CALL' });
    answer = {
      rubricScores: { greeting: s(2), information: s(1), redFlag: s(2), destination: s(2), role: s(2), explanation: s(1), manner: s(2) },
      outcomeCorrect: true,
      unsafeOutcome: false,
      redFlagHandled: true,
      strengths: [{ point: 'Asked the name', quote: 'what is the name please' }],
      improvements: [],
    };
    await runDebrief(trainee.actor, sessionId);
    expect(prompts.at(-1)).toContain(lib.correctOutcome);
    expect(prompts.at(-1)).not.toContain('EDITED AFTER THE CALL');
    expect(await getDebrief(trainee.actor, sessionId)).toMatchObject({ promptVersion: PROMPT_VERSION, modelUsed: 'test/model', outcomeCorrect: true });
    expect((await getSession(trainee.actor, sessionId))?.status).toBe('complete');
  });

  it('marks the call failed when the model fails', async () => {
    const { trainee, sessionId } = await finishedCall();
    answer = new Error('gateway down');
    await expect(runDebrief(trainee.actor, sessionId)).rejects.toThrow('gateway down');
    expect((await getSession(trainee.actor, sessionId))?.status).toBe('failed');
  });

  it("will not debrief someone else's call", async () => {
    const { manager, trainee, sessionId } = await finishedCall();
    answer = new Error('should not be called');
    const before = prompts.length;
    await expect(runDebrief(manager.actor, sessionId)).rejects.toThrow();
    expect(prompts.length).toBe(before);
    expect((await getSession(trainee.actor, sessionId))?.status).toBe('debriefing');
  });
});
