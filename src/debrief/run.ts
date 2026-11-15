import type { Actor } from '@/policy/actor';
import { getDebriefInput, markDebriefFailed, saveDebrief } from '@/sessions/dal';
import { assessTranscript } from './assess';
import { PROMPT_VERSION } from './prompt';
import { overallScore } from './rubric';

export { enforceRules, assessTranscript } from './assess';

/**
 * Scores the actor's own finished call (status `debriefing`), judging it against the scenario
 * snapshot taken when the call started, never the scenario as it is now. The assessor model only
 * ever sees the transcript and answer key; it never role-plays. On failure the call is marked
 * `failed` and the error is rethrown.
 */
export async function runDebrief(actor: Actor, sessionId: string): Promise<void> {
  const modelId = process.env.DEBRIEF_MODEL;
  try {
    if (!modelId) throw new Error('DEBRIEF_MODEL is not set');
    const input = await getDebriefInput(actor, sessionId);
    if (!input) throw new Error(`Session ${sessionId} is not awaiting a debrief for this user`);
    const { scenario, turns } = input;

    const { result } = await assessTranscript(scenario, turns, modelId);

    await saveDebrief(actor, sessionId, {
      overallScore: overallScore(result.rubricScores),
      outcomeCorrect: result.outcomeCorrect,
      unsafeOutcome: result.unsafeOutcome,
      redFlagHandled: result.redFlagHandled,
      rubricScores: result.rubricScores,
      strengths: result.strengths,
      improvements: result.improvements,
      quotedMoments: [...result.strengths, ...result.improvements].map(p => p.quote),
      modelUsed: modelId,
      promptVersion: PROMPT_VERSION,
    });
  } catch (err) {
    console.error('Debrief failed', err);
    await markDebriefFailed(actor, sessionId);
    throw err;
  }
}
