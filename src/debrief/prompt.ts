import type { Scenario } from '@/scenarios/types';
import { RUBRIC } from './rubric';

export type TranscriptLine = { speaker: 'trainee' | 'patient'; text: string };

const list = (items: string[]) => (items.length ? items.map(i => `- ${i}`).join('\n') : '- (none)');

export function formatTranscript(turns: TranscriptLine[]): string {
  return turns.map((t, i) => `[${i + 1}] ${t.speaker === 'trainee' ? 'RECEPTIONIST' : 'CALLER'}: ${t.text}`).join('\n');
}

/** Instructions for the assessor model. Separate from, and never shared with, the patient model. */
export function buildDebriefPrompt(scenario: Scenario, turns: TranscriptLine[]): string {
  const hasRedFlag = scenario.redFlags.length > 0;
  return `You assess a training call between a GP surgery receptionist in Wales and a simulated caller. You are the assessor. You are not the caller and you never role-play.

Judge only against the answer key and rubric below. Do not add your own clinical opinion: if the answer key says a destination is correct, it is correct, even if you would have chosen differently. The receptionist is not a clinician and is not expected to diagnose.

The transcript was produced by automatic speech recognition, so ignore small spelling or wording glitches.

SCENARIO: ${scenario.title}
What the caller says unprompted: ${scenario.presentingStory}

Hidden facts, and the kind of question that brings each one out:
${scenario.hiddenFacts.map(h => `- ${h.fact} (comes out when: ${h.unlockedBy})`).join('\n')}

ANSWER KEY
Correct outcome: ${scenario.correctOutcome}
Acceptable alternatives:
${list(scenario.acceptableAlternatives)}
Red flags:
${list(scenario.redFlags)}
Unsafe outcomes:
${list(scenario.unsafeOutcomes)}

RUBRIC
Score each item 0, 1 or 2 (0 = not done, 1 = partly done, 2 = done well) with a one-line justification.
${RUBRIC.map((r, i) => `${i + 1}. ${r.label} (${r.key}): ${r.guide}`).join('\n')}
${
  hasRedFlag
    ? 'This scenario has a red flag. Score redFlag, and set redFlagHandled to true only if the receptionist both found the red flag and acted on it.'
    : 'This scenario has no red flag. Set redFlag to null and redFlagHandled to null.'
}

OUTCOME
- outcomeCorrect is true only if the receptionist directed the caller to the correct outcome or a listed acceptable alternative.
- unsafeOutcome is true if what happened matches a listed unsafe outcome${hasRedFlag ? ', or if the call ended without the red flag being acted on' : ''}. Otherwise false.

FEEDBACK
Give two or three strengths and two or three specific improvements, written directly to the receptionist ("You asked...").
Every strength and improvement must carry a quote copied exactly, word for word, from a single RECEPTIONIST or CALLER line in the transcript. Do not include the line number or speaker label in the quote. If the point is that something was not said, quote the line where it should have happened.
Improvements must come only from the rubric and the answer key. Do not tell the receptionist to give the caller any advice that is not written in the answer key: no first aid, no advice about posture, rest, medication, driving or what to do while waiting. Where the rubric asks for "what to do if things get worse", the only improvement you may suggest is that the receptionist should have told the caller to call back or seek urgent help if they get worse. Do not suggest extra identity or address checks beyond the name and who the call is for.

TRANSCRIPT
${formatTranscript(turns)}`;
}
