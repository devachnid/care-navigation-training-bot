import { generateText, Output, gateway } from 'ai';
import type { Scenario } from '@/scenarios/types';
import { buildDebriefPrompt, type TranscriptLine } from './prompt';
import { keepVerifiedQuotes } from './quotes';
import { debriefResultSchema, type DebriefResult } from './rubric';

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
  const droppedPoints = output.strengths.length + output.improvements.length - result.strengths.length - result.improvements.length;
  return { result, droppedPoints };
}
