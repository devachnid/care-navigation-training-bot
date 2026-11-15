import { generateText, Output, gateway } from 'ai';
import type { Actor } from '@/policy/actor';
import { getDebriefInput, markDebriefFailed, saveDebrief } from '@/sessions/dal';
import { PROMPT_VERSION, buildDebriefPrompt } from './prompt';
import { keepVerifiedQuotes } from './quotes';
import { debriefResultSchema, overallScore, type DebriefResult } from './rubric';

/** Rules applied in code after the model answers, so they hold whatever it returns. */
export function enforceRules(result: DebriefResult, scenarioHasRedFlag: boolean, transcriptLines: string[]): DebriefResult {
  const out: DebriefResult = structuredClone(result);
  if (!scenarioHasRedFlag) {
    out.rubricScores.redFlag = null;
    out.redFlagHandled = null;
  } else if (out.redFlagHandled === false) {
    // A red flag that was not acted on is unsafe by definition.
    out.unsafeOutcome = true;
  }
  if (out.unsafeOutcome) out.outcomeCorrect = false;
  out.strengths = keepVerifiedQuotes(out.strengths, transcriptLines);
  out.improvements = keepVerifiedQuotes(out.improvements, transcriptLines);
  return out;
}

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

    const { output } = await generateText({
      model: gateway(modelId),
      output: Output.object({ schema: debriefResultSchema }),
      prompt: buildDebriefPrompt(scenario, turns),
    });

    const result = enforceRules(
      output,
      scenario.redFlags.length > 0,
      turns.map(t => t.text),
    );

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
