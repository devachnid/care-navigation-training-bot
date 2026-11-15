import { generateText, Output, gateway } from 'ai';
import type { Scenario } from '@/scenarios/types';
import { buildDebriefPrompt, type TranscriptLine } from './prompt';
import { keepVerifiedQuotes } from './quotes';
import { MAX_POINTS, debriefResultSchema, type DebriefResult } from './rubric';

/** Rules applied in code after the model answers, so they hold whatever it returns. */
export function enforceRules(result: DebriefResult, scenarioHasRedFlag: boolean, transcriptLines: string[]): DebriefResult {
  const out: DebriefResult = structuredClone(result);
  if (!scenarioHasRedFlag) {
    out.rubricScores.redFlag = null;
    out.redFlagHandled = null;
  } else if (out.redFlagHandled === false && !out.outcomeCorrect) {
    // The red flag was missed and the caller was not sent to the right place: unsafe, whatever the model said.
    // (Reaching the right destination without drawing the red flag out loses marks but is not an unsafe outcome.)
    out.unsafeOutcome = true;
  }
  if (out.unsafeOutcome) out.outcomeCorrect = false;
  out.strengths = keepVerifiedQuotes(out.strengths, transcriptLines).slice(0, MAX_POINTS);
  out.improvements = keepVerifiedQuotes(out.improvements, transcriptLines).slice(0, MAX_POINTS);
  return out;
}

/** What `assessTranscript` returns: the checked result and how many feedback points were dropped for quoting words nobody said. */
export type Assessment = { result: DebriefResult; droppedPoints: number };

/**
 * The whole assessment, with no database: prompt, model call, schema, then `enforceRules`.
 * `runDebrief` and the evaluation runner (`evals/debrief/run.ts`) both use it, so they cannot drift apart.
 */
export async function assessTranscript(scenario: Scenario, turns: TranscriptLine[], modelId: string): Promise<Assessment> {
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
  const verified = (points: DebriefResult['strengths']) => keepVerifiedQuotes(points, turns.map(t => t.text)).length;
  const droppedPoints = output.strengths.length + output.improvements.length - verified(output.strengths) - verified(output.improvements);
  return { result, droppedPoints };
}
