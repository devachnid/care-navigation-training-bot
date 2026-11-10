import { describe, expect, it } from 'vitest';
import { enforceRules } from './run';
import type { DebriefResult } from './rubric';

const s = (score: number) => ({ score, justification: 'x' });
const base = (over: Partial<DebriefResult> = {}): DebriefResult => ({
  rubricScores: { greeting: s(2), information: s(1), redFlag: s(0), destination: s(0), role: s(2), explanation: s(1), manner: s(2) },
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: false,
  strengths: [
    { point: 'a', quote: 'what is the name please' },
    { point: 'b', quote: 'never said' },
  ],
  improvements: [{ point: 'c', quote: "I've used a lot of it" }],
  ...over,
});
const lines = ['Of course, what is the name please?', "I've used a lot of it lately."];

describe('enforceRules', () => {
  it('marks a missed red flag as unsafe and the outcome as incorrect, whatever the model said', () => {
    const r = enforceRules(base(), true, lines);
    expect(r.unsafeOutcome).toBe(true);
    expect(r.outcomeCorrect).toBe(false);
  });
  it('leaves a handled red flag alone', () => {
    const r = enforceRules(base({ redFlagHandled: true }), true, lines);
    expect(r.unsafeOutcome).toBe(false);
    expect(r.outcomeCorrect).toBe(true);
  });
  it('nulls red flag fields when the scenario has none', () => {
    const r = enforceRules(base(), false, lines);
    expect(r.rubricScores.redFlag).toBeNull();
    expect(r.redFlagHandled).toBeNull();
    expect(r.unsafeOutcome).toBe(false);
  });
  it('drops points whose quote is not in the transcript', () => {
    const r = enforceRules(base(), true, lines);
    expect(r.strengths.map(p => p.point)).toEqual(['a']);
    expect(r.improvements).toHaveLength(1);
  });
  it('does not mutate its input', () => {
    const input = base();
    enforceRules(input, false, lines);
    expect(input.rubricScores.redFlag).not.toBeNull();
  });
});
