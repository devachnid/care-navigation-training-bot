import { generateText, Output, gateway } from 'ai';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { debriefs, scenarios, sessions } from '@/db/schema';
import { getTurns } from '@/sessions/queries';
import { buildDebriefPrompt } from './prompt';
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

/** Scores a finished call. The assessor model only ever sees the transcript and answer key; it never role-plays. */
export async function runDebrief(sessionId: string): Promise<void> {
  const db = getDb();
  const modelId = process.env.DEBRIEF_MODEL;
  try {
    if (!modelId) throw new Error('DEBRIEF_MODEL is not set');
    const [row] = await db
      .select({ scenario: scenarios })
      .from(sessions)
      .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
      .where(eq(sessions.id, sessionId));
    if (!row) throw new Error(`Session ${sessionId} not found`);
    const turns = await getTurns(sessionId);

    const { output } = await generateText({
      model: gateway(modelId),
      output: Output.object({ schema: debriefResultSchema }),
      prompt: buildDebriefPrompt(row.scenario, turns),
    });

    const result = enforceRules(
      output,
      row.scenario.redFlags.length > 0,
      turns.map(t => t.text),
    );

    await db
      .insert(debriefs)
      .values({
        sessionId,
        overallScore: overallScore(result.rubricScores),
        outcomeCorrect: result.outcomeCorrect,
        unsafeOutcome: result.unsafeOutcome,
        redFlagHandled: result.redFlagHandled,
        rubricScores: result.rubricScores,
        strengths: result.strengths,
        improvements: result.improvements,
        quotedMoments: [...result.strengths, ...result.improvements].map(p => p.quote),
        modelUsed: modelId,
      })
      .onConflictDoNothing({ target: debriefs.sessionId });
    await db.update(sessions).set({ status: 'complete' }).where(eq(sessions.id, sessionId));
  } catch (err) {
    console.error('Debrief failed', err);
    await db.update(sessions).set({ status: 'failed' }).where(eq(sessions.id, sessionId));
    throw err;
  }
}

/** A call too short to assess is recorded as a fail with a score of 0. */
export async function recordTooShort(sessionId: string): Promise<void> {
  await getDb()
    .insert(debriefs)
    .values({
      sessionId,
      overallScore: 0,
      outcomeCorrect: false,
      unsafeOutcome: false,
      redFlagHandled: null,
      rubricScores: null,
      strengths: [],
      improvements: [],
      quotedMoments: [],
      modelUsed: 'none (call too short)',
    })
    .onConflictDoNothing({ target: debriefs.sessionId });
}
